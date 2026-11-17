#!/usr/bin/env python3
"""
MeetMind AI - Production Speech-to-Text Engine
Powered by faster-whisper (CTranslate2) with FFmpeg validation, audio extraction,
chunking with overlap deduplication, silence rejection, and optional Gemini ASR fallback.
"""

import argparse
import base64
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

# Ensure workspace packages directory & local directory are importable
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if THIS_DIR not in sys.path:
    sys.path.insert(0, THIS_DIR)
PACKAGES_DIR = os.path.abspath(os.path.join(THIS_DIR, "packages"))
if os.path.exists(PACKAGES_DIR) and PACKAGES_DIR not in sys.path:
    sys.path.insert(0, PACKAGES_DIR)

MODELS_DIR = os.environ.get("WHISPER_MODELS_DIR", "/tmp/meetmind_ai_models")
os.makedirs(MODELS_DIR, exist_ok=True)
os.environ["HF_HUB_CACHE"] = MODELS_DIR
os.environ["HUGGINGFACE_HUB_CACHE"] = MODELS_DIR

from validation import (  # noqa: E402
    MediaValidationError,
    extract_wav_16k_mono,
    measure_audio_volume,
    probe_media_file,
)


def split_wav_into_overlapping_chunks(
    wav_path: str,
    chunk_dir: str,
    duration_seconds: float,
    chunk_duration_sec: int = 180,
    overlap_sec: int = 2,
) -> List[Dict[str, Any]]:
    """Split a long WAV file into bounded chunks with small overlap to preserve boundary words."""
    os.makedirs(chunk_dir, exist_ok=True)
    if duration_seconds <= chunk_duration_sec + 10:
        return [{"chunk_index": 0, "path": wav_path, "offset": 0.0}]

    chunks: List[Dict[str, Any]] = []
    start = 0.0
    idx = 0
    while start < duration_seconds:
        chunk_len = min(chunk_duration_sec + overlap_sec, duration_seconds - start + 0.5)
        out_path = os.path.join(chunk_dir, f"chunk_{idx:03d}.wav")
        cmd = [
            "ffmpeg", "-y",
            "-ss", f"{start:.2f}",
            "-t", f"{chunk_len:.2f}",
            "-i", wav_path,
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            out_path,
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 0:
            chunks.append({"chunk_index": idx, "path": out_path, "offset": round(start, 2)})
        if start + chunk_duration_sec >= duration_seconds:
            break
        start += chunk_duration_sec
        idx += 1
    return chunks


def _transcribe_with_faster_whisper(
    wav_path: str,
    language_code: Optional[str] = "auto",
    model_size: Optional[str] = None,
) -> Dict[str, Any]:
    from faster_whisper import WhisperModel

    chosen_model = model_size or os.environ.get("WHISPER_MODEL", "base")
    lang = None
    if language_code and language_code not in ("auto", "mixed"):
        if "ar" in language_code.lower():
            lang = "ar"
        elif "en" in language_code.lower():
            lang = "en"
        else:
            lang = language_code

    if lang == "ar" or language_code in ("auto", "mixed", None):
        initial_prompt = (
            "محاضرة جامعية أو اجتماع عمل، نقاش واضح، مصطلحات علمية وتقنية: "
            "AI, API, React, .NET, Python, SQL, Docker, SignalR."
        )
    else:
        initial_prompt = (
            "University lecture or business meeting discussion covering AI, API, React, "
            ".NET, Python, SQL, Docker, SignalR."
        )

    try:
        model = WhisperModel(chosen_model, device="cpu", compute_type="int8", download_root=MODELS_DIR)
    except Exception:
        model = WhisperModel("tiny", device="cpu", compute_type="int8", download_root=MODELS_DIR)

    segments_gen, info = model.transcribe(
        wav_path,
        language=lang,
        beam_size=2,
        best_of=2,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=400),
        initial_prompt=initial_prompt,
        temperature=0.0,
    )

    raw_segments = []
    for s in segments_gen:
        txt = s.text.strip()
        if not txt:
            continue
        avg_logprob = getattr(s, "avg_logprob", -0.35)
        confidence = round(max(0.05, min(0.99, math.exp(avg_logprob))), 3)
        raw_segments.append({
            "start": round(float(s.start), 2),
            "end": round(float(s.end), 2),
            "text": txt,
            "confidence": confidence,
        })

    return {
        "detected_language": getattr(info, "language", lang or "auto") or "auto",
        "language_probability": round(float(getattr(info, "language_probability", 0.9)), 4),
        "raw_segments": raw_segments,
    }


