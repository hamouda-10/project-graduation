using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MeetMind.Api.Hubs;
using MeetMind.Api.Services;
using MeetMind.Core.Entities;
using MeetMind.Core.Enums;
using MeetMind.Infrastructure.Data;

namespace MeetMind.Api.Controllers
{
    public class AiAskRequest
    {
        public string Question { get; set; } = string.Empty;
        public string Prompt { get; set; } = string.Empty;
        public Guid? ResourceId { get; set; }
    }

    public class AiAnalyzeRequest
    {
        public Guid ResourceId { get; set; }
        public string ResourceType { get; set; } = "meeting";
    }

    [ApiController]
    [Route("api/v1/[controller]")]
    public class AiController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IAiServiceClient _aiClient;
        private readonly ICurrentUserService _currentUser;
        private readonly IHubContext<ProcessingHub> _hub;

        public AiController(
            ApplicationDbContext db,
            IAiServiceClient aiClient,
            ICurrentUserService currentUser,
            IHubContext<ProcessingHub> hub)
        {
            _db = db;
            _aiClient = aiClient;
            _currentUser = currentUser;
            _hub = hub;
        }

        private bool IsAdmin => _currentUser.IsAdmin;

        [HttpGet("chat-history")]
        public async Task<IActionResult> GetChatHistory([FromQuery] Guid? resourceId, CancellationToken ct)
        {
            var query = _db.ChatMessages.AsNoTracking().Where(c => IsAdmin || c.UserId == _currentUser.UserId);
            if (resourceId.HasValue)
            {
                query = query.Where(c => c.MeetingId == resourceId.Value || c.LectureId == resourceId.Value);
            }
            var messages = await query.OrderByDescending(c => c.CreatedAtUtc).Take(50).ToListAsync(ct);
            messages.Reverse();
            return Ok(messages);
        }

        [HttpPost("ask")]
        public async Task<IActionResult> Ask([FromBody] AiAskRequest request, CancellationToken ct)
        {
            var question = !string.IsNullOrWhiteSpace(request.Question) ? request.Question.Trim() : request.Prompt.Trim();
            if (string.IsNullOrWhiteSpace(question))
            {
                return BadRequest(new { error = "Question is required." });
            }

            if (request.ResourceId.HasValue)
            {
                var (title, _, _, segments) = await LoadResourceAsync(request.ResourceId.Value, ct);
                if (title == null)
                {
                    var existsElsewhere =
                        await _db.Meetings.AnyAsync(m => m.Id == request.ResourceId.Value, ct) ||
                        await _db.Lectures.AnyAsync(l => l.Id == request.ResourceId.Value, ct);
                    return existsElsewhere
                        ? StatusCode(403, new { error = "You do not have permission to query this recording." })
                        : NotFound(new { error = "Recording not found." });
                }

                var isMeeting = await _db.Meetings.AnyAsync(m => m.Id == request.ResourceId.Value, ct);
                if (segments.Count == 0)
                {
                    await SaveChatTurnAsync(question, "Not mentioned in this recording.", false, Array.Empty<object>(), isMeeting ? request.ResourceId : null, isMeeting ? null : request.ResourceId, ct);
                    return Ok(new
                    {
                        answer = "Not mentioned in this recording.",
                        evidenceFound = false,
                        citations = Array.Empty<object>()
                    });
                }

                var result = await _aiClient.AskQuestionAsync(title, question, segments, ct);
                var answerText = result.EvidenceFound ? result.Answer : "Not mentioned in this recording.";
                await SaveChatTurnAsync(question, answerText, result.EvidenceFound, result.Citations, isMeeting ? request.ResourceId : null, isMeeting ? null : request.ResourceId, ct);
                return Ok(new
                {
                    answer = answerText,
                    evidenceFound = result.EvidenceFound,
                    citations = result.Citations
                });
            }

            // Cross-workspace grounded Q&A scoped strictly to current user's completed recordings
            var meetings = await _db.Meetings
                .Include(m => m.TranscriptSegments)
                .Where(m => (IsAdmin || m.HostId == _currentUser.UserId) && m.TranscriptSegments.Any())
                .OrderByDescending(m => m.CreatedAtUtc)
                .Take(3)
                .ToListAsync(ct);

            var lectures = await _db.Lectures
                .Include(l => l.TranscriptSegments)
                .Where(l => (IsAdmin || l.InstructorId == _currentUser.UserId) && l.TranscriptSegments.Any())
                .OrderByDescending(l => l.CreatedAtUtc)
                .Take(3)
                .ToListAsync(ct);

            var combinedSegments = new List<AiTranscriptSegmentDto>();
            foreach (var m in meetings)
            {
                combinedSegments.AddRange(m.TranscriptSegments.Select(ToDto));
            }
            foreach (var l in lectures)
            {
                combinedSegments.AddRange(l.TranscriptSegments.Select(ToDto));
            }

            if (combinedSegments.Count == 0)
            {
                var noDataMsg = "No completed meeting or lecture transcripts exist yet. Upload or record audio first.";
                await SaveChatTurnAsync(question, noDataMsg, false, Array.Empty<object>(), null, null, ct);
                return Ok(new
                {
                    answer = noDataMsg,
                    evidenceFound = false,
                    citations = Array.Empty<object>()
                });
            }

            var workspaceAnswer = await _aiClient.AskQuestionAsync("Workspace Recordings", question, combinedSegments, ct);
            var finalWorkspaceAnswer = workspaceAnswer.EvidenceFound ? workspaceAnswer.Answer : "Not mentioned in this recording.";
            await SaveChatTurnAsync(question, finalWorkspaceAnswer, workspaceAnswer.EvidenceFound, workspaceAnswer.Citations, null, null, ct);
            return Ok(new
            {
                answer = finalWorkspaceAnswer,
                evidenceFound = workspaceAnswer.EvidenceFound,
                citations = workspaceAnswer.Citations
            });
        }

