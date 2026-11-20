#!/usr/bin/env python3
"""
Standard-library unittest suite testing real FFmpeg/FFprobe validation, video audio extraction,
chunking, zero-fake-transcript enforcement, grounded analysis, and grounded Q&A.
"""

import os
import subprocess
import sys
import tempfile
import unittest

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if THIS_DIR not in sys.path:
    sys.path.insert(0, THIS_DIR)

from intelligence import analyze_transcript, answer_grounded_question
from transcribe import format_speaker_segments, run_transcription_pipeline
from validation import MediaValidationError, extract_wav_16k_mono, probe_media_file, validate_file_descriptor


class TestMeetMindAiPipeline(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp(prefix="mm_test_")

    def tearDown(self):
        for root, dirs, files in os.walk(self.tmpdir, topdown=False):
            for f in files:
                os.unlink(os.path.join(root, f))
            for d in dirs:
                os.rmdir(os.path.join(root, d))
        os.rmdir(self.tmpdir)

    def _make_wav(self, name: str, duration: float, frequency: int = 440, silent: bool = False) -> str:
        path = os.path.join(self.tmpdir, name)
        src = "anullsrc=r=16000:cl=mono" if silent else f"sine=frequency={frequency}:duration={duration}"
        cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", src, "-t", str(duration), "-ar", "16000", "-ac", "1", path]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return path

    def test_validate_descriptor_rejects_empty_and_bad_extensions(self):
        with self.assertRaises(MediaValidationError) as ctx1:
            validate_file_descriptor("audio.wav", 0, "audio/wav")
        self.assertEqual(ctx1.exception.status_code, 400)

        with self.assertRaises(MediaValidationError) as ctx2:
            validate_file_descriptor("notes.pdf", 1024, "application/pdf")
        self.assertIn("Unsupported audio format", ctx2.exception.message)

    def test_unfamiliar_extension_with_real_audio_is_accepted(self):
        validate_file_descriptor("voice_memo.aud", 4096, "application/octet-stream")
        wav_path = self._make_wav("voice_memo.wav", 2.0)
        aud_path = os.path.join(self.tmpdir, "voice_memo.aud")
        os.rename(wav_path, aud_path)
        meta = probe_media_file(aud_path)
        self.assertTrue(meta.has_audio)
        self.assertGreaterEqual(meta.duration_seconds, 1.5)

    def test_probe_rejects_corrupted_file(self):
        corrupted = os.path.join(self.tmpdir, "broken.mp3")
        with open(corrupted, "wb") as f:
            f.write(b"NOT_A_REAL_MEDIA_CONTAINER_BYTES")
        with self.assertRaises(MediaValidationError) as ctx:
            probe_media_file(corrupted)
        self.assertEqual(ctx.exception.message, "File is corrupted.")

    def test_probe_rejects_too_short_audio(self):
        short_wav = self._make_wav("short.wav", 0.15)
        with self.assertRaises(MediaValidationError) as ctx:
            probe_media_file(short_wav)
        self.assertEqual(ctx.exception.message, "Recording is too short.")

    def test_probe_rejects_video_without_audio_stream(self):
        no_audio_mp4 = os.path.join(self.tmpdir, "video_only.mp4")
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=160x120:d=2", no_audio_mp4],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
        with self.assertRaises(MediaValidationError) as ctx:
            probe_media_file(no_audio_mp4)
        self.assertEqual(ctx.exception.message, "Audio stream was not found.")

    def test_video_with_audio_extracts_normalized_wav(self):
        mp4_path = os.path.join(self.tmpdir, "lecture.mp4")
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", "color=c=black:s=160x120:d=2",
                "-f", "lavfi", "-i", "sine=frequency=520:duration=2",
                "-shortest", mp4_path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
        meta = probe_media_file(mp4_path)
        self.assertTrue(meta.has_audio)
        self.assertTrue(meta.has_video)
        self.assertGreaterEqual(meta.duration_seconds, 1.5)

        out_wav = os.path.join(self.tmpdir, "extracted.wav")
        extract_wav_16k_mono(mp4_path, out_wav)
        wav_meta = probe_media_file(out_wav)
        self.assertEqual(wav_meta.sample_rate, 16000)
        self.assertEqual(wav_meta.channels, 1)

    def test_silent_audio_with_zero_asr_segments_raises_instead_of_fake_text(self):
        silent_wav = self._make_wav("silent.wav", 2.0, silent=True)

        def empty_asr(_path, language_code="auto"):
            return {"detected_language": "ar", "language_probability": 0.9, "raw_segments": []}

        with self.assertRaises(MediaValidationError) as ctx:
            run_transcription_pipeline(silent_wav, language="ar", is_meeting=True, asr_fn=empty_asr)
        self.assertEqual(ctx.exception.message, "No audible speech detected in the recording.")

    def test_pipeline_with_asr_preserves_timestamps_and_neutral_speakers(self):
        tone_wav = self._make_wav("speech.wav", 3.0)

        def mock_asr(_path, language_code="auto"):
            return {
                "detected_language": "en",
                "language_probability": 0.98,
                "raw_segments": [
                    {"start": 0.2, "end": 1.4, "text": "We agreed to finalize the API contract.", "confidence": 0.94},
                    {"start": 3.5, "end": 5.0, "text": "Please verify the database index before Friday.", "confidence": 0.91},
                ],
            }

        res = run_transcription_pipeline(tone_wav, language="en", is_meeting=True, asr_fn=mock_asr)
        self.assertTrue(res["success"])
        self.assertEqual(res["detected_language"], "en")
        self.assertEqual(len(res["segments"]), 2)
        self.assertEqual(res["segments"][0]["speaker"], "Speaker 1")
        self.assertEqual(res["segments"][1]["speaker"], "Speaker 2")

    def test_grounded_analysis_and_qa_no_hallucination(self):
        segments = [
            {
                "id": "seg_1",
                "speaker": "المحاضر",
                "start_time": 12.0,
                "end_time": 30.0,
                "text": "تعريف النظام الموزع مهمة جداً في الامتحان النهائي ويجب مراجعة الخوارزمية.",
            },
            {
                "id": "seg_2",
                "speaker": "المحاضر",
                "start_time": 35.0,
                "end_time": 55.0,
                "text": "تقرر اعتماد بروتوكول Raft لضمان التوافق بين الخوادم.",
            },
        ]
        analysis = analyze_transcript("Distributed Systems", segments, mode="lecture", course_code="CS 6410")
        self.assertEqual(analysis["mode"], "lecture")
        self.assertTrue(len(analysis["keywords"]) > 0)
        self.assertTrue(len(analysis["highlights"]) > 0)
        self.assertTrue(len(analysis["quiz"]["questions"]) >= 2)
        # Missing deadline must never be fabricated
        for task in analysis["tasks"]:
            self.assertEqual(task["deadline_text"], "Deadline not specified.")

        qa_hit = answer_grounded_question("What about Raft?", "Distributed Systems", segments)
        self.assertTrue(qa_hit["evidence_found"])
        self.assertTrue(len(qa_hit["citations"]) >= 1)

        qa_miss = answer_grounded_question("What was the budget in dollars?", "Distributed Systems", segments)
        self.assertFalse(qa_miss["evidence_found"])
        self.assertIn("Not mentioned", qa_miss["answer"])


if __name__ == "__main__":
    unittest.main()