def _transcribe_with_gemini_rest(
    wav_path: str,
    language_code: Optional[str] = "auto",
) -> Optional[Dict[str, Any]]:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    with open(wav_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")

    asr_model = os.environ.get("GEMINI_TRANSCRIBE_MODEL", "gemini-3.5-transcribe")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{asr_model}:generateContent?key={api_key}"
    prompt = (
        "Transcribe this audio faithfully verbatim in its original spoken language without inventing or omitting words. "
        f"Language hint: {language_code or 'auto'}. "
        "Return ONLY the spoken words or [SILENCE] if there is no speech."
    )
    payload = {
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": "audio/wav", "data": b64}},
                {"text": prompt},
            ]
        }]
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            raw_text = str(body["candidates"][0]["content"]["parts"][0]["text"] or "").strip()
            if not raw_text or "[silence]" in raw_text.lower() or "[صمت]" in raw_text:
                return None

            detected = "ar" if re.search(r"[\u0600-\u06FF]", raw_text) else "en"
            sentences = [
                s.strip()
                for s in re.split(r"(?<=[.!?؟])\s+|\n+", raw_text)
                if s.strip()
            ] or [raw_text]
            meta = probe_media_file(wav_path)
            total_dur = max(1.0, float(meta.duration_seconds or len(sentences) * 4.0))
            step = total_dur / max(1, len(sentences))
            segs = [
                {
                    "start": round(idx * step, 2),
                    "end": round((idx + 1) * step, 2),
                    "text": sentence,
                    "confidence": 0.9,
                }
                for idx, sentence in enumerate(sentences)
            ]
            return {
                "detected_language": detected,
                "language_probability": 0.9,
                "raw_segments": segs,
            }
    except (urllib.error.URLError, json.JSONDecodeError, KeyError, IndexError, TimeoutError, MediaValidationError):
        return None


def transcribe_audio_file(
    wav_path: str,
    language_code: Optional[str] = "auto",
    model_size: Optional[str] = None,
) -> Dict[str, Any]:
    """Run real speech-to-text using faster-whisper, or Gemini REST ASR when configured."""
    try:
        return _transcribe_with_faster_whisper(wav_path, language_code=language_code, model_size=model_size)
    except ImportError:
        gemini_res = _transcribe_with_gemini_rest(wav_path, language_code=language_code)
        if gemini_res:
            return gemini_res
        raise MediaValidationError(
            "Speech recognition engine is not installed (faster-whisper or GEMINI_API_KEY required).",
            "AiServiceUnavailable",
            503,
        )


def format_speaker_segments(
    raw_segments: List[Dict[str, Any]],
    is_meeting: bool = False,
    detected_language: str = "ar",
    is_partial: bool = False,
) -> List[Dict[str, Any]]:
    """Format segments with neutral speaker turn labels (never inventing speaker identities)."""
    formatted: List[Dict[str, Any]] = []
    current_speaker_idx = 1
    last_end = 0.0
    is_ar = str(detected_language or "").lower().startswith("ar")

    for i, seg in enumerate(raw_segments):
        start = float(seg["start"])
        end = max(float(seg["end"]), start + 0.2)
        text = str(seg["text"]).strip()
        if not text:
            continue

        # Deduplicate overlapping chunk boundary segments
        if formatted and abs(formatted[-1]["endTime"] - start) < 2.2:
            prev_text = formatted[-1]["text"]
            if text == prev_text or text in prev_text:
                continue

        if is_meeting and (start - last_end) > 1.8 and last_end > 0:
            current_speaker_idx = (current_speaker_idx % 3) + 1

        if is_meeting:
            speaker_name = f"المتحدث {current_speaker_idx}" if is_ar else f"Speaker {current_speaker_idx}"
        else:
            speaker_name = "المحاضر" if is_ar else "Instructor"

        formatted.append({
            "id": f"seg_{i + 1}",
            "speaker": speaker_name,
            "startTime": round(start, 2),
            "endTime": round(end, 2),
            "text": text,
            "confidence": seg.get("confidence", 0.85),
            "isPartial": is_partial,
        })
        last_end = end

    return formatted


