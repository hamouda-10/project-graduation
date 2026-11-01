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
        public string? Department { get; set; }
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

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
        public string? Summary { get; set; }

        public ICollection<TranscriptSegment> TranscriptSegments { get; set; } = new List<TranscriptSegment>();
        public ICollection<ActionItem> ActionItems { get; set; } = new List<ActionItem>();

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
        public string? StudyNotes { get; set; }

        public ICollection<TranscriptSegment> TranscriptSegments { get; set; } = new List<TranscriptSegment>();
        public ICollection<Quiz> Quizzes { get; set; } = new List<Quiz>();
        public ICollection<Flashcard> Flashcards { get; set; } = new List<Flashcard>();

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
    }

    public class ActionItem
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid? MeetingId { get; set; }
        public Meeting? Meeting { get; set; }
        public Guid? LectureId { get; set; }
        public Lecture? Lecture { get; set; }

        public string Title { get; set; } = string.Empty;
        public string? OwnerName { get; set; }
        public DateTime? DueDateUtc { get; set; }
        public TaskPriority Priority { get; set; } = TaskPriority.Medium;
        public bool Completed { get; set; } = false;
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public class Quiz
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid? LectureId { get; set; }
        public Lecture? Lecture { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? CourseCode { get; set; }
        public int AttemptsCount { get; set; } = 0;
        public int? LastScorePercent { get; set; }
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public ICollection<QuizQuestion> Questions { get; set; } = new List<QuizQuestion>();
    }

    public class QuizQuestion
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid QuizId { get; set; }
        public Quiz Quiz { get; set; } = null!;
        public string QuestionText { get; set; } = string.Empty;
        public string OptionsJson { get; set; } = "[]"; // Serialized string[]
        public int CorrectOptionIndex { get; set; }
        public string Explanation { get; set; } = string.Empty;
    }

    public class Flashcard
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid? LectureId { get; set; }
        public Lecture? Lecture { get; set; }
        public string DeckTitle { get; set; } = string.Empty;
        public string Front { get; set; } = string.Empty;
        public string Back { get; set; } = string.Empty;
        public bool Mastered { get; set; } = false;
        public int ReviewCount { get; set; } = 0;
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public class ProcessingJob
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string JobType { get; set; } = "Transcription";
        public JobStatus Status { get; set; } = JobStatus.Queued;
        public int ProgressPercent { get; set; } = 0;
        public string ResourceType { get; set; } = "meeting";
        public Guid ResourceId { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string? ErrorMessage { get; set; }
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
        public string Title { get; set; } = string.Empty;
        public DateTime EventDateUtc { get; set; }
        public string EventTime { get; set; } = string.Empty;
        public string Kind { get; set; } = "meeting";
        public Guid? ReferenceId { get; set; }
        public int AttendeesCount { get; set; } = 1;
    }
}
