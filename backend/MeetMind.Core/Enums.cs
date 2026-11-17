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
        Uploaded,
        Validating,
        ExtractingAudio,
        Transcribing,
        Translating,
        Merging,
        Analyzing,
        GeneratingQuiz,
        Completed,
        Failed,
        Cancelled
    }

    public enum JobFailureCategory
    {
        None,
        MediaValidationError,
        AudioExtractionError,
        TranscriptionServiceError,
        AiAnalysisError,
        StorageError,
        TimeoutError,
        CancelledByUser,
        UnknownError
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

    public enum QuizQuestionType
    {
        MultipleChoice,
        TrueFalse,
        ShortAnswer,
        FillInTheBlank
    }

    public enum HighlightCategory
    {
        KeyConcept,
        ExamTip,
        Decision,
        Warning,
        Quote,
        Definition
    }
}
