# MeetMind AI — Production Deployment Guide

## Architecture Overview

MeetMind AI uses an enterprise polyglot microservice architecture:

1. **Frontend**: React 19, TypeScript, TanStack Start/Router, Tailwind CSS 4.
2. **Backend API**: ASP.NET Core 8.0/10.0 Web API, Entity Framework Core, JWT Bearer Authentication.
3. **Database**: Microsoft SQL Server 2022.
4. **AI Processing Engine**: Python 3.11, FastAPI, Whisper STT, FFmpeg.
5. **Caching & Job Queue**: Redis.

---

## Local Development via Docker Compose

To spin up the entire cluster locally with a single command:

```bash
docker compose up --build -d
```

Services will be accessible at:

- **Web Frontend**: http://localhost:3000
- **ASP.NET Core API**: http://localhost:5000 (Swagger: http://localhost:5000/swagger)
- **Python AI Service**: http://localhost:8000 (Docs: http://localhost:8000/docs)
- **SQL Server**: localhost:1433

---

## Database Migrations (EF Core)

To apply migrations against your SQL Server instance:

```bash
cd backend
dotnet ef database update --project MeetMind.Infrastructure --startup-project MeetMind.Api
```

---

## Production Security Checklist

- **Secrets**: Provide `JWT_SECRET`, database connection passwords, and API keys through cloud secret managers (e.g. Azure Key Vault, AWS Secrets Manager, or GCP Secret Manager).
- **SSL / TLS**: Enforce HTTPS on all external ingress endpoints via reverse proxy (Nginx, Traefik, or Cloudflare).
- **Private Audio Storage**: Audio recordings must be stored in private object storage (AWS S3 with SSE, Azure Blob Storage, or GCP Cloud Storage) using private buckets with presigned, short-lived URLs.
- **RBAC**: Enforce tenant and workspace isolation across all meeting and lecture queries.