        private async Task SaveChatTurnAsync(
            string question,
            string answer,
            bool evidenceFound,
            object citations,
            Guid? meetingId,
            Guid? lectureId,
            CancellationToken ct)
        {
            var now = DateTime.UtcNow;
            _db.ChatMessages.Add(new ChatMessage
            {
                UserId = _currentUser.UserId,
                MeetingId = meetingId,
                LectureId = lectureId,
                Role = "user",
                Content = question,
                CreatedAtUtc = now
            });
            _db.ChatMessages.Add(new ChatMessage
            {
                UserId = _currentUser.UserId,
                MeetingId = meetingId,
                LectureId = lectureId,
                Role = "assistant",
                Content = answer,
                EvidenceFound = evidenceFound,
                CitationsJson = JsonSerializer.Serialize(citations),
                CreatedAtUtc = now.AddMilliseconds(1)
            });
            await _db.SaveChangesAsync(ct);
        }

        [HttpPost("analyze")]
        [HttpPost("generate-summary")]
        [HttpPost("generate-quiz")]
        public async Task<IActionResult> AnalyzeResource([FromBody] AiAnalyzeRequest request, CancellationToken ct)
        {
            if (request.ResourceId == Guid.Empty)
            {
                return BadRequest(new { error = "ResourceId is required." });
            }

            var (title, language, courseCode, segments) = await LoadResourceAsync(request.ResourceId, ct);
            if (title == null)
            {
                return NotFound(new { error = "Recording not found." });
            }

            if (segments.Count == 0)
            {
                return UnprocessableEntity(new { error = "No transcript segments exist for this recording yet." });
            }

            var meeting = await _db.Meetings
                .Include(m => m.ActionItems)
                .Include(m => m.Topics)
                .Include(m => m.Keywords)
                .Include(m => m.Highlights)
                .FirstOrDefaultAsync(m => m.Id == request.ResourceId, ct);

            var lecture = meeting == null
                ? await _db.Lectures
                    .Include(l => l.ActionItems)
                    .Include(l => l.Topics)
                    .Include(l => l.Keywords)
                    .Include(l => l.Highlights)
                    .FirstOrDefaultAsync(l => l.Id == request.ResourceId, ct)
                : null;

            var resourceType = meeting != null ? "meeting" : "lecture";
            var analysis = await _aiClient.AnalyzeTranscriptAsync(title, resourceType, language, segments, courseCode, ct);

            await PersistAnalysisResultsAsync(request.ResourceId, title, courseCode, meeting, lecture, analysis, ct);

            var ownerId = meeting?.HostId ?? lecture?.InstructorId ?? _currentUser.UserId;
            await _hub.Clients.Group($"User_{ownerId}").SendAsync("AIAnalysisCompleted", new
            {
                resourceId = request.ResourceId,
                resourceType,
                summaryReady = !string.IsNullOrWhiteSpace(analysis.ExecutiveSummary),
                keywordsCount = analysis.Keywords.Count,
                tasksCount = analysis.ActionItems.Count,
                quizCount = analysis.QuizQuestions.Count
            }, ct);

            return Ok(analysis);
        }

