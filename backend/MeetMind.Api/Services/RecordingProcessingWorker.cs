using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MeetMind.Api.Hubs;
using MeetMind.Core.Entities;
using MeetMind.Core.Enums;
using MeetMind.Infrastructure.Data;

namespace MeetMind.Api.Services
{
    public class RecordingProcessingWorker : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IBackgroundProcessingQueue _queue;
        private readonly IHubContext<ProcessingHub, IProcessingClient> _hub;
        private readonly ILogger<RecordingProcessingWorker> _logger;

        public RecordingProcessingWorker(
            IServiceScopeFactory scopeFactory,
            IBackgroundProcessingQueue queue,
            IHubContext<ProcessingHub, IProcessingClient> hub,
            ILogger<RecordingProcessingWorker> logger)
        {
            _scopeFactory = scopeFactory;
            _queue = queue;
            _hub = hub;
            _logger = logger;
        }

        public override async Task StartAsync(CancellationToken cancellationToken)
        {
            await RecoverInterruptedJobsAsync(cancellationToken);
            await base.StartAsync(cancellationToken);
        }

        public async Task RecoverInterruptedJobsAsync(CancellationToken ct)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var unfinishedStatuses = new[]
            {
                JobStatus.Queued,
                JobStatus.Uploading,
                JobStatus.Uploaded,
                JobStatus.Validating,
                JobStatus.ExtractingAudio,
                JobStatus.Transcribing,
                JobStatus.Translating,
                JobStatus.Merging,
                JobStatus.Analyzing,
                JobStatus.GeneratingQuiz
            };

            var interruptedJobs = await db.ProcessingJobs
                .Where(j => unfinishedStatuses.Contains(j.Status))
                .ToListAsync(ct);

            foreach (var job in interruptedJobs)
            {
                job.Status = JobStatus.Queued;
                job.Stage = "Recovered";
                job.UpdatedAtUtc = DateTime.UtcNow;
                await _queue.EnqueueJobAsync(job.Id, ct);
                _logger.LogInformation("Recovered interrupted processing job {JobId} for {ResourceId}", job.Id, job.ResourceId);
            }

