#!/usr/bin/env python3
"""
MeetMind AI - Media Container, Stream & Audio Integrity Validator
Validates uploaded audio/video containers with ffprobe and extracts normalized 16kHz mono WAV via ffmpeg.
"""

import json
import os
import subprocess
from dataclasses import dataclass, asdict
from typing import Dict, Any, Optional, Tuple

SUPPORTED_AUDIO_EXTENSIONS = {
    ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".opus", ".flac", ".webm", ".wma", ".aiff"
}
SUPPORTED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"}
SUPPORTED_EXTENSIONS = SUPPORTED_AUDIO_EXTENSIONS | SUPPORTED_VIDEO_EXTENSIONS

SUPPORTED_MIME_PREFIXES = (
    "audio/",
    "video/",
    "application/ogg",
    "application/octet-stream",
)

BLOCKED_NON_MEDIA_EXTENSIONS = {
    ".txt", ".md", ".csv", ".json", ".xml", ".html", ".htm", ".css", ".js", ".ts",
    ".py", ".cs", ".java", ".sh", ".bat", ".exe", ".dll", ".zip", ".rar", ".7z",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".bmp", ".webp",
}

MIN_DURATION_SECONDS = 0.5
DEFAULT_MAX_SIZE_MB = int(os.environ.get("MAX_RECORDING_SIZE_MB", "500"))


class MediaValidationError(ValueError):
    """Domain validation error carrying an HTTP status code and user-safe message."""

    def __init__(self, message: str, category: str = "ValidationError", status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.category = category
        self.status_code = status_code


@dataclass
class MediaMetadata:
    duration_seconds: float
    format_name: str
    codec: str
    sample_rate: int
    channels: int
    has_audio: bool
    has_video: bool
    size_bytes: int

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def validate_file_descriptor(
    filename: str,
    size_bytes: int,
    content_type: Optional[str] = None,
    max_size_mb: int = DEFAULT_MAX_SIZE_MB,
) -> None:
    if not filename or not filename.strip():
        raise MediaValidationError("Filename is required.", "ValidationError", 400)

    ext = os.path.splitext(filename)[1].lower()
    if ext in BLOCKED_NON_MEDIA_EXTENSIONS:
        raise MediaValidationError("Unsupported audio format.", "UnsupportedFormat", 400)

    if content_type:
        lowered = content_type.split(";")[0].strip().lower()
        if lowered and not any(lowered.startswith(prefix) for prefix in SUPPORTED_MIME_PREFIXES):
            raise MediaValidationError("Unsupported audio format.", "UnsupportedFormat", 400)

    if size_bytes <= 0:
        raise MediaValidationError("Uploaded media file cannot be empty.", "ValidationError", 400)

    max_bytes = max_size_mb * 1024 * 1024
    if size_bytes > max_bytes:
        raise MediaValidationError("File exceeds the allowed size.", "ValidationError", 413)


def probe_media_file(file_path: str) -> MediaMetadata:
    """Inspect real container and streams with ffprobe. Raises MediaValidationError if invalid/corrupted."""
    if not os.path.exists(file_path):
        raise MediaValidationError("Media file does not exist.", "ValidationError", 400)

    size_bytes = os.path.getsize(file_path)
    if size_bytes <= 0:
        raise MediaValidationError("Uploaded media file cannot be empty.", "ValidationError", 400)

    cmd = [
        "ffprobe",
        "-v", "error",
        "-analyzeduration", "100M",
        "-probesize", "100M",
        "-show_entries",
        "format=duration,format_name,bit_rate:stream=index,codec_type,codec_name,sample_rate,channels,duration",
        "-of", "json",
        file_path,
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60)
    except FileNotFoundError:
        raise MediaValidationError("FFmpeg/FFprobe binary is unavailable on the server.", "FFmpegUnavailable", 503)
    except subprocess.TimeoutExpired:
        raise MediaValidationError("Media container probe timed out.", "TimeoutError", 504)

    if res.returncode != 0:
        raise MediaValidationError("File is corrupted.", "UnsupportedMediaContainer", 422)

    try:
        data = json.loads(res.stdout or "{}")
    except json.JSONDecodeError:
        raise MediaValidationError("File is corrupted.", "UnsupportedMediaContainer", 422)

    format_info = data.get("format") or {}
    streams = data.get("streams") or []
    if not streams:
        raise MediaValidationError("File is corrupted.", "UnsupportedMediaContainer", 422)

    audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
    video_streams = [s for s in streams if s.get("codec_type") == "video"]

    if not audio_streams:
        raise MediaValidationError("Audio stream was not found.", "InvalidAudioStream", 422)

    primary_audio = audio_streams[0]
    try:
        duration = float(format_info.get("duration") or primary_audio.get("duration") or 0.0)
    except (ValueError, TypeError):
        duration = 0.0

    if duration > 0 and duration < MIN_DURATION_SECONDS:
        raise MediaValidationError("Recording is too short.", "ValidationError", 422)

    try:
        sample_rate = int(primary_audio.get("sample_rate") or 16000)
    except (ValueError, TypeError):
        sample_rate = 16000

    try:
        channels = int(primary_audio.get("channels") or 1)
    except (ValueError, TypeError):
        channels = 1

    return MediaMetadata(
        duration_seconds=round(max(duration, 1.0), 2),
        format_name=str(format_info.get("format_name") or "unknown"),
        codec=str(primary_audio.get("codec_name") or "unknown"),
        sample_rate=sample_rate,
        channels=channels,
        has_audio=True,
        has_video=len(video_streams) > 0,
        size_bytes=size_bytes,
    )


def extract_wav_16k_mono(input_path: str, output_wav_path: str, apply_loudnorm: bool = False) -> None:
    """Decode any audio/video container into 16kHz mono PCM WAV for ASR."""
    af_filter = "loudnorm=I=-16:TP=-1.5:LRA=11" if apply_loudnorm else "aformat=channel_layouts=mono"
    cmd = [
        "ffmpeg", "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-err_detect", "ignore_err",
        "-fflags", "+genpts+igndts+discardcorrupt",
        "-analyzeduration", "100M",
        "-probesize", "100M",
        "-i", input_path,
        "-vn",
        "-ar", "16000",
        "-ac", "1",
        "-af", af_filter,
        "-c:a", "pcm_s16le",
        output_wav_path,
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=300)
    except FileNotFoundError:
        raise MediaValidationError("FFmpeg binary is unavailable on the server.", "FFmpegUnavailable", 503)
    except subprocess.TimeoutExpired:
        raise MediaValidationError("Audio normalization timed out.", "TimeoutError", 504)

    if res.returncode != 0 or not os.path.exists(output_wav_path) or os.path.getsize(output_wav_path) == 0:
        raise MediaValidationError("Audio decoding failed: unsupported or corrupted container.", "UnsupportedMediaContainer", 422)


def measure_audio_volume(wav_path: str) -> Tuple[float, float, bool]:
    """Measure max and mean volume in dB using ffmpeg volumedetect."""
    cmd = ["ffmpeg", "-i", wav_path, "-af", "volumedetect", "-f", "null", "-"]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    max_vol = -99.0
    mean_vol = -99.0
    for line in (res.stderr or "").splitlines():
        if "max_volume:" in line:
            try:
                max_vol = float(line.split("max_volume:")[1].replace("dB", "").strip())
            except ValueError:
                pass
        elif "mean_volume:" in line:
            try:
                mean_vol = float(line.split("mean_volume:")[1].replace("dB", "").strip())
            except ValueError:
                pass
    is_silent = max_vol <= -55.0
    return max_vol, mean_vol, is_silent