        private async Task<(string? Title, string Language, string? CourseCode, List<AiTranscriptSegmentDto> Segments)> LoadResourceAsync(
            Guid resourceId,
            CancellationToken ct)
        {
            var meeting = await _db.Meetings
                .Include(m => m.TranscriptSegments)
                .FirstOrDefaultAsync(m => m.Id == resourceId && (IsAdmin || m.HostId == _currentUser.UserId), ct);

            if (meeting != null)
            {
                return (
                    meeting.Title,
                    meeting.Language,
                    null,
                    meeting.TranscriptSegments.OrderBy(s => s.StartTimeSeconds).Select(ToDto).ToList());
            }

            var lecture = await _db.Lectures
                .Include(l => l.TranscriptSegments)
                .FirstOrDefaultAsync(l => l.Id == resourceId && (IsAdmin || l.InstructorId == _currentUser.UserId), ct);

            if (lecture != null)
            {
                return (
                    lecture.Title,
                    lecture.Language,
                    lecture.CourseCode,
                    lecture.TranscriptSegments.OrderBy(s => s.StartTimeSeconds).Select(ToDto).ToList());
            }

            return (null, "auto", null, new List<AiTranscriptSegmentDto>());
        }

        private async Task PersistAnalysisResultsAsync(
            Guid resourceId,
            string title,
            string? courseCode,
            Meeting? meeting,
            Lecture? lecture,
            AiAnalysisResponseDto analysis,
            CancellationToken ct)
        {
            var ownerId = meeting?.HostId ?? lecture?.InstructorId ?? _currentUser.UserId;
            var isMeeting = meeting != null;

            if (meeting != null)
            {
                meeting.Summary = analysis.ExecutiveSummary;
                meeting.DetailedSummary = analysis.DetailedSummary;
                meeting.DecisionsJson = JsonSerializer.Serialize(analysis.Decisions ?? new List<string>());
                meeting.Status = ResourceStatus.Completed;
                meeting.UpdatedAtUtc = DateTime.UtcNow;

                _db.Topics.RemoveRange(meeting.Topics);
                _db.Keywords.RemoveRange(meeting.Keywords);
                _db.Highlights.RemoveRange(meeting.Highlights);
                _db.ActionItems.RemoveRange(meeting.ActionItems);
            }
            else if (lecture != null)
            {
                lecture.StudyNotes = analysis.ExecutiveSummary;
                lecture.DetailedSummary = analysis.DetailedSummary;
                lecture.Status = ResourceStatus.Completed;
                lecture.UpdatedAtUtc = DateTime.UtcNow;

                _db.Topics.RemoveRange(lecture.Topics);
                _db.Keywords.RemoveRange(lecture.Keywords);
                _db.Highlights.RemoveRange(lecture.Highlights);
                _db.ActionItems.RemoveRange(lecture.ActionItems);
            }

            foreach (var topic in analysis.Topics ?? new List<string>())
            {
                _db.Topics.Add(new Topic
                {
                    MeetingId = isMeeting ? resourceId : null,
                    LectureId = isMeeting ? null : resourceId,
                    Name = topic
                });
            }

            foreach (var kw in analysis.Keywords ?? new List<AiKeywordDto>())
            {
                _db.Keywords.Add(new Keyword
                {
                    MeetingId = isMeeting ? resourceId : null,
                    LectureId = isMeeting ? null : resourceId,
                    Term = kw.Term,
                    Frequency = kw.Frequency,
                    ImportanceScore = kw.Importance,
                    SegmentIdsJson = JsonSerializer.Serialize(kw.SegmentIds ?? new List<string>())
                });
            }

            foreach (var hl in analysis.Highlights ?? new List<AiHighlightDto>())
            {
                _db.Highlights.Add(new Highlight
                {
                    MeetingId = isMeeting ? resourceId : null,
                    LectureId = isMeeting ? null : resourceId,
                    Quote = hl.Quote,
                    Context = hl.Context,
                    Speaker = hl.Speaker,
                    TimestampText = hl.Timestamp,
                    Category = Enum.TryParse<HighlightCategory>(hl.Category, true, out var cat) ? cat : HighlightCategory.KeyConcept,
                    Priority = Enum.TryParse<TaskPriority>(hl.Priority, true, out var pri) ? pri : TaskPriority.Medium
                });
            }

            foreach (var item in analysis.ActionItems ?? new List<AiActionItemDto>())
            {
                _db.ActionItems.Add(new ActionItem
                {
                    MeetingId = isMeeting ? resourceId : null,
                    LectureId = isMeeting ? null : resourceId,
                    UserId = ownerId,
                    Title = item.Task,
                    OwnerName = string.IsNullOrWhiteSpace(item.Assignee) ? null : item.Assignee,
                    DeadlineText = string.IsNullOrWhiteSpace(item.Deadline) ? "Deadline not specified." : item.Deadline,
                    SourceTimestamp = item.SourceTimestamp,
                    Priority = Enum.TryParse<TaskPriority>(item.Priority, true, out var p) ? p : TaskPriority.Medium
                });
            }

            if (analysis.QuizQuestions != null && analysis.QuizQuestions.Count > 0)
            {
                var existingQuizzes = await _db.Quizzes
                    .Where(q => (isMeeting && q.MeetingId == resourceId) || (!isMeeting && q.LectureId == resourceId))
                    .ToListAsync(ct);
                _db.Quizzes.RemoveRange(existingQuizzes);

                var quiz = new Quiz
                {
                    MeetingId = isMeeting ? resourceId : null,
                    LectureId = isMeeting ? null : resourceId,
                    UserId = ownerId,
                    Title = $"{title} — Assessment",
                    CourseCode = courseCode
                };

                foreach (var q in analysis.QuizQuestions)
                {
                    var qType = q.Type?.ToLowerInvariant() switch
                    {
                        "true_false" => QuizQuestionType.TrueFalse,
                        "short_answer" => QuizQuestionType.ShortAnswer,
                        "fill_in_blank" => QuizQuestionType.FillInTheBlank,
                        _ => QuizQuestionType.MultipleChoice
                    };

                    quiz.Questions.Add(new QuizQuestion
                    {
                        QuestionText = q.Question,
                        QuestionType = qType,
                        OptionsJson = JsonSerializer.Serialize(q.Options ?? new List<string>()),
                        CorrectOptionIndex = q.CorrectOptionIndex,
                        CorrectAnswerText = q.CorrectAnswerText,
                        Explanation = q.Explanation,
                        Difficulty = q.Difficulty ?? "medium",
                        SourceTimestamp = q.TimestampRef
                    });
                }

                _db.Quizzes.Add(quiz);
            }

            if (analysis.Flashcards != null && analysis.Flashcards.Count > 0)
            {
                var existingFlashcards = await _db.Flashcards
                    .Where(f => (isMeeting && f.MeetingId == resourceId) || (!isMeeting && f.LectureId == resourceId))
                    .ToListAsync(ct);
                _db.Flashcards.RemoveRange(existingFlashcards);

                foreach (var fc in analysis.Flashcards)
                {
                    _db.Flashcards.Add(new Flashcard
                    {
                        MeetingId = isMeeting ? resourceId : null,
                        LectureId = isMeeting ? null : resourceId,
                        UserId = ownerId,
                        DeckTitle = title,
                        Front = fc.Front,
                        Back = fc.Back,
                        TimestampRef = fc.TimestampRef
                    });
                }
            }

            if (analysis.MindMap.HasValue)
            {
                var existingMaps = await _db.MindMaps
                    .Where(m => (isMeeting && m.MeetingId == resourceId) || (!isMeeting && m.LectureId == resourceId))
                    .ToListAsync(ct);
                _db.MindMaps.RemoveRange(existingMaps);

                _db.MindMaps.Add(new MindMap
                {
                    MeetingId = isMeeting ? resourceId : null,
                    LectureId = isMeeting ? null : resourceId,
                    UserId = ownerId,
                    Title = title,
                    RootNodeJson = analysis.MindMap.Value.GetRawText()
                });
            }

            await _db.SaveChangesAsync(ct);
        }

        private static AiTranscriptSegmentDto ToDto(TranscriptSegment s) =>
            new(
                s.Id.ToString(),
                s.Speaker,
                s.StartTimeSeconds,
                s.EndTimeSeconds,
                s.Text,
                s.Confidence,
                s.Language,
                s.ChunkIndex,
                s.IsPartial);
    }
}
