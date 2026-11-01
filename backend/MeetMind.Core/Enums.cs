namespace MeetMind.Core.Enums
{
    public enum UserRole
    {
        Admin,
        Member,
        Instructor,
        Student
    }

    public enum JobStatus
    {
        Queued,
        Uploading,
        Transcribing,
        Analyzing,
        Completed,
        Failed,
        Cancelled
    }

    public enum ResourceStatus
    {
        Queued,
        Processing,
        Completed,
        Failed
    }

    public enum TaskPriority
    {
        Low,
        Medium,
        High
    }
}
