from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "ffmpeg_available" in data
    assert "ffprobe_available" in data


def test_transcribe_empty_file_rejected():
    files = {"file": ("empty.wav", b"", "audio/wav")}
    response = client.post("/api/v1/transcribe", files=files)
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_transcribe_unsupported_format_rejected():
    files = {"file": ("notes.txt", b"hello world", "text/plain")}
    response = client.post("/api/v1/transcribe", files=files)
    assert response.status_code == 400
    assert "unsupported" in response.json()["detail"].lower()


def test_transcribe_corrupted_file_rejected():
    files = {"file": ("bad.wav", b"not-a-valid-wav-container", "audio/wav")}
    response = client.post("/api/v1/transcribe", files=files)
    assert response.status_code in (400, 422)


def test_analyze_meeting_mode():
    payload = {
        "title": "Architecture Sync",
        "mode": "meeting",
        "language": "en",
        "segments": [
            {
                "id": "s1",
                "speaker": "Speaker 1",
                "start_time": 0.0,
                "end_time": 12.0,
                "text": "We decided to deploy the new microservice pipeline by Friday.",
            },
            {
                "id": "s2",
                "speaker": "Speaker 2",
                "start_time": 13.0,
                "end_time": 25.0,
                "text": "Omar must prepare the database migration script before deployment.",
            },
        ],
    }
    response = client.post("/api/v1/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "meeting"
    assert len(data["decisions"]) >= 1
    assert len(data["tasks"]) >= 1
    assert len(data["keywords"]) >= 1


def test_grounded_ask_with_citations():
    payload = {
        "question": "What is the milestone deadline?",
        "title": "Roadmap Sync",
        "segments": [
            {
                "id": "s1",
                "speaker": "Speaker 1",
                "start_time": 10.0,
                "end_time": 25.0,
                "text": "The primary milestone deadline is set for November 15th.",
            }
        ],
    }
    response = client.post("/api/v1/ask", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["evidence_found"] is True
    assert len(data["citations"]) > 0
    assert "November 15th" in data["citations"][0]["quote"]


def test_grounded_ask_missing_fact_refuses_hallucination():
    payload = {
        "question": "What is the CEO password?",
        "title": "Roadmap Sync",
        "segments": [
            {
                "id": "s1",
                "speaker": "Speaker 1",
                "start_time": 10.0,
                "end_time": 25.0,
                "text": "The primary milestone deadline is set for November 15th.",
            }
        ],
    }
    response = client.post("/api/v1/ask", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["evidence_found"] is False
    assert "Not mentioned" in data["answer"]
