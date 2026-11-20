using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using MeetMind.Api.Hubs;
using MeetMind.Api.Services;
using MeetMind.Core.Entities;
using MeetMind.Core.Enums;
using MeetMind.Infrastructure.Data;

namespace MeetMind.Api.Controllers
{
    [ApiController]
    [Route("api/v1/[controller]")]
    public class RecordingsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IMediaValidationService _validator;
        private readonly IBackgroundProcessingQueue _queue;
        private readonly IAiServiceClient _aiClient;
        private readonly ICurrentUserService _currentUser;
        private readonly IHubContext<ProcessingHub, IProcessingClient> _hub;
        private readonly string _recordingsDir;
        private readonly string _chunkUploadsDir;

        public RecordingsController(
            ApplicationDbContext db,
            IMediaValidationService validator,
            IBackgroundProcessingQueue queue,
            IAiServiceClient aiClient,
            ICurrentUserService currentUser,
            IHubContext<ProcessingHub, IProcessingClient> hub,
            IConfiguration configuration)
        {
            _db = db;
            _validator = validator;
            _queue = queue;
            _aiClient = aiClient;
            _currentUser = currentUser;
            _hub = hub;
            var configuredDir = configuration["Storage:RecordingsDirectory"]
                ?? Environment.GetEnvironmentVariable("RECORDINGS_STORAGE_PATH")
                ?? "/app/data/recordings";
            _recordingsDir = EnsureWritableDirectory(configuredDir, Path.Combine(Path.GetTempPath(), "meetmind-data", "recordings"));
            _chunkUploadsDir = EnsureWritableDirectory(
                Path.Combine(Path.GetDirectoryName(_recordingsDir) ?? _recordingsDir, "chunk_uploads"),
                Path.Combine(Path.GetTempPath(), "meetmind-data", "chunk_uploads"));
        }

        private static string EnsureWritableDirectory(string primary, string fallback)
        {
            foreach (var candidate in new[] { primary, fallback })
            {
                try
                {
                    Directory.CreateDirectory(candidate);
                    var probe = Path.Combine(candidate, $".write_probe_{Guid.NewGuid():N}");
                    System.IO.File.WriteAllText(probe, "ok");
                    System.IO.File.Delete(probe);
                    return candidate;
                }
                catch
                {
                    // Try fallback directory
                }
            }
            return fallback;
        }

        [HttpPost("upload")]
        [RequestSizeLimit(524_288_000)]
        [RequestFormLimits(MultipartBodyLengthLimit = 524_288_000, ValueLengthLimit = int.MaxValue, MultipartHeadersLengthLimit = 65_536)]
        public async Task<IActionResult> UploadRecording(
            [FromForm] IFormFile file,
            [FromForm] string? type = "meeting",
            [FromForm] string? title = null,
            [FromForm] string? courseCode = null,
            [FromForm] string? language = "auto",
            CancellationToken ct = default)
        {
            var correlationId = HttpContext.TraceIdentifier;
            if (file == null)
            {
                return BadRequest(new { error = "Audio or video file is required.", category = "EmptyFile", correlationId });
            }

            var idempotencyKey = Request.Headers["Idempotency-Key"].FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(idempotencyKey))
            {
                var existingJob = await _db.ProcessingJobs
                    .FirstOrDefaultAsync(j => j.IdempotencyKey == idempotencyKey && j.UserId == _currentUser.UserId, ct);
                if (existingJob != null)
                {
                    return Accepted(new
                    {
                        message = "Recording upload already queued (idempotent replay).",
                        jobId = existingJob.Id,
                        resourceId = existingJob.ResourceId,
                        resourceType = existingJob.ResourceType,
                        status = existingJob.Status.ToString()
                    });
                }
            }

            var preCheck = _validator.ValidateUploadDescriptor(file.FileName, file.Length, file.ContentType);
            if (!preCheck.IsValid)
            {
                return BadRequest(new { error = preCheck.ErrorMessage, category = preCheck.Category, correlationId });
            }

