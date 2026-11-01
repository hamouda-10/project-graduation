# MeetMind AI — Troubleshooting Guide

### 1. Media Upload / FFmpeg Issues

**Symptom**: Audio files fail during normalization or duration probe.

- **Cause**: FFmpeg or FFprobe binary missing or corrupted media header.
- **Resolution**: Verify FFmpeg is installed (`which ffmpeg`). The service will fall back to container-level parsing if duration headers are non-standard.

### 2. Audio Processing Stuck in 'Queued'

**Symptom**: Processing job does not transition to 'Transcribing'.

- **Cause**: Worker thread queue congested or file size exceeds container memory limits.
- **Resolution**: Check Redis queue status or inspect the backend processing logs with `docker compose logs -f ai_service`.

### 3. Database Connection Timeouts

**Symptom**: Backend logs indicate SQL Server handshake failures.

- **Cause**: SQL Server container is initializing or password complexity requirement not met.
- **Resolution**: Ensure `SA_PASSWORD` contains upper/lower letters, numbers, and special characters. Wait 10 seconds for initial master database generation.

### 4. Grounded Q&A Returns "No Direct Evidence"

**Symptom**: AI states no direct quotes were found.

- **Cause**: The search query keywords do not appear in the verified spoken segments.
- **Resolution**: Review the transcript in the Transcript Viewer (`/transcript`) to verify the exact spoken phrasing. MeetMind explicitly refrains from hallucinating non-existent facts.
