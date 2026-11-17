import os
import shutil
import sys
import tempfile
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if THIS_DIR not in sys.path:
    sys.path.insert(0, THIS_DIR)

from intelligence import analyze_transcript, answer_grounded_question  # noqa: E402
from transcribe import run_transcription_pipeline  # noqa: E402
from validation import MediaValidationError, probe_media_file, validate_file_descriptor  # noqa: E402

app = FastAPI(
    title="MeetMind AI Speech & Intelligence Service",
    version="2.0.0",
    description=(
        "Python FastAPI AI service handling media validation, FFmpeg audio extraction, "
        "speech-to-text, grounded summarization, keyword/highlight/task extraction, "
        "quiz/flashcard/mindmap generation, and grounded Q&A."
    ),
)


class HealthResponse(BaseModel):
    status: str
    ffmpeg_available: bool
    ffprobe_available: bool
    whisper_engine: str


class MediaValidationResponse(BaseModel):
    valid: bool
    duration_seconds: float
    format_name: str
    codec: str
    sample_rate: int
    channels: int
    has_audio: bool
    has_video: bool
    size_bytes: int


class TranscriptSegment(BaseModel):
    id: str
    speaker: str
    start_time: float
    end_time: float
    text: str
    confidence: Optional[float] = None
    is_partial: bool = False


class TranscriptionResponse(BaseModel):
    detected_language: str
    language_probability: float = 0.0
    duration_seconds: float
    full_text: str
    segments: List[TranscriptSegment]


class AnalyzeRequest(BaseModel):
    title: str
    mode: str = "meeting"  # "meeting" or "lecture"
    course_code: Optional[str] = None
    language: str = "auto"
    segments: List[TranscriptSegment]


class KeywordModel(BaseModel):
    word: str
    frequency: int
    importance: float
    segment_ids: List[str] = Field(default_factory=list)


class TopicModel(BaseModel):
    title: str
    description: str = ""
    timestamp_range: str = ""


class HighlightModel(BaseModel):
    text: str
    category: str = "important_point"
    priority: str = "medium"
    timestamp: str = "00:00"
    speaker: str = ""


class ActionItemModel(BaseModel):
    title: str
    assignee: Optional[str] = None
    deadline_text: str = "Deadline not specified."
    priority: str = "medium"
    source_timestamp: Optional[str] = None


class QuizQuestionModel(BaseModel):
    id: str
    question: str
    type: str = "multiple_choice"
    options: List[str] = Field(default_factory=list)
    correct_option_index: int = 0
    correct_answer_text: Optional[str] = None
    explanation: str = ""
    difficulty: str = "medium"
    source_timestamp: Optional[str] = None


class QuizModel(BaseModel):
    title: str
    course_code: Optional[str] = None
    questions: List[QuizQuestionModel] = Field(default_factory=list)


class FlashcardModel(BaseModel):
    front: str
    back: str
    source_timestamp: Optional[str] = None


class AnalysisResponse(BaseModel):
    mode: str
    executive_summary: str
    detailed_summary: str
    summary: str
    study_notes: Optional[str] = None
    key_points: List[str] = Field(default_factory=list)
    topics: List[TopicModel] = Field(default_factory=list)
    keywords: List[KeywordModel] = Field(default_factory=list)
    highlights: List[HighlightModel] = Field(default_factory=list)
    decisions: List[str] = Field(default_factory=list)
    tasks: List[ActionItemModel] = Field(default_factory=list)
    questions_asked: List[Dict[str, Any]] = Field(default_factory=list)
    key_concepts: List[Dict[str, Any]] = Field(default_factory=list)
    quiz: Optional[QuizModel] = None
    flashcards: List[FlashcardModel] = Field(default_factory=list)
    mind_map: Optional[Dict[str, Any]] = None


class FullProcessResponse(BaseModel):
    transcription: TranscriptionResponse
    analysis: AnalysisResponse


class GroundedCitation(BaseModel):
    speaker: str
    timestamp: str
    quote: str


class QuestionAnsweringResponse(BaseModel):
    answer: str
    evidence_found: bool = True
    citations: List[GroundedCitation] = Field(default_factory=list)


class AskQuestionRequest(BaseModel):
    question: str
    title: str
    segments: List[TranscriptSegment]


async def _persist_upload_temp(file: UploadFile) -> str:
    content = await file.read()
    validate_file_descriptor(
        filename=file.filename or "",
        size_bytes=len(content),
        content_type=file.content_type,
    )
    suffix = os.path.splitext(file.filename or "")[1] or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        return tmp.name


