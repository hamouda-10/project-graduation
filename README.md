# MeetMind AI — Intelligent Meeting & Lecture Platform

MeetMind AI transforms spoken audio from business meetings and academic lectures into searchable, structured, and actionable knowledge.

---

## 🌟 Key Capabilities

### 🏢 Business Meetings

- **Verifiable Speech-to-Text**: High-accuracy timestamped transcript segments with speaker attribution.
- **Executive Summaries**: AI-synthesized overviews, discussion points, and agreed decisions.
- **Action Items Tracking**: Extracted tasks with owners, priorities, and deadlines.
- **Grounded Q&A**: Question answering grounded exclusively in spoken transcripts with timestamped citations.

### 🎓 Educational Lectures

- **Structured Study Notes**: Comprehensive lecture notes highlighting fundamental theories and invariants.
- **Key Concepts & Definitions**: Explicit glossary of technical terms.
- **Exam-Focus Alerts**: Highlighting emphasized topics for midterms and finals.
- **Interactive Quizzes**: Auto-generated practice quizzes with validated answer keys and source-grounded explanations.
- **3D Spaced-Repetition Flashcards**: Interactive flip flashcards with mastery tracking.
- **Concept Mind Maps**: Hierarchical visual node trees showing relationship connections.

---

## 🏗️ Architecture

- **Web Frontend**: React 19, TypeScript, TanStack Start & Router, Tailwind CSS 4, shadcn/ui.
- **Backend API**: ASP.NET Core 8.0/10.0 Web API, Entity Framework Core with SQL Server.
- **AI & Speech Service**: Python 3.11, FastAPI, Whisper STT, FFmpeg.
- **Database**: Microsoft SQL Server 2022.
- **Queue & Caching**: Redis.

---

## 🚀 Quick Start (Development & Local)

### 1. Web Application (In-App Preview)

```bash
npm install
npm run dev
```

The dev server starts on port `3000` with the embedded persistent API engine and database active.

### 2. Multi-Container Cluster (Docker Compose)

```bash
docker compose up --build -d
```

- Web Application: http://localhost:3000
- ASP.NET Core API & Swagger: http://localhost:5000/swagger
- Python AI Service: http://localhost:8000/docs
- Microsoft SQL Server: localhost:1433

---

## 🧪 Testing

- **Frontend Typecheck & Build**: `npm run build`
- **Linting & Code Style**: `npm run lint` && `npm run format`
- **Python AI Service Tests**: `pytest services/ai_service/test_ai_service.py`
- **Backend .NET Tests**: `dotnet test backend/MeetMind.Tests`
