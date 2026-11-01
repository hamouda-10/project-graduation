from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "ffmpeg_available" in data
    assert data["whisper_engine"] == "local_whisper_v3"

def test_transcribe_empty_file_rejected():
    files = {"file": ("empty.wav", b"", "audio/wav")}
    response = client.post("/api/v1/transcribe", files=files)
    assert response.status_code == 400
    assert "cannot be empty" in response.json()["detail"]

def test_transcribe_valid_file():
    files = {"file": ("audio.wav", b"RIFF....WAVEfmt ....data....", "audio/wav")}
    response = client.post("/api/v1/transcribe", files=files, data={"language": "en"})
    assert response.status_code == 200
    data = response.json()
    assert data["detected_language"] == "en"
    assert len(data["segments"]) > 0

def test_grounded_ask_with_citations():
    payload = {
        "question": "What is the milestone deadline?",
        "title": "Roadmap Sync",
        "segments": [
            {
                "id": "s1",
                "speaker": "Host",
                "start_time": 10.0,
                "end_time": 25.0,
                "text": "The primary milestone deadline is set for November 15th."
            }
        ]
    }
    response = client.post("/api/v1/ask", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["citations"]) > 0
    assert "November 15th" in data["citations"][0]["quote"]