def _to_segment_models(raw_segments: List[Dict[str, Any]]) -> List[TranscriptSegment]:
    return [
        TranscriptSegment(
            id=str(s["id"]),
            speaker=str(s["speaker"]),
            start_time=float(s["startTime"]),
            end_time=float(s["endTime"]),
            text=str(s["text"]),
            confidence=s.get("confidence"),
            is_partial=bool(s.get("isPartial", False)),
        )
        for s in raw_segments
    ]


@app.get("/health", response_model=HealthResponse)
def health_check():
    return HealthResponse(
        status="healthy",
        ffmpeg_available=shutil.which("ffmpeg") is not None,
        ffprobe_available=shutil.which("ffprobe") is not None,
        whisper_engine=os.environ.get("WHISPER_MODEL", "base"),
    )


@app.post("/api/v1/validate", response_model=MediaValidationResponse)
async def validate_media(file: UploadFile = File(...)):
    tmp_path = None
    try:
        tmp_path = await _persist_upload_temp(file)
        meta = probe_media_file(tmp_path)
        return MediaValidationResponse(valid=True, **meta.to_dict())
    except MediaValidationError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/api/v1/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = Form("auto"),
    is_meeting: bool = Form(False),
):
    tmp_path = None
    try:
        tmp_path = await _persist_upload_temp(file)
        result = run_transcription_pipeline(
            input_file=tmp_path,
            language=language or "auto",
            is_meeting=is_meeting,
        )
        return TranscriptionResponse(
            detected_language=result["detected_language"],
            language_probability=float(result.get("language_probability", 0.0)),
            duration_seconds=float(result["duration_seconds"]),
            full_text=result["full_text"],
            segments=_to_segment_models(result["segments"]),
        )
    except MediaValidationError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/api/v1/transcribe-chunk", response_model=TranscriptionResponse)
async def transcribe_chunk(
    file: UploadFile = File(...),
    language: Optional[str] = Form("auto"),
    is_meeting: bool = Form(False),
    offset_seconds: float = Form(0.0),
    is_partial: bool = Form(True),
):
    tmp_path = None
    try:
        tmp_path = await _persist_upload_temp(file)
        result = run_transcription_pipeline(
            input_file=tmp_path,
            language=language or "auto",
            is_meeting=is_meeting,
            offset_seconds=offset_seconds,
            is_partial=is_partial,
        )
        return TranscriptionResponse(
            detected_language=result["detected_language"],
            language_probability=float(result.get("language_probability", 0.0)),
            duration_seconds=float(result["duration_seconds"]),
            full_text=result["full_text"],
            segments=_to_segment_models(result["segments"]),
        )
    except MediaValidationError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/api/v1/analyze", response_model=AnalysisResponse)
def analyze(request: AnalyzeRequest):
    if not request.segments:
        raise HTTPException(status_code=400, detail="Transcript segments are required for analysis.")
    try:
        seg_dicts = [s.model_dump() for s in request.segments]
        result = analyze_transcript(
            title=request.title,
            segments=seg_dicts,
            mode=request.mode if request.mode in ("meeting", "lecture") else "meeting",
            course_code=request.course_code,
            language=request.language,
        )
        return AnalysisResponse(**result)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))


@app.post("/api/v1/process", response_model=FullProcessResponse)
async def process_media_end_to_end(
    file: UploadFile = File(...),
    title: str = Form("Untitled Session"),
    mode: str = Form("meeting"),
    course_code: Optional[str] = Form(None),
    language: str = Form("auto"),
):
    tmp_path = None
    try:
        tmp_path = await _persist_upload_temp(file)
        is_meeting = mode.lower() == "meeting"
        tr_result = run_transcription_pipeline(
            input_file=tmp_path,
            language=language or "auto",
            is_meeting=is_meeting,
        )
        seg_models = _to_segment_models(tr_result["segments"])
        transcription = TranscriptionResponse(
            detected_language=tr_result["detected_language"],
            language_probability=float(tr_result.get("language_probability", 0.0)),
            duration_seconds=float(tr_result["duration_seconds"]),
            full_text=tr_result["full_text"],
            segments=seg_models,
        )
        an_result = analyze_transcript(
            title=title,
            segments=[s.model_dump() for s in seg_models],
            mode="meeting" if is_meeting else "lecture",
            course_code=course_code,
            language=tr_result["detected_language"],
        )
        return FullProcessResponse(
            transcription=transcription,
            analysis=AnalysisResponse(**an_result),
        )
    except MediaValidationError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/api/v1/ask", response_model=QuestionAnsweringResponse)
def ask_grounded_question(request: AskQuestionRequest):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question is required.")
    res = answer_grounded_question(
        question=request.question,
        title=request.title,
        segments=[s.model_dump() for s in request.segments],
    )
    return QuestionAnsweringResponse(**res)
