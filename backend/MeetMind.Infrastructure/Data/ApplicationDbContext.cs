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
        public DbSet<ActionItem> ActionItems => Set<ActionItem>();
        public DbSet<Quiz> Quizzes => Set<Quiz>();
        public DbSet<QuizQuestion> QuizQuestions => Set<QuizQuestion>();
        public DbSet<Flashcard> Flashcards => Set<Flashcard>();
        public DbSet<ProcessingJob> ProcessingJobs => Set<ProcessingJob>();
        public DbSet<Notification> Notifications => Set<Notification>();
        public DbSet<CalendarEvent> CalendarEvents => Set<CalendarEvent>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // User Email Unique Index
            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email)
                .IsUnique();

            // Workspace Slug Unique Index
            modelBuilder.Entity<Workspace>()
                .HasIndex(w => w.Slug)
                .IsUnique();

            // Segment Relationships
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

            // Action Items
            modelBuilder.Entity<ActionItem>()
                .HasOne(a => a.Meeting)
                .WithMany(m => m.ActionItems)
                .HasForeignKey(a => a.MeetingId)
                .OnDelete(DeleteBehavior.Cascade);

            // Quiz & Questions
            modelBuilder.Entity<QuizQuestion>()
                .HasOne(q => q.Quiz)
                .WithMany(qz => qz.Questions)
                .HasForeignKey(q => q.QuizId)
                .OnDelete(DeleteBehavior.Cascade);

            // Flashcards
            modelBuilder.Entity<Flashcard>()
                .HasOne(f => f.Lecture)
                .WithMany(l => l.Flashcards)
                .HasForeignKey(f => f.LectureId)
                .OnDelete(DeleteBehavior.Cascade);
        }
    }
}
