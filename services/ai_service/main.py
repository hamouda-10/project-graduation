import os
import shutil
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from pydantic import BaseModel, Field

app = FastAPI(
    title="MeetMind AI Speech & Intelligence Service",
    version="1.0.0",
    description="Python FastAPI service handling speech-to-text, audio normalization, AI summarization, grounded Q&A, and quiz generation."
)

class HealthResponse(BaseModel):
    status: str
    ffmpeg_available: bool
    whisper_engine: str

class TranscriptSegment(BaseModel):
    id: str
    speaker: str
    start_time: float
    end_time: float
    text: str

class TranscriptionResponse(BaseModel):
    detected_language: str
    duration_seconds: float
    segments: List[TranscriptSegment]

class ActionItemModel(BaseModel):
    title: str
    owner_name: Optional[str] = None
    due_date: Optional[str] = None
    priority: str = "medium"

class AnalysisResponse(BaseModel):
    summary: str
    key_points: List[str]
    decisions: List[str]
    topics: List[str]
    action_items: List[ActionItemModel]
    lecture_notes: Optional[str] = None
    key_concepts: Optional[List[dict]] = None
    exam_highlights: Optional[List[str]] = None

class GroundedCitation(BaseModel):
    speaker: str
    timestamp: str
    quote: str

class QuestionAnsweringResponse(BaseModel):
    answer: str
    citations: List[GroundedCitation]

class AskQuestionRequest(BaseModel):
    question: str
    title: str
    segments: List[TranscriptSegment]

@app.get("/health", response_model=HealthResponse)
def health_check():
    ffmpeg_found = shutil.which("ffmpeg") is not None
    return HealthResponse(
        status="healthy",
        ffmpeg_available=ffmpeg_found,
        whisper_engine="local_whisper_v3"
    )

@app.post("/api/v1/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = Form("auto")
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Empty filename provided")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Media file cannot be empty (0 bytes)")

    # Simulate / process transcription segments
    duration = max(30.0, float(len(content)) / 32000.0)
    segments = [
        TranscriptSegment(
            id="seg_py_1",
            speaker="Speaker 1 (Host)",
            start_time=0.0,
            end_time=duration / 2.0,
            text=f"Welcome. Today we review operational objectives and system milestones for {file.filename}."
        ),
        TranscriptSegment(
            id="seg_py_2",
            speaker="Speaker 2 (Participant)",
            start_time=duration / 2.0,
            end_time=duration,
            text="Milestones are validated and verified against the strict latency SLA constraints."
        )
    ]

    return TranscriptionResponse(
        detected_language=language if language != "auto" else "en",
        duration_seconds=duration,
        segments=segments
    )

@app.post("/api/v1/ask", response_model=QuestionAnsweringResponse)
def ask_grounded_question(request: AskQuestionRequest):
    q = request.question.lower()
    matching_segments = [s for s in request.segments if any(word in s.text.lower() for word in q.split() if len(word) > 3)]

    if not matching_segments:
        return QuestionAnsweringResponse(
            answer=f"Based on the verified transcript for '{request.title}', there is no direct evidence to answer '{request.question}'.",
            citations=[]
        )

    citations = [
        GroundedCitation(
            speaker=s.speaker,
            timestamp=f"{int(s.start_time//60)}:{int(s.start_time%60):02d}",
            quote=s.text
        ) for s in matching_segments[:2]
    ]

    return QuestionAnsweringResponse(
        answer=f"The transcript confirms that {citations[0].speaker} noted: '{citations[0].quote}' in response to your inquiry.",
        citations=citations
    )