            var resourceType = string.Equals(type, "lecture", StringComparison.OrdinalIgnoreCase) ? "lecture" : "meeting";
            var resourceId = Guid.NewGuid();
            var safeExt = Path.GetExtension(Path.GetFileName(file.FileName));
            var storageName = $"{resourceId}_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}{safeExt}";
            var fullPath = Path.Combine(_recordingsDir, storageName);

            await using (var fs = System.IO.File.Create(fullPath))
            {
                await file.CopyToAsync(fs, ct);
                await fs.FlushAsync(ct);
            }

            var savedInfo = new FileInfo(fullPath);
            if (!savedInfo.Exists || savedInfo.Length != file.Length || savedInfo.Length <= 0)
            {
                TryDeleteFile(fullPath);
                return UnprocessableEntity(new
                {
                    error = $"Upload stream was truncated while saving (expected {file.Length} bytes, saved {savedInfo.Length} bytes). Please retry.",
                    category = "TruncatedUpload",
                    correlationId
                });
            }

            var streamCheck = await _validator.ValidateFileAsync(fullPath, file.FileName, ct);
            if (!streamCheck.IsValid)
            {
                TryDeleteFile(fullPath);
                return UnprocessableEntity(new
                {
                    error = streamCheck.ErrorMessage,
                    category = streamCheck.Category ?? "UnsupportedMediaContainer",
                    correlationId
                });
            }

