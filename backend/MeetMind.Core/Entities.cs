using System;
using System.Collections.Generic;
using MeetMind.Core.Enums;

namespace MeetMind.Core.Entities
{
    public class User
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Email { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public UserRole Role { get; set; } = UserRole.Member;
        public string? AvatarUrl { get; set; }
        public string? AvatarFileName { get; set; }
        public string? Bio { get; set; }
        public string? JobTitle { get; set; }
        public string? Department { get; set; }
        public string? Organization { get; set; }
        public bool NameCustomized { get; set; } = false;
        public bool AvatarCustomized { get; set; } = false;
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

        public ICollection<WorkspaceMembership> Memberships { get; set; } = new List<WorkspaceMembership>();
    }

    public class Workspace
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Name { get; set; } = string.Empty;
        public string Slug { get; set; } = string.Empty;
        public Guid OwnerId { get; set; }
        public string Plan { get; set; } = "Enterprise";
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public ICollection<Meeting> Meetings { get; set; } = new List<Meeting>();
        public ICollection<Lecture> Lectures { get; set; } = new List<Lecture>();
    }

    public class WorkspaceMembership
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid WorkspaceId { get; set; }
        public Workspace Workspace { get; set; } = null!;
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        public UserRole Role { get; set; }
    }

    public class Meeting
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid WorkspaceId { get; set; }
        public Workspace Workspace { get; set; } = null!;
        public string Title { get; set; } = string.Empty;
        public Guid HostId { get; set; }
        public string HostName { get; set; } = string.Empty;
        public DateTime ScheduledDateUtc { get; set; }
        public int DurationSeconds { get; set; }
        public int ParticipantsCount { get; set; }
        public ResourceStatus Status { get; set; } = ResourceStatus.Processing;

        public string? StoragePath { get; set; }
        public string? OriginalFileName { get; set; }
        public string? MediaMimeType { get; set; }
        public long? FileSizeBytes { get; set; }
        public string Language { get; set; } = "auto";
        public string? FullTranscriptText { get; set; }
        public string? Summary { get; set; }
        public string? DetailedSummary { get; set; }
        public string? DecisionsJson { get; set; }

        public ICollection<TranscriptSegment> TranscriptSegments { get; set; } = new List<TranscriptSegment>();
        public ICollection<ActionItem> ActionItems { get; set; } = new List<ActionItem>();
        public ICollection<Topic> Topics { get; set; } = new List<Topic>();
        public ICollection<Keyword> Keywords { get; set; } = new List<Keyword>();
        public ICollection<Highlight> Highlights { get; set; } = new List<Highlight>();

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public class Lecture
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid WorkspaceId { get; set; }
        public Workspace Workspace { get; set; } = null!;
        public string Title { get; set; } = string.Empty;
        public string CourseCode { get; set; } = string.Empty;
        public Guid InstructorId { get; set; }
        public string InstructorName { get; set; } = string.Empty;
        public DateTime ScheduledDateUtc { get; set; }
        public int DurationSeconds { get; set; }
        public ResourceStatus Status { get; set; } = ResourceStatus.Processing;

        public string? StoragePath { get; set; }
        public string? OriginalFileName { get; set; }
        public string? MediaMimeType { get; set; }
        public long? FileSizeBytes { get; set; }
        public string Language { get; set; } = "auto";
        public string? FullTranscriptText { get; set; }
        public string? StudyNotes { get; set; }
        public string? DetailedSummary { get; set; }

        public ICollection<TranscriptSegment> TranscriptSegments { get; set; } = new List<TranscriptSegment>();
        public ICollection<ActionItem> ActionItems { get; set; } = new List<ActionItem>();
        public ICollection<Quiz> Quizzes { get; set; } = new List<Quiz>();
        public ICollection<Flashcard> Flashcards { get; set; } = new List<Flashcard>();
        public ICollection<Topic> Topics { get; set; } = new List<Topic>();
        public ICollection<Keyword> Keywords { get; set; } = new List<Keyword>();
        public ICollection<Highlight> Highlights { get; set; } = new List<Highlight>();

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public class TranscriptSegment
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid? MeetingId { get; set; }
        public Meeting? Meeting { get; set; }
        public Guid? LectureId { get; set; }
        public Lecture? Lecture { get; set; }

        public string Speaker { get; set; } = string.Empty;
        public double StartTimeSeconds { get; set; }
        public double EndTimeSeconds { get; set; }
        public string Text { get; set; } = string.Empty;
        public double Confidence { get; set; } = 0.92;
        public bool IsPartial { get; set; } = false;
        public int ChunkIndex { get; set; } = 0;
        public string Language { get; set; } = "auto";
    }

    public class Topic
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid? MeetingId { get; set; }
        public Meeting? Meeting { get; set; }
        public Guid? LectureId { get; set; }
        public Lecture? Lecture { get; set; }

        public string Name { get; set; } = string.Empty;
        public string? Summary { get; set; }
        public double StartTimeSeconds { get; set; }
        public double EndTimeSeconds { get; set; }
    }

    public class Keyword
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid? MeetingId { get; set; }
        public Meeting? Meeting { get; set; }
        public Guid? LectureId { get; set; }
        public Lecture? Lecture { get; set; }

        public string Term { get; set; } = string.Empty;
        public int Frequency { get; set; } = 1;
        public double ImportanceScore { get; set; } = 0.5;
        public string? SegmentIdsJson { get; set; }
    }

    public class Highlight
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid? MeetingId { get; set; }
        public Meeting? Meeting { get; set; }
        public Guid? LectureId { get; set; }
        public Lecture? Lecture { get; set; }

        public string Quote { get; set; } = string.Empty;
        public string? Context { get; set; }
        public string? Speaker { get; set; }
        public string? TimestampText { get; set; }
        public HighlightCategory Category { get; set; } = HighlightCategory.KeyConcept;
        public TaskPriority Priority { get; set; } = TaskPriority.Medium;
    }

    public class ActionItem
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid? MeetingId { get; set; }
        public Meeting? Meeting { get; set; }
        public Guid? LectureId { get; set; }
        public Lecture? Lecture { get; set; }
        public Guid UserId { get; set; }

        public string Title { get; set; } = string.Empty;
        public string? OwnerName { get; set; }
        public DateTime? DueDateUtc { get; set; }
        public string? DeadlineText { get; set; } = "Deadline not specified.";
        public string? SourceTimestamp { get; set; }
        public TaskPriority Priority { get; set; } = TaskPriority.Medium;
        public bool Completed { get; set; } = false;
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public class Quiz
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid? LectureId { get; set; }
        public Lecture? Lecture { get; set; }
        public Guid? MeetingId { get; set; }
        public Guid UserId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? CourseCode { get; set; }
        public int AttemptsCount { get; set; } = 0;
        public int? LastScorePercent { get; set; }
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public ICollection<QuizQuestion> Questions { get; set; } = new List<QuizQuestion>();
        public ICollection<QuizAttempt> Attempts { get; set; } = new List<QuizAttempt>();
    }

    public class QuizQuestion
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid QuizId { get; set; }
        public Quiz Quiz { get; set; } = null!;
        public string QuestionText { get; set; } = string.Empty;
        public QuizQuestionType QuestionType { get; set; } = QuizQuestionType.MultipleChoice;
        public string OptionsJson { get; set; } = "[]";
        public int CorrectOptionIndex { get; set; }
        public string? CorrectAnswerText { get; set; }
        public string Explanation { get; set; } = string.Empty;
        public string Difficulty { get; set; } = "medium";
        public string? SourceTimestamp { get; set; }
        public string? SourceReference { get; set; }
    }

    public class QuizAttempt
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid QuizId { get; set; }
        public Quiz Quiz { get; set; } = null!;
        public Guid UserId { get; set; }
        public int ScorePercent { get; set; }
        public int CorrectCount { get; set; }
        public int TotalQuestions { get; set; }
        public string AnswersJson { get; set; } = "{}";
        public DateTime SubmittedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public class Flashcard
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid? LectureId { get; set; }
        public Lecture? Lecture { get; set; }
        public Guid? MeetingId { get; set; }
        public Guid UserId { get; set; }
        public string DeckTitle { get; set; } = string.Empty;
        public string Front { get; set; } = string.Empty;
        public string Back { get; set; } = string.Empty;
        public string? TimestampRef { get; set; }
        public string? Topic { get; set; }
        public string Difficulty { get; set; } = "medium";
        public bool Mastered { get; set; } = false;
        public int ReviewCount { get; set; } = 0;
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public class ChatMessage
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public Guid? MeetingId { get; set; }
        public Guid? LectureId { get; set; }
        public string Role { get; set; } = "user";
        public string Content { get; set; } = string.Empty;
        public bool EvidenceFound { get; set; } = false;
        public string? CitationsJson { get; set; }
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public class MindMap
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid? LectureId { get; set; }
        public Guid? MeetingId { get; set; }
        public Guid UserId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string RootNodeJson { get; set; } = "{}";
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public class ProcessingJob
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public string CorrelationId { get; set; } = Guid.NewGuid().ToString("N");
        public string? IdempotencyKey { get; set; }
        public string JobType { get; set; } = "Transcription";
        public JobStatus Status { get; set; } = JobStatus.Queued;
        public string Stage { get; set; } = "Queued";
        public int ProgressPercent { get; set; } = 0;
        public string ResourceType { get; set; } = "meeting";
        public Guid ResourceId { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string? StoragePath { get; set; }
        public string Language { get; set; } = "auto";
        public int RetryCount { get; set; } = 0;
        public int MaxRetries { get; set; } = 2;
        public JobFailureCategory FailureCategory { get; set; } = JobFailureCategory.None;
        public string? ErrorMessage { get; set; }
        public DateTime? LastAttemptAtUtc { get; set; }
        public DateTime? FailureTimestampUtc { get; set; }
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public class Notification
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Body { get; set; } = string.Empty;
        public string TargetUrl { get; set; } = string.Empty;
        public bool Read { get; set; } = false;
        public string Type { get; set; } = "Summary";
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public class CalendarEvent
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public string Title { get; set; } = string.Empty;
        public DateTime EventDateUtc { get; set; }
        public string EventTime { get; set; } = string.Empty;
        public string Kind { get; set; } = "meeting";
        public Guid? ReferenceId { get; set; }
        public int AttendeesCount { get; set; } = 1;
    }

    public class AuditLog
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public string Action { get; set; } = string.Empty;
        public string Resource { get; set; } = string.Empty;
        public string? MetadataJson { get; set; }
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    }
}