            if (interruptedJobs.Count > 0)
            {
                await db.SaveChangesAsync(ct);
            }
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                Guid jobId;
                try
                {
                    jobId = await _queue.DequeueAsync(stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }

                await ProcessJobWithRetryAsync(jobId, stoppingToken);
            }
        }

        public async Task ProcessJobWithRetryAsync(Guid jobId, CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                if (_queue.IsCancellationRequested(jobId))
                {
                    await MarkCancelledAsync(jobId, ct);
                    return;
                }

                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var validator = scope.ServiceProvider.GetRequiredService<IMediaValidationService>();
                var aiClient = scope.ServiceProvider.GetRequiredService<IAiServiceClient>();

                var job = await db.ProcessingJobs.FirstOrDefaultAsync(j => j.Id == jobId, ct);
                if (job == null || job.Status == JobStatus.Completed || job.Status == JobStatus.Cancelled)
                {
                    return;
                }

                try
                {
                    await ExecuteSingleAttemptAsync(job, db, validator, aiClient, ct);
                    return;
                }
                catch (OperationCanceledException) when (_queue.IsCancellationRequested(jobId))
                {
                    await MarkCancelledAsync(jobId, ct);
                    return;
                }
                catch (Exception ex)
                {
                    var category = ClassifyFailure(ex);
                    var transient = category is JobFailureCategory.TranscriptionServiceError
                        or JobFailureCategory.AiAnalysisError
                        or JobFailureCategory.TimeoutError;

                    job.RetryCount += 1;
                    job.FailureCategory = category;
                    job.LastAttemptAtUtc = DateTime.UtcNow;
                    job.FailureTimestampUtc = DateTime.UtcNow;
                    job.UpdatedAtUtc = DateTime.UtcNow;

                    if (transient && job.RetryCount <= job.MaxRetries)
                    {
                        job.Status = JobStatus.Queued;
                        job.Stage = $"Retry_{job.RetryCount}";
                        job.ErrorMessage = ex.Message;
                        await db.SaveChangesAsync(ct);
                        _logger.LogWarning("Retrying job {JobId} (attempt {Retry}) after transient failure: {Error}",
                            jobId, job.RetryCount, ex.Message);
                        await Task.Delay(TimeSpan.FromSeconds(Math.Pow(2, job.RetryCount)), ct);
                        continue;
                    }

                    job.Status = JobStatus.Failed;
                    job.Stage = "Failed";
                    job.ErrorMessage = SanitizeErrorMessage(ex);
                    await UpdateResourceStatusAsync(db, job.ResourceType, job.ResourceId, ResourceStatus.Failed, ct);
                    await db.SaveChangesAsync(ct);

                    await BroadcastAsync(job, "ProcessingFailed", new
                    {
                        jobId = job.Id,
                        resourceId = job.ResourceId,
                        error = job.ErrorMessage,
                        category = category.ToString()
                    });
                    return;
                }
            }
        }

        private async Task ExecuteSingleAttemptAsync(
            ProcessingJob job,
            ApplicationDbContext db,
            IMediaValidationService validator,
            IAiServiceClient aiClient,
            CancellationToken ct)
        {
            job.LastAttemptAtUtc = DateTime.UtcNow;
            await SetStageAsync(db, job, JobStatus.Validating, "Validating", 10, ct);
            await BroadcastAsync(job, "ProcessingStarted", new { jobId = job.Id, resourceId = job.ResourceId, progressPercent = 10 });

            var validation = await validator.ValidateFileAsync(job.StoragePath ?? "", job.FileName, ct);
            if (!validation.IsValid)
            {
                throw new ArgumentException(validation.ErrorMessage ?? "Invalid media file.");
            }

            if (_queue.IsCancellationRequested(job.Id)) throw new OperationCanceledException();

            await SetStageAsync(db, job, JobStatus.ExtractingAudio, "ExtractingAudio", 25, ct);
            await BroadcastAsync(job, "AudioExtractionStarted", new { jobId = job.Id, resourceId = job.ResourceId, progressPercent = 25 });

            await SetStageAsync(db, job, JobStatus.Transcribing, "Transcribing", 40, ct);
            await BroadcastAsync(job, "TranscriptionStarted", new { jobId = job.Id, resourceId = job.ResourceId, progressPercent = 40 });

            var transcription = await aiClient.TranscribeFileAsync(job.StoragePath!, job.ResourceType, job.Language, ct);
            if (_queue.IsCancellationRequested(job.Id)) throw new OperationCanceledException();

            foreach (var seg in transcription.Segments)
            {
                await BroadcastAsync(job, "TranscriptSegmentAvailable", new { jobId = job.Id, resourceId = job.ResourceId, segment = seg });
            }

            await SetStageAsync(db, job, JobStatus.Analyzing, "Analyzing", 70, ct);
            await BroadcastAsync(job, "TranscriptionCompleted", new { jobId = job.Id, resourceId = job.ResourceId, segmentsCount = transcription.Segments.Count });
            await BroadcastAsync(job, "AIAnalysisStarted", new { jobId = job.Id, resourceId = job.ResourceId, progressPercent = 70 });

            var title = await ResolveTitleAsync(db, job.ResourceType, job.ResourceId, job.FileName, ct);
            var courseCode = await ResolveCourseCodeAsync(db, job.ResourceType, job.ResourceId, ct);

            var analysis = await aiClient.AnalyzeTranscriptAsync(
                title,
                job.ResourceType,
                transcription.Language,
                transcription.Segments,
                courseCode,
                ct);

            await PersistPipelineOutputsAsync(db, job, transcription, analysis, title, courseCode, ct);

            await SetStageAsync(db, job, JobStatus.Completed, "Completed", 100, ct);
            await BroadcastAsync(job, "SummaryReady", new { jobId = job.Id, resourceId = job.ResourceId });
            await BroadcastAsync(job, "KeywordsReady", new { jobId = job.Id, resourceId = job.ResourceId, count = analysis.Keywords.Count });
            await BroadcastAsync(job, "TasksReady", new { jobId = job.Id, resourceId = job.ResourceId, count = analysis.ActionItems.Count });
            if (analysis.QuizQuestions.Count > 0)
            {
                await BroadcastAsync(job, "QuizReady", new { jobId = job.Id, resourceId = job.ResourceId, count = analysis.QuizQuestions.Count });
            }
            if (analysis.Flashcards.Count > 0)
            {
                await BroadcastAsync(job, "FlashcardsReady", new { jobId = job.Id, resourceId = job.ResourceId, count = analysis.Flashcards.Count });
            }
            await BroadcastAsync(job, "ProcessingCompleted", new { jobId = job.Id, resourceId = job.ResourceId, progressPercent = 100 });
        }

        private async Task PersistPipelineOutputsAsync(
            ApplicationDbContext db,
            ProcessingJob job,
            AiTranscriptionResponseDto transcription,
            AiAnalysisResponseDto analysis,
            string title,
            string? courseCode,
            CancellationToken ct)
        {
            var isMeeting = string.Equals(job.ResourceType, "meeting", StringComparison.OrdinalIgnoreCase);
            var durationSec = (int)Math.Max(1, Math.Round(transcription.DurationSeconds));
            var now = DateTime.UtcNow;

            var existingSegments = db.TranscriptSegments.Where(s => isMeeting ? s.MeetingId == job.ResourceId : s.LectureId == job.ResourceId);
            db.TranscriptSegments.RemoveRange(existingSegments);

            var existingTopics = db.Topics.Where(t => isMeeting ? t.MeetingId == job.ResourceId : t.LectureId == job.ResourceId);
            db.Topics.RemoveRange(existingTopics);

            var existingKeywords = db.Keywords.Where(k => isMeeting ? k.MeetingId == job.ResourceId : k.LectureId == job.ResourceId);
            db.Keywords.RemoveRange(existingKeywords);

            var existingHighlights = db.Highlights.Where(h => isMeeting ? h.MeetingId == job.ResourceId : h.LectureId == job.ResourceId);
            db.Highlights.RemoveRange(existingHighlights);

            var existingTasks = db.ActionItems.Where(a => isMeeting ? a.MeetingId == job.ResourceId : a.LectureId == job.ResourceId);
            db.ActionItems.RemoveRange(existingTasks);

            var existingQuizzes = db.Quizzes.Where(q => isMeeting ? q.MeetingId == job.ResourceId : q.LectureId == job.ResourceId);
            db.Quizzes.RemoveRange(existingQuizzes);

            var existingFlashcards = db.Flashcards.Where(f => isMeeting ? f.MeetingId == job.ResourceId : f.LectureId == job.ResourceId);
            db.Flashcards.RemoveRange(existingFlashcards);

            var existingMindMaps = db.MindMaps.Where(mm => isMeeting ? mm.MeetingId == job.ResourceId : mm.LectureId == job.ResourceId);
            db.MindMaps.RemoveRange(existingMindMaps);

            foreach (var seg in transcription.Segments)
            {
                db.TranscriptSegments.Add(new TranscriptSegment
                {
                    MeetingId = isMeeting ? job.ResourceId : null,
                    LectureId = isMeeting ? null : job.ResourceId,
                    Speaker = seg.Speaker,
                    StartTimeSeconds = seg.StartTime,
                    EndTimeSeconds = seg.EndTime,
                    Text = seg.Text,
                    Confidence = seg.Confidence,
                    IsPartial = seg.IsPartial,
                    ChunkIndex = seg.ChunkIndex,
                    Language = seg.Language
                });
            }

            foreach (var topicName in analysis.Topics)
            {
                db.Topics.Add(new Topic
                {
                    MeetingId = isMeeting ? job.ResourceId : null,
                    LectureId = isMeeting ? null : job.ResourceId,
                    Name = topicName
                });
            }

            foreach (var kw in analysis.Keywords)
            {
                db.Keywords.Add(new Keyword
                {
                    MeetingId = isMeeting ? job.ResourceId : null,
                    LectureId = isMeeting ? null : job.ResourceId,
                    Term = kw.Term,
                    Frequency = kw.Frequency,
                    ImportanceScore = kw.Importance,
                    SegmentIdsJson = JsonSerializer.Serialize(kw.SegmentIds ?? new List<string>())
                });
            }

            foreach (var hl in analysis.Highlights)
            {
                db.Highlights.Add(new Highlight
                {
                    MeetingId = isMeeting ? job.ResourceId : null,
                    LectureId = isMeeting ? null : job.ResourceId,
                    Quote = hl.Quote,
                    Context = hl.Context,
                    Speaker = hl.Speaker,
                    TimestampText = hl.Timestamp,
                    Category = Enum.TryParse<HighlightCategory>(hl.Category, true, out var cat) ? cat : HighlightCategory.KeyConcept,
                    Priority = ParsePriority(hl.Priority)
                });
            }

            foreach (var task in analysis.ActionItems)
            {
                db.ActionItems.Add(new ActionItem
                {
                    MeetingId = isMeeting ? job.ResourceId : null,
                    LectureId = isMeeting ? null : job.ResourceId,
                    UserId = job.UserId,
                    Title = task.Task,
                    OwnerName = task.Assignee,
                    DeadlineText = string.IsNullOrWhiteSpace(task.Deadline) ? "Deadline not specified." : task.Deadline,
                    SourceTimestamp = task.SourceTimestamp,
                    Priority = ParsePriority(task.Priority),
                    CreatedAtUtc = now
                });
            }

            if (isMeeting)
            {
                var meeting = await db.Meetings.FirstOrDefaultAsync(m => m.Id == job.ResourceId, ct);
                if (meeting != null)
                {
                    meeting.DurationSeconds = durationSec;
                    meeting.Language = transcription.Language;
                    meeting.FullTranscriptText = transcription.FullText;
                    meeting.Summary = analysis.ExecutiveSummary;
                    meeting.DetailedSummary = analysis.DetailedSummary;
                    meeting.DecisionsJson = JsonSerializer.Serialize(analysis.Decisions);
                    meeting.Status = ResourceStatus.Completed;
                    meeting.UpdatedAtUtc = now;
                }
            }
            else
            {
                var lecture = await db.Lectures.FirstOrDefaultAsync(l => l.Id == job.ResourceId, ct);
                if (lecture != null)
                {
                    lecture.DurationSeconds = durationSec;
                    lecture.Language = transcription.Language;
                    lecture.FullTranscriptText = transcription.FullText;
                    lecture.StudyNotes = analysis.ExecutiveSummary;
                    lecture.DetailedSummary = analysis.DetailedSummary;
                    lecture.Status = ResourceStatus.Completed;
                    lecture.UpdatedAtUtc = now;
                }
            }

            if (analysis.QuizQuestions.Count > 0)
            {
                var quiz = new Quiz
                {
                    LectureId = isMeeting ? null : job.ResourceId,
                    MeetingId = isMeeting ? job.ResourceId : null,
                    UserId = job.UserId,
                    Title = $"Quiz: {title}",
                    CourseCode = courseCode,
                    CreatedAtUtc = now
                };
                foreach (var qq in analysis.QuizQuestions)
                {
                    quiz.Questions.Add(new QuizQuestion
                    {
                        QuestionText = qq.Question,
                        QuestionType = ParseQuestionType(qq.Type),
                        OptionsJson = JsonSerializer.Serialize(qq.Options),
                        CorrectOptionIndex = qq.CorrectOptionIndex,
                        CorrectAnswerText = qq.CorrectAnswerText,
                        Explanation = qq.Explanation,
                        Difficulty = qq.Difficulty,
                        SourceTimestamp = qq.TimestampRef,
                        SourceReference = string.IsNullOrWhiteSpace(qq.TimestampRef) ? title : $"{title} [{qq.TimestampRef}]"
                    });
                }
                db.Quizzes.Add(quiz);
            }

            foreach (var fc in analysis.Flashcards)
            {
                db.Flashcards.Add(new Flashcard
                {
                    LectureId = isMeeting ? null : job.ResourceId,
                    MeetingId = isMeeting ? job.ResourceId : null,
                    UserId = job.UserId,
                    DeckTitle = title,
                    Front = fc.Front,
                    Back = fc.Back,
                    TimestampRef = fc.TimestampRef,
                    Topic = courseCode ?? title,
                    Difficulty = "medium",
                    CreatedAtUtc = now
                });
            }

            if (analysis.MindMap.HasValue)
            {
                db.MindMaps.Add(new MindMap
                {
                    LectureId = isMeeting ? null : job.ResourceId,
                    MeetingId = isMeeting ? job.ResourceId : null,
                    UserId = job.UserId,
                    Title = title,
                    RootNodeJson = analysis.MindMap.Value.GetRawText(),
                    CreatedAtUtc = now
                });
            }

            db.Notifications.Add(new Notification
            {
                UserId = job.UserId,
                Title = isMeeting ? "Meeting processing complete" : "Lecture processing complete",
                Body = $"Finished transcription and AI intelligence extraction for \"{title}\".",
                TargetUrl = $"/transcript?id={job.ResourceId}",
                Type = "Summary",
                CreatedAtUtc = now
            });

            await db.SaveChangesAsync(ct);
        }

        private async Task MarkCancelledAsync(Guid jobId, CancellationToken ct)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var job = await db.ProcessingJobs.FirstOrDefaultAsync(j => j.Id == jobId, ct);
            if (job != null)
            {
                job.Status = JobStatus.Cancelled;
                job.Stage = "Cancelled";
                job.FailureCategory = JobFailureCategory.CancelledByUser;
                job.ErrorMessage = "Processing cancelled by user.";
                job.UpdatedAtUtc = DateTime.UtcNow;
                await UpdateResourceStatusAsync(db, job.ResourceType, job.ResourceId, ResourceStatus.Failed, ct);
                await db.SaveChangesAsync(ct);
                await BroadcastAsync(job, "ProcessingFailed", new { jobId = job.Id, resourceId = job.ResourceId, error = job.ErrorMessage, category = "CancelledByUser" });
            }
            _queue.ClearCancel(jobId);
        }

        private static async Task SetStageAsync(ApplicationDbContext db, ProcessingJob job, JobStatus status, string stage, int pct, CancellationToken ct)
        {
            job.Status = status;
            job.Stage = stage;
            job.ProgressPercent = pct;
            job.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }

        private static async Task UpdateResourceStatusAsync(ApplicationDbContext db, string resourceType, Guid resourceId, ResourceStatus status, CancellationToken ct)
        {
            if (string.Equals(resourceType, "meeting", StringComparison.OrdinalIgnoreCase))
            {
                var m = await db.Meetings.FirstOrDefaultAsync(x => x.Id == resourceId, ct);
                if (m != null) { m.Status = status; m.UpdatedAtUtc = DateTime.UtcNow; }
            }
            else
            {
                var l = await db.Lectures.FirstOrDefaultAsync(x => x.Id == resourceId, ct);
                if (l != null) { l.Status = status; l.UpdatedAtUtc = DateTime.UtcNow; }
            }
        }

        private static async Task<string> ResolveTitleAsync(ApplicationDbContext db, string resourceType, Guid resourceId, string fallback, CancellationToken ct)
        {
            if (string.Equals(resourceType, "meeting", StringComparison.OrdinalIgnoreCase))
            {
                return await db.Meetings.Where(m => m.Id == resourceId).Select(m => m.Title).FirstOrDefaultAsync(ct) ?? fallback;
            }
            return await db.Lectures.Where(l => l.Id == resourceId).Select(l => l.Title).FirstOrDefaultAsync(ct) ?? fallback;
        }

        private static async Task<string?> ResolveCourseCodeAsync(ApplicationDbContext db, string resourceType, Guid resourceId, CancellationToken ct)
        {
            if (string.Equals(resourceType, "lecture", StringComparison.OrdinalIgnoreCase))
            {
                return await db.Lectures.Where(l => l.Id == resourceId).Select(l => l.CourseCode).FirstOrDefaultAsync(ct);
            }
            return null;
        }

        private Task BroadcastAsync(ProcessingJob job, string methodName, object payload)
        {
            return Task.WhenAll(
                _hub.Clients.Group($"Job_{job.Id}").SendCoreAsync(methodName, new[] { payload }),
                _hub.Clients.Group($"User_{job.UserId}").SendCoreAsync(methodName, new[] { payload })
            );
        }

        private static TaskPriority ParsePriority(string? raw) => raw?.ToLowerInvariant() switch
        {
            "high" => TaskPriority.High,
            "low" => TaskPriority.Low,
            _ => TaskPriority.Medium
        };

        private static QuizQuestionType ParseQuestionType(string? raw) => raw?.ToLowerInvariant() switch
        {
            "true_false" => QuizQuestionType.TrueFalse,
            "short_answer" => QuizQuestionType.ShortAnswer,
            "fill_in_the_blank" => QuizQuestionType.FillInTheBlank,
            _ => QuizQuestionType.MultipleChoice
        };

        private static JobFailureCategory ClassifyFailure(Exception ex) => ex switch
        {
            ArgumentException => JobFailureCategory.MediaValidationError,
            TimeoutException => JobFailureCategory.TimeoutError,
            HttpRequestException => JobFailureCategory.TranscriptionServiceError,
            System.IO.IOException => JobFailureCategory.StorageError,
            InvalidOperationException => JobFailureCategory.TranscriptionServiceError,
            _ => JobFailureCategory.UnknownError
        };

        private static string SanitizeErrorMessage(Exception ex)
        {
            return ex is ArgumentException || ex is InvalidOperationException
                ? ex.Message
                : "Processing encountered an unexpected error. Please retry.";
        }
    }
}
