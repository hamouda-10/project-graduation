using Microsoft.EntityFrameworkCore;
using MeetMind.Core.Entities;

namespace MeetMind.Infrastructure.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<User> Users => Set<User>();
        public DbSet<Workspace> Workspaces => Set<Workspace>();
        public DbSet<WorkspaceMembership> WorkspaceMemberships => Set<WorkspaceMembership>();
        public DbSet<Meeting> Meetings => Set<Meeting>();
        public DbSet<Lecture> Lectures => Set<Lecture>();
        public DbSet<TranscriptSegment> TranscriptSegments => Set<TranscriptSegment>();
        public DbSet<Topic> Topics => Set<Topic>();
        public DbSet<Keyword> Keywords => Set<Keyword>();
        public DbSet<Highlight> Highlights => Set<Highlight>();
        public DbSet<ActionItem> ActionItems => Set<ActionItem>();
        public DbSet<Quiz> Quizzes => Set<Quiz>();
        public DbSet<QuizQuestion> QuizQuestions => Set<QuizQuestion>();
        public DbSet<QuizAttempt> QuizAttempts => Set<QuizAttempt>();
        public DbSet<Flashcard> Flashcards => Set<Flashcard>();
        public DbSet<MindMap> MindMaps => Set<MindMap>();
        public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
        public DbSet<ProcessingJob> ProcessingJobs => Set<ProcessingJob>();
        public DbSet<Notification> Notifications => Set<Notification>();
        public DbSet<CalendarEvent> CalendarEvents => Set<CalendarEvent>();
        public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email)
                .IsUnique();

            modelBuilder.Entity<Workspace>()
                .HasIndex(w => w.Slug)
                .IsUnique();

            modelBuilder.Entity<Meeting>()
                .HasIndex(m => new { m.HostId, m.CreatedAtUtc });

            modelBuilder.Entity<Lecture>()
                .HasIndex(l => new { l.InstructorId, l.CreatedAtUtc });

            modelBuilder.Entity<ProcessingJob>()
                .HasIndex(j => new { j.UserId, j.Status });

            modelBuilder.Entity<ChatMessage>()
                .HasIndex(c => new { c.UserId, c.CreatedAtUtc });

            modelBuilder.Entity<ProcessingJob>()
                .HasIndex(j => j.IdempotencyKey)
                .IsUnique()
                .HasFilter("[IdempotencyKey] IS NOT NULL");

            modelBuilder.Entity<TranscriptSegment>()
                .HasOne(s => s.Meeting)
                .WithMany(m => m.TranscriptSegments)
                .HasForeignKey(s => s.MeetingId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<TranscriptSegment>()
                .HasOne(s => s.Lecture)
                .WithMany(l => l.TranscriptSegments)
                .HasForeignKey(s => s.LectureId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Topic>()
                .HasOne(t => t.Meeting)
                .WithMany(m => m.Topics)
                .HasForeignKey(t => t.MeetingId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Topic>()
                .HasOne(t => t.Lecture)
                .WithMany(l => l.Topics)
                .HasForeignKey(t => t.LectureId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Keyword>()
                .HasOne(k => k.Meeting)
                .WithMany(m => m.Keywords)
                .HasForeignKey(k => k.MeetingId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Keyword>()
                .HasOne(k => k.Lecture)
                .WithMany(l => l.Keywords)
                .HasForeignKey(k => k.LectureId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Highlight>()
                .HasOne(h => h.Meeting)
                .WithMany(m => m.Highlights)
                .HasForeignKey(h => h.MeetingId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Highlight>()
                .HasOne(h => h.Lecture)
                .WithMany(l => l.Highlights)
                .HasForeignKey(h => h.LectureId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<ActionItem>()
                .HasOne(a => a.Meeting)
                .WithMany(m => m.ActionItems)
                .HasForeignKey(a => a.MeetingId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<ActionItem>()
                .HasOne(a => a.Lecture)
                .WithMany(l => l.ActionItems)
                .HasForeignKey(a => a.LectureId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<QuizQuestion>()
                .HasOne(q => q.Quiz)
                .WithMany(qz => qz.Questions)
                .HasForeignKey(q => q.QuizId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<QuizAttempt>()
                .HasOne(qa => qa.Quiz)
                .WithMany(qz => qz.Attempts)
                .HasForeignKey(qa => qa.QuizId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Flashcard>()
                .HasOne(f => f.Lecture)
                .WithMany(l => l.Flashcards)
                .HasForeignKey(f => f.LectureId)
                .OnDelete(DeleteBehavior.Cascade);
        }
    }
}