            return await EnqueueValidatedRecordingAsync(
                resourceId,
                resourceType,
                fullPath,
                file.FileName,
                streamCheck.DetectedMimeType ?? file.ContentType,
                savedInfo.Length,
                streamCheck.DurationSeconds,
                title,
                courseCode,
                language,
                idempotencyKey,
                ct);
        }

        [HttpPost("upload/init")]
        public IActionResult InitChunkedUpload([FromBody] ChunkedUploadInitRequest req)
        {
            var correlationId = HttpContext.TraceIdentifier;
            var expectedSize = req?.FileSize > 0 ? req.FileSize : (req?.TotalSize ?? 0);
            if (req == null || string.IsNullOrWhiteSpace(req.FileName) || expectedSize <= 0)
            {
                return BadRequest(new { error = "fileName and fileSize are required.", category = "InvalidRequest", correlationId });
            }

            var preCheck = _validator.ValidateUploadDescriptor(req.FileName, expectedSize, req.MimeType);
            if (!preCheck.IsValid)
            {
                return BadRequest(new { error = preCheck.ErrorMessage, category = preCheck.Category, correlationId });
            }

            var uploadId = $"upl_{Guid.NewGuid():N}";
            var sessionDir = Path.Combine(_chunkUploadsDir, uploadId);
            Directory.CreateDirectory(sessionDir);

            var meta = new ChunkedUploadSessionMeta(
                uploadId,
                Path.GetFileName(req.FileName),
                expectedSize,
                req.TotalChunks ?? 0,
                string.Equals(req.Type, "lecture", StringComparison.OrdinalIgnoreCase) ? "lecture" : "meeting",
                req.Title,
                req.CourseCode,
                req.Language ?? "auto",
                req.MimeType ?? "application/octet-stream",
                _currentUser.UserId);

            System.IO.File.WriteAllText(
                Path.Combine(sessionDir, "meta.json"),
                JsonSerializer.Serialize(meta));

            return StatusCode(StatusCodes.Status201Created, new { uploadId, status = "Initialized" });
        }

        [HttpPost("upload/chunk")]
        [RequestSizeLimit(104_857_600)]
        public async Task<IActionResult> UploadChunk(
            [FromQuery] string uploadId,
            [FromQuery] int? index = null,
            [FromQuery] int? chunkIndex = null,
            CancellationToken ct = default)
        {
            var correlationId = HttpContext.TraceIdentifier;
            var meta = LoadChunkSessionMeta(uploadId);
            if (meta == null)
            {
                return NotFound(new { error = "Upload session not found or expired.", category = "SessionExpired", correlationId });
            }

            var resolvedIndex = index ?? chunkIndex ?? -1;
            if (resolvedIndex < 0 || resolvedIndex > 100_000 || (meta.TotalChunks > 0 && resolvedIndex >= meta.TotalChunks))
            {
                return BadRequest(new { error = $"Invalid chunk index {resolvedIndex}.", category = "InvalidChunkIndex", correlationId });
            }

            var sessionDir = Path.Combine(_chunkUploadsDir, uploadId);
            var chunkPath = Path.Combine(sessionDir, $"chunk_{resolvedIndex:D6}");
            var tempChunkPath = chunkPath + ".tmp";

            await using (var fs = System.IO.File.Create(tempChunkPath))
            {
                await Request.Body.CopyToAsync(fs, ct);
                await fs.FlushAsync(ct);
            }

            var info = new FileInfo(tempChunkPath);
            if (!info.Exists || info.Length == 0)
            {
                TryDeleteFile(tempChunkPath);
                return BadRequest(new { error = "Received empty chunk payload.", category = "EmptyChunk", correlationId });
            }

            System.IO.File.Move(tempChunkPath, chunkPath, overwrite: true);
            return Ok(new { uploadId, index = resolvedIndex, bytesReceived = info.Length });
        }

        [HttpPost("upload/complete")]
        public async Task<IActionResult> CompleteChunkedUpload(
            [FromBody] ChunkedUploadCompleteRequest req,
            CancellationToken ct = default)
        {
            var correlationId = HttpContext.TraceIdentifier;
            if (req == null || string.IsNullOrWhiteSpace(req.UploadId))
            {
                return BadRequest(new { error = "uploadId is required.", category = "InvalidRequest", correlationId });
            }

            var meta = LoadChunkSessionMeta(req.UploadId);
            if (meta == null)
            {
                return NotFound(new { error = "Upload session not found or expired.", category = "SessionExpired", correlationId });
            }

            var sessionDir = Path.Combine(_chunkUploadsDir, req.UploadId);
            var chunkFiles = Directory.GetFiles(sessionDir, "chunk_*")
                .Where(f => !f.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase))
                .OrderBy(f => f, StringComparer.Ordinal)
                .ToList();

            if (chunkFiles.Count == 0 || (meta.TotalChunks > 0 && chunkFiles.Count < meta.TotalChunks))
            {
                return BadRequest(new
                {
                    error = "Incomplete chunked upload: missing one or more chunks.",
                    category = "IncompleteUpload",
                    correlationId
                });
            }

            var resourceId = Guid.NewGuid();
            var safeExt = Path.GetExtension(Path.GetFileName(meta.FileName));
            var storageName = $"{resourceId}_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}{safeExt}";
            var fullPath = Path.Combine(_recordingsDir, storageName);

            long assembledBytes = 0;
            await using (var outStream = System.IO.File.Create(fullPath))
            {
                foreach (var chunkPath in chunkFiles)
                {
                    await using var inStream = System.IO.File.OpenRead(chunkPath);
                    await inStream.CopyToAsync(outStream, ct);
                    assembledBytes += inStream.Length;
                }
                await outStream.FlushAsync(ct);
            }

            TryDeleteDirectory(sessionDir);

            if (assembledBytes != meta.TotalSize || assembledBytes <= 0)
            {
                TryDeleteFile(fullPath);
                return UnprocessableEntity(new
                {
                    error = $"Assembled recording size mismatch (expected {meta.TotalSize} bytes, got {assembledBytes} bytes). Please re-upload.",
                    category = "TruncatedUpload",
                    correlationId
                });
            }

            var streamCheck = await _validator.ValidateFileAsync(fullPath, meta.FileName, ct);
            if (!streamCheck.IsValid)
            {
                TryDeleteFile(fullPath);
                return UnprocessableEntity(new
                {
                    error = streamCheck.ErrorMessage,
                    category = streamCheck.Category ?? "UnsupportedMediaContainer",
                    correlationId
                });
            }

            return await EnqueueValidatedRecordingAsync(
                resourceId,
                meta.ResourceType,
                fullPath,
                meta.FileName,
                streamCheck.DetectedMimeType ?? meta.MimeType,
                assembledBytes,
                streamCheck.DurationSeconds,
                meta.Title,
                meta.CourseCode,
                meta.Language,
                Request.Headers["Idempotency-Key"].FirstOrDefault(),
                ct);
        }

        private async Task<IActionResult> EnqueueValidatedRecordingAsync(
            Guid resourceId,
            string resourceType,
            string fullPath,
            string originalFileName,
            string? mimeType,
            long fileSizeBytes,
            double durationSeconds,
            string? title,
            string? courseCode,
            string? language,
            string? idempotencyKey,
            CancellationToken ct)
        {
            var workspace = await EnsureWorkspaceAsync(ct);
            var cleanTitle = string.IsNullOrWhiteSpace(title)
                ? Path.GetFileNameWithoutExtension(originalFileName)
                : title.Trim();
            var now = DateTime.UtcNow;

            if (resourceType == "meeting")
            {
                _db.Meetings.Add(new Meeting
                {
                    Id = resourceId,
                    WorkspaceId = workspace.Id,
                    HostId = _currentUser.UserId,
                    HostName = _currentUser.Email,
                    Title = cleanTitle,
                    ScheduledDateUtc = now,
                    DurationSeconds = (int)Math.Round(durationSeconds),
                    ParticipantsCount = 1,
                    Status = ResourceStatus.Processing,
                    StoragePath = fullPath,
                    OriginalFileName = originalFileName,
                    MediaMimeType = mimeType ?? "application/octet-stream",
                    FileSizeBytes = fileSizeBytes,
                    Language = language ?? "auto",
                    CreatedAtUtc = now,
                    UpdatedAtUtc = now
                });
            }
            else
            {
                _db.Lectures.Add(new Lecture
                {
                    Id = resourceId,
                    WorkspaceId = workspace.Id,
                    InstructorId = _currentUser.UserId,
                    InstructorName = _currentUser.Email,
                    Title = cleanTitle,
                    CourseCode = string.IsNullOrWhiteSpace(courseCode) ? "GEN 101" : courseCode.Trim(),
                    ScheduledDateUtc = now,
                    DurationSeconds = (int)Math.Round(durationSeconds),
                    Status = ResourceStatus.Processing,
                    StoragePath = fullPath,
                    OriginalFileName = originalFileName,
                    MediaMimeType = mimeType ?? "application/octet-stream",
                    FileSizeBytes = fileSizeBytes,
                    Language = language ?? "auto",
                    CreatedAtUtc = now,
                    UpdatedAtUtc = now
                });
            }

            var job = new ProcessingJob
            {
                Id = Guid.NewGuid(),
                UserId = _currentUser.UserId,
                IdempotencyKey = string.IsNullOrWhiteSpace(idempotencyKey) ? null : idempotencyKey,
                JobType = "Transcription",
                Status = JobStatus.Queued,
                Stage = "Uploaded",
                ProgressPercent = 5,
                ResourceType = resourceType,
                ResourceId = resourceId,
                FileName = originalFileName,
                StoragePath = fullPath,
                Language = language ?? "auto",
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            _db.ProcessingJobs.Add(job);
            await _db.SaveChangesAsync(ct);

            await _hub.Clients.Group($"User_{_currentUser.UserId}")
                .UploadCompleted(new { jobId = job.Id, resourceId, resourceType, fileName = originalFileName });

            await _queue.EnqueueJobAsync(job.Id, ct);

            return Accepted(new
            {
                message = "Recording accepted for background transcription and AI analysis.",
                jobId = job.Id,
                resourceId,
                resourceType,
                status = "Queued"
            });
        }

        private ChunkedUploadSessionMeta? LoadChunkSessionMeta(string? uploadId)
        {
            if (string.IsNullOrWhiteSpace(uploadId) || uploadId.Contains("..") || uploadId.Contains('/') || uploadId.Contains('\\'))
            {
                return null;
            }
            var metaPath = Path.Combine(_chunkUploadsDir, uploadId, "meta.json");
            if (!System.IO.File.Exists(metaPath)) return null;
            try
            {
                return JsonSerializer.Deserialize<ChunkedUploadSessionMeta>(System.IO.File.ReadAllText(metaPath));
            }
            catch
            {
                return null;
            }
        }

        [HttpPost("live/start")]
        public async Task<IActionResult> StartLiveRecording([FromBody] StartLiveRecordingRequest req, CancellationToken ct = default)
        {
            var workspace = await EnsureWorkspaceAsync(ct);
            var resourceType = string.Equals(req.Type, "lecture", StringComparison.OrdinalIgnoreCase) ? "lecture" : "meeting";
            var resourceId = Guid.NewGuid();
            var now = DateTime.UtcNow;

            if (resourceType == "meeting")
            {
                _db.Meetings.Add(new Meeting
                {
                    Id = resourceId,
                    WorkspaceId = workspace.Id,
                    HostId = _currentUser.UserId,
                    HostName = req.SpeakerName ?? _currentUser.Email,
                    Title = string.IsNullOrWhiteSpace(req.Title) ? "Live Meeting" : req.Title.Trim(),
                    ScheduledDateUtc = now,
                    Status = ResourceStatus.Processing,
                    Language = req.Language ?? "auto",
                    CreatedAtUtc = now,
                    UpdatedAtUtc = now
                });
            }
            else
            {
                _db.Lectures.Add(new Lecture
                {
                    Id = resourceId,
                    WorkspaceId = workspace.Id,
                    InstructorId = _currentUser.UserId,
                    InstructorName = req.SpeakerName ?? _currentUser.Email,
                    Title = string.IsNullOrWhiteSpace(req.Title) ? "Live Lecture" : req.Title.Trim(),
                    CourseCode = string.IsNullOrWhiteSpace(req.CourseCode) ? "GEN 101" : req.CourseCode.Trim(),
                    ScheduledDateUtc = now,
                    Status = ResourceStatus.Processing,
                    Language = req.Language ?? "auto",
                    CreatedAtUtc = now,
                    UpdatedAtUtc = now
                });
            }

            await _db.SaveChangesAsync(ct);
            return Ok(new { success = true, recordingId = resourceId, resourceId, type = resourceType, status = "Recording" });
        }

        [HttpPost("live/{id:guid}/chunk")]
        public async Task<IActionResult> IngestLiveChunk(
            Guid id,
            [FromForm] IFormFile file,
            [FromForm] string? language = "auto",
            [FromForm] double startOffsetSeconds = 0,
            [FromForm] int chunkIndex = 0,
            [FromForm] bool isFinal = true,
            CancellationToken ct = default)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new { error = "Audio chunk is empty." });
            }

            await using var ms = new MemoryStream();
            await file.CopyToAsync(ms, ct);
            var chunkResult = await _aiClient.TranscribeChunkAsync(ms.ToArray(), file.FileName, language ?? "auto", startOffsetSeconds, isFinal, ct);

            var meeting = await _db.Meetings.FirstOrDefaultAsync(m => m.Id == id && (_currentUser.IsAdmin || m.HostId == _currentUser.UserId), ct);
            var lecture = meeting == null
                ? await _db.Lectures.FirstOrDefaultAsync(l => l.Id == id && (_currentUser.IsAdmin || l.InstructorId == _currentUser.UserId), ct)
                : null;

            if (meeting == null && lecture == null)
            {
                return NotFound(new { error = "Live recording session not found." });
            }

            foreach (var seg in chunkResult.Segments)
            {
                var entity = new TranscriptSegment
                {
                    MeetingId = meeting?.Id,
                    LectureId = lecture?.Id,
                    Speaker = seg.Speaker,
                    StartTimeSeconds = seg.StartTime,
                    EndTimeSeconds = seg.EndTime,
                    Text = seg.Text,
                    Confidence = seg.Confidence,
                    IsPartial = !isFinal,
                    ChunkIndex = chunkIndex,
                    Language = seg.Language
                };
                _db.TranscriptSegments.Add(entity);
                await _hub.Clients.Group($"User_{_currentUser.UserId}")
                    .TranscriptSegmentAvailable(new { resourceId = id, segment = entity });
            }

            await _db.SaveChangesAsync(ct);
            return Ok(new { success = true, segments = chunkResult.Segments });
        }

        [HttpPost("live/{id:guid}/finalize")]
        [RequestSizeLimit(524_288_000)]
        [RequestFormLimits(MultipartBodyLengthLimit = 524_288_000, ValueLengthLimit = int.MaxValue, MultipartHeadersLengthLimit = 65_536)]
        public async Task<IActionResult> FinalizeLiveSession(
            Guid id,
            [FromForm] IFormFile? audioFile = null,
            [FromForm] string? language = "auto",
            CancellationToken ct = default)
        {
            var meeting = await _db.Meetings
                .Include(m => m.TranscriptSegments)
                .FirstOrDefaultAsync(m => m.Id == id && (_currentUser.IsAdmin || m.HostId == _currentUser.UserId), ct);
            var lecture = meeting == null
                ? await _db.Lectures
                    .Include(l => l.TranscriptSegments)
                    .FirstOrDefaultAsync(l => l.Id == id && (_currentUser.IsAdmin || l.InstructorId == _currentUser.UserId), ct)
                : null;

            if (meeting == null && lecture == null)
            {
                return NotFound(new { error = "Recording session not found." });
            }

            var resourceType = meeting != null ? "meeting" : "lecture";
            string? savedPath = null;
            if (audioFile != null && audioFile.Length > 0)
            {
                var safeExt = Path.GetExtension(audioFile.FileName);
                savedPath = Path.Combine(_recordingsDir, $"{id}_live{safeExt}");
                await using var fs = System.IO.File.Create(savedPath);
                await audioFile.CopyToAsync(fs, ct);

                if (meeting != null) { meeting.StoragePath = savedPath; meeting.OriginalFileName = audioFile.FileName; }
                else if (lecture != null) { lecture.StoragePath = savedPath; lecture.OriginalFileName = audioFile.FileName; }
            }

            var existingSegments = (meeting?.TranscriptSegments ?? lecture!.TranscriptSegments)
                .OrderBy(s => s.StartTimeSeconds)
                .Select(s => new AiTranscriptSegmentDto(s.Id.ToString(), s.Speaker, s.StartTimeSeconds, s.EndTimeSeconds, s.Text, s.Confidence, s.Language, s.ChunkIndex, false))
                .ToList();

            if (!string.IsNullOrWhiteSpace(savedPath))
            {
                var job = new ProcessingJob
                {
                    Id = Guid.NewGuid(),
                    UserId = _currentUser.UserId,
                    JobType = "FinalizeLive",
                    Status = JobStatus.Queued,
                    Stage = "Queued",
                    ProgressPercent = 10,
                    ResourceType = resourceType,
                    ResourceId = id,
                    FileName = Path.GetFileName(savedPath),
                    StoragePath = savedPath,
                    Language = language ?? "auto"
                };
                _db.ProcessingJobs.Add(job);
                await _db.SaveChangesAsync(ct);
                await _queue.EnqueueJobAsync(job.Id, ct);
                return Accepted(new { success = true, resourceId = id, jobId = job.Id, status = "Processing" });
            }

            if (existingSegments.Count == 0)
            {
                return UnprocessableEntity(new { error = "No audible speech detected in the recording." });
            }

            var title = meeting?.Title ?? lecture!.Title;
            var analysis = await _aiClient.AnalyzeTranscriptAsync(title, resourceType, language ?? "auto", existingSegments, lecture?.CourseCode, ct);
            if (meeting != null)
            {
                meeting.Summary = analysis.ExecutiveSummary;
                meeting.DetailedSummary = analysis.DetailedSummary;
                meeting.Status = ResourceStatus.Completed;
                meeting.UpdatedAtUtc = DateTime.UtcNow;
            }
            else if (lecture != null)
            {
                lecture.StudyNotes = analysis.ExecutiveSummary;
                lecture.DetailedSummary = analysis.DetailedSummary;
                lecture.Status = ResourceStatus.Completed;
                lecture.UpdatedAtUtc = DateTime.UtcNow;
            }
            await _db.SaveChangesAsync(ct);

            return Ok(new { success = true, resourceId = id, status = "Completed", segmentsCount = existingSegments.Count });
        }

        [HttpGet("audio/{id:guid}")]
        public async Task<IActionResult> StreamAudio(Guid id, CancellationToken ct = default)
        {
            var meeting = await _db.Meetings.FirstOrDefaultAsync(m => m.Id == id && (_currentUser.IsAdmin || m.HostId == _currentUser.UserId), ct);
            var lecture = meeting == null
                ? await _db.Lectures.FirstOrDefaultAsync(l => l.Id == id && (_currentUser.IsAdmin || l.InstructorId == _currentUser.UserId), ct)
                : null;

            var path = meeting?.StoragePath ?? lecture?.StoragePath;
            var mime = meeting?.MediaMimeType ?? lecture?.MediaMimeType ?? "audio/mpeg";
            if (string.IsNullOrWhiteSpace(path) || !System.IO.File.Exists(path))
            {
                return NotFound(new { error = "Recording audio file not found." });
            }

            return PhysicalFile(path, mime, enableRangeProcessing: true);
        }

        [HttpPost("{id:guid}/reprocess")]
        public async Task<IActionResult> ReprocessRecording(Guid id, CancellationToken ct = default)
        {
            var meeting = await _db.Meetings.FirstOrDefaultAsync(m => m.Id == id && (_currentUser.IsAdmin || m.HostId == _currentUser.UserId), ct);
            var lecture = meeting == null
                ? await _db.Lectures.FirstOrDefaultAsync(l => l.Id == id && (_currentUser.IsAdmin || l.InstructorId == _currentUser.UserId), ct)
                : null;

            var storagePath = meeting?.StoragePath ?? lecture?.StoragePath;
            if (string.IsNullOrWhiteSpace(storagePath) || !System.IO.File.Exists(storagePath))
            {
                return NotFound(new { error = "Original media file is no longer available on disk." });
            }

            var job = new ProcessingJob
            {
                Id = Guid.NewGuid(),
                UserId = _currentUser.UserId,
                JobType = "Reprocess",
                Status = JobStatus.Queued,
                Stage = "Queued",
                ProgressPercent = 5,
                ResourceType = meeting != null ? "meeting" : "lecture",
                ResourceId = id,
                FileName = meeting?.OriginalFileName ?? lecture?.OriginalFileName ?? Path.GetFileName(storagePath),
                StoragePath = storagePath,
                Language = meeting?.Language ?? lecture?.Language ?? "auto"
            };
            if (meeting != null) meeting.Status = ResourceStatus.Processing;
            if (lecture != null) lecture.Status = ResourceStatus.Processing;

            _db.ProcessingJobs.Add(job);
            await _db.SaveChangesAsync(ct);
            await _queue.EnqueueJobAsync(job.Id, ct);

            return Accepted(new { success = true, jobId = job.Id, resourceId = id, status = "Queued" });
        }

        [HttpDelete("all")]
        public async Task<IActionResult> DeleteAllRecordingsForUser(CancellationToken ct = default)
        {
            var userId = _currentUser.UserId;
            var isAdmin = _currentUser.IsAdmin;

            var meetings = await _db.Meetings.Where(m => isAdmin || m.HostId == userId).ToListAsync(ct);
            var lectures = await _db.Lectures.Where(l => isAdmin || l.InstructorId == userId).ToListAsync(ct);

            var activeJobs = await _db.ProcessingJobs
                .Where(j => (isAdmin || j.UserId == userId) && (j.Status == JobStatus.Queued || j.Status == JobStatus.Transcribing || j.Status == JobStatus.Analyzing))
                .ToListAsync(ct);
            foreach (var job in activeJobs)
            {
                _queue.RequestCancel(job.Id);
            }

            foreach (var m in meetings) TryDeleteFile(m.StoragePath);
            foreach (var l in lectures) TryDeleteFile(l.StoragePath);

            var resourceIds = meetings.Select(m => m.Id).Concat(lectures.Select(l => l.Id)).ToHashSet();

            var userJobs = await _db.ProcessingJobs.Where(j => isAdmin || j.UserId == userId || resourceIds.Contains(j.ResourceId)).ToListAsync(ct);
            var userQuizzes = await _db.Quizzes.Where(q => isAdmin || q.UserId == userId || (q.LectureId.HasValue && resourceIds.Contains(q.LectureId.Value)) || (q.MeetingId.HasValue && resourceIds.Contains(q.MeetingId.Value))).ToListAsync(ct);
            var userFlashcards = await _db.Flashcards.Where(f => isAdmin || f.UserId == userId || (f.LectureId.HasValue && resourceIds.Contains(f.LectureId.Value)) || (f.MeetingId.HasValue && resourceIds.Contains(f.MeetingId.Value))).ToListAsync(ct);
            var userMindMaps = await _db.MindMaps.Where(mm => isAdmin || mm.UserId == userId || (mm.LectureId.HasValue && resourceIds.Contains(mm.LectureId.Value)) || (mm.MeetingId.HasValue && resourceIds.Contains(mm.MeetingId.Value))).ToListAsync(ct);
            var userTasks = await _db.ActionItems.Where(a => isAdmin || a.UserId == userId || (a.MeetingId.HasValue && resourceIds.Contains(a.MeetingId.Value)) || (a.LectureId.HasValue && resourceIds.Contains(a.LectureId.Value))).ToListAsync(ct);
            var userChats = await _db.ChatMessages.Where(c => isAdmin || c.UserId == userId || (c.MeetingId.HasValue && resourceIds.Contains(c.MeetingId.Value)) || (c.LectureId.HasValue && resourceIds.Contains(c.LectureId.Value))).ToListAsync(ct);

            _db.ProcessingJobs.RemoveRange(userJobs);
            _db.Quizzes.RemoveRange(userQuizzes);
            _db.Flashcards.RemoveRange(userFlashcards);
            _db.MindMaps.RemoveRange(userMindMaps);
            _db.ActionItems.RemoveRange(userTasks);
            _db.ChatMessages.RemoveRange(userChats);
            _db.Meetings.RemoveRange(meetings);
            _db.Lectures.RemoveRange(lectures);

            _db.AuditLogs.Add(new AuditLog
            {
                UserId = userId,
                Action = "DELETE_ALL_RECORDINGS",
                Resource = "Recordings",
                MetadataJson = $"{{\"deletedMeetings\":{meetings.Count},\"deletedLectures\":{lectures.Count}}}"
            });

            await _db.SaveChangesAsync(ct);

            return Ok(new
            {
                success = true,
                deletedMeetings = meetings.Count,
                deletedLectures = lectures.Count,
                deletedTasks = userTasks.Count,
                deletedQuizzes = userQuizzes.Count
            });
        }

        private async Task<Workspace> EnsureWorkspaceAsync(CancellationToken ct)
        {
            var existing = await _db.Workspaces.FirstOrDefaultAsync(ct);
            if (existing != null) return existing;

            var ws = new Workspace
            {
                Name = "MeetMind Workspace",
                Slug = $"ws-{Guid.NewGuid():N}",
                OwnerId = _currentUser.UserId
            };
            _db.Workspaces.Add(ws);
            await _db.SaveChangesAsync(ct);
            return ws;
        }

        private static void TryDeleteFile(string? path)
        {
            if (!string.IsNullOrWhiteSpace(path) && System.IO.File.Exists(path))
            {
                try { System.IO.File.Delete(path); } catch { /* ignore */ }
            }
        }

        private static void TryDeleteDirectory(string? dir)
        {
            if (!string.IsNullOrWhiteSpace(dir) && Directory.Exists(dir))
            {
                try { Directory.Delete(dir, recursive: true); } catch { /* ignore */ }
            }
        }
    }

    public record StartLiveRecordingRequest(string? Type, string? Title, string? CourseCode, string? SpeakerName, string? Language);

    public record ChunkedUploadInitRequest(
        string FileName,
        long FileSize = 0,
        long TotalSize = 0,
        int? TotalChunks = null,
        string? Type = "meeting",
        string? Title = null,
        string? CourseCode = null,
        string? Language = "auto",
        string? MimeType = null);

    public record ChunkedUploadCompleteRequest(string UploadId);

    internal record ChunkedUploadSessionMeta(
        string UploadId,
        string FileName,
        long TotalSize,
        int TotalChunks,
        string ResourceType,
        string? Title,
        string? CourseCode,
        string Language,
        string MimeType,
        Guid UserId);
}