def run_transcription_pipeline(
    input_file: str,
    language: str = "auto",
    is_meeting: bool = False,
    offset_seconds: float = 0.0,
    is_partial: bool = False,
    asr_fn=None,
) -> Dict[str, Any]:
    """Validate media, extract normalized audio, split if long, and run real ASR without fake fallbacks."""
    metadata = probe_media_file(input_file)

    work_dir = tempfile.mkdtemp(prefix="meetmind_asr_")
    temp_wav = os.path.join(work_dir, "normalized.wav")
    chunks_dir = os.path.join(work_dir, "chunks")

    try:
        try:
            extract_wav_16k_mono(input_file, temp_wav, apply_loudnorm=False)
        except MediaValidationError:
            extract_wav_16k_mono(input_file, temp_wav, apply_loudnorm=True)

        max_vol, mean_vol, is_silent = measure_audio_volume(temp_wav)
        asr_callable = asr_fn or transcribe_audio_file

        chunks = split_wav_into_overlapping_chunks(temp_wav, chunks_dir, metadata.duration_seconds)
        all_raw: List[Dict[str, Any]] = []
        detected_lang = language if language not in ("auto", "mixed") else "auto"
        lang_prob = 0.0

        for ch in chunks:
            asr_res = asr_callable(ch["path"], language_code=language)
            if asr_res.get("detected_language"):
                detected_lang = asr_res["detected_language"]
            lang_prob = max(lang_prob, float(asr_res.get("language_probability", 0.0)))
            chunk_offset = float(ch["offset"]) + float(offset_seconds)
            for s in asr_res.get("raw_segments") or []:
                all_raw.append({
                    "start": round(float(s["start"]) + chunk_offset, 2),
                    "end": round(float(s["end"]) + chunk_offset, 2),
                    "text": s["text"],
                    "confidence": s.get("confidence", 0.85),
                })

        if not all_raw and not is_silent:
            loud_wav = os.path.join(work_dir, "loudnorm.wav")
            extract_wav_16k_mono(input_file, loud_wav, apply_loudnorm=True)
            retry_res = asr_callable(loud_wav, language_code=language)
            detected_lang = retry_res.get("detected_language", detected_lang)
            lang_prob = float(retry_res.get("language_probability", lang_prob))
            for s in retry_res.get("raw_segments") or []:
                all_raw.append({
                    "start": round(float(s["start"]) + float(offset_seconds), 2),
                    "end": round(float(s["end"]) + float(offset_seconds), 2),
                    "text": s["text"],
                    "confidence": s.get("confidence", 0.85),
                })

        if not all_raw:
            raise MediaValidationError(
                "No audible speech detected in the recording.",
                "ValidationError",
                422,
            )

        segments = format_speaker_segments(
            all_raw,
            is_meeting=is_meeting,
            detected_language=detected_lang,
            is_partial=is_partial,
        )
        full_text = "\n\n".join(f"{s['speaker']}:\n{s['text']}" for s in segments)

        return {
            "success": True,
            "detected_language": detected_lang,
            "language_probability": lang_prob,
            "duration_seconds": metadata.duration_seconds,
            "format_name": metadata.format_name,
            "codec": metadata.codec,
            "channels": metadata.channels,
            "sample_rate": metadata.sample_rate,
            "max_volume_db": max_vol,
            "segments": segments,
            "full_text": full_text,
        }
    finally:
        for root, dirs, files in os.walk(work_dir, topdown=False):
            for name in files:
                try:
                    os.unlink(os.path.join(root, name))
                except OSError:
                    pass
            for name in dirs:
                try:
                    os.rmdir(os.path.join(root, name))
                except OSError:
                    pass
        try:
            os.rmdir(work_dir)
        except OSError:
            pass


def main():
    parser = argparse.ArgumentParser(description="MeetMind AI Speech Recognition Engine")
    parser.add_argument("audio_path", help="Path to input audio/video file")
    parser.add_argument("--language", default="auto", help="Language code (auto, ar, en, ar-EG, etc.)")
    parser.add_argument("--meeting", action="store_true", help="Set flag for meeting context")
    parser.add_argument("--output", default=None, help="Optional output JSON file path")
    args = parser.parse_args()

    try:
        result = run_transcription_pipeline(
            input_file=args.audio_path,
            language=args.language,
            is_meeting=args.meeting,
        )
        json_output = json.dumps(result, ensure_ascii=False, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(json_output)
        print(json_output)
    except Exception as e:
        err_res = {
            "success": False,
            "error": str(e),
            "category": getattr(e, "category", "UnexpectedError"),
        }
        print(json.dumps(err_res, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
