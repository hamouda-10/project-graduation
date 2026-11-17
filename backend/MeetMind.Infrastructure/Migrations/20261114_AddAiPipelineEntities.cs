using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MeetMind.Infrastructure.Migrations
{
    public partial class AddAiPipelineEntities : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DetailedSummary",
                table: "Meetings",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DecisionsJson",
                table: "Meetings",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "FileSizeBytes",
                table: "Meetings",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FullTranscriptText",
                table: "Meetings",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Language",
                table: "Meetings",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "auto");

            migrationBuilder.AddColumn<string>(
                name: "MediaMimeType",
                table: "Meetings",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DetailedSummary",
                table: "Lectures",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "FileSizeBytes",
                table: "Lectures",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FullTranscriptText",
                table: "Lectures",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Language",
                table: "Lectures",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "auto");

            migrationBuilder.AddColumn<string>(
                name: "MediaMimeType",
                table: "Lectures",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ChunkIndex",
                table: "TranscriptSegments",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<double>(
                name: "Confidence",
                table: "TranscriptSegments",
                type: "float",
                nullable: false,
                defaultValue: 0.92);

            migrationBuilder.AddColumn<bool>(
                name: "IsPartial",
                table: "TranscriptSegments",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Language",
                table: "TranscriptSegments",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "auto");

            migrationBuilder.AddColumn<string>(
                name: "DeadlineText",
                table: "ActionItems",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SourceTimestamp",
                table: "ActionItems",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "ActionItems",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: Guid.Empty);

            migrationBuilder.AddColumn<string>(
                name: "CorrelationId",
                table: "ProcessingJobs",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "FailureCategory",
                table: "ProcessingJobs",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "FailureTimestampUtc",
                table: "ProcessingJobs",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IdempotencyKey",
                table: "ProcessingJobs",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Language",
                table: "ProcessingJobs",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "auto");

            migrationBuilder.AddColumn<DateTime>(
                name: "LastAttemptAtUtc",
                table: "ProcessingJobs",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxRetries",
                table: "ProcessingJobs",
                type: "int",
                nullable: false,
                defaultValue: 2);

            migrationBuilder.AddColumn<int>(
                name: "RetryCount",
                table: "ProcessingJobs",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Stage",
                table: "ProcessingJobs",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "Queued");

            migrationBuilder.AddColumn<string>(
                name: "StoragePath",
                table: "ProcessingJobs",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "ProcessingJobs",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: Guid.Empty);

            migrationBuilder.CreateTable(
                name: "Topics",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    LectureId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Name = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Summary = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    StartTimeSeconds = table.Column<double>(type: "float", nullable: false),
                    EndTimeSeconds = table.Column<double>(type: "float", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Topics", x => x.Id);
                    table.ForeignKey("FK_Topics_Meetings_MeetingId", x => x.MeetingId, "Meetings", "Id", onDelete: ReferentialAction.Cascade);
                    table.ForeignKey("FK_Topics_Lectures_LectureId", x => x.LectureId, "Lectures", "Id", onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Keywords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    LectureId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Term = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Frequency = table.Column<int>(type: "int", nullable: false),
                    ImportanceScore = table.Column<double>(type: "float", nullable: false),
                    SegmentIdsJson = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Keywords", x => x.Id);
                    table.ForeignKey("FK_Keywords_Meetings_MeetingId", x => x.MeetingId, "Meetings", "Id", onDelete: ReferentialAction.Cascade);
                    table.ForeignKey("FK_Keywords_Lectures_LectureId", x => x.LectureId, "Lectures", "Id", onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Highlights",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MeetingId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    LectureId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Quote = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Context = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Speaker = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    TimestampText = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Category = table.Column<int>(type: "int", nullable: false),
                    Priority = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Highlights", x => x.Id);
                    table.ForeignKey("FK_Highlights_Meetings_MeetingId", x => x.MeetingId, "Meetings", "Id", onDelete: ReferentialAction.Cascade);
                    table.ForeignKey("FK_Highlights_Lectures_LectureId", x => x.LectureId, "Lectures", "Id", onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "QuizAttempts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuizId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ScorePercent = table.Column<int>(type: "int", nullable: false),
                    CorrectCount = table.Column<int>(type: "int", nullable: false),
                    TotalQuestions = table.Column<int>(type: "int", nullable: false),
                    AnswersJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SubmittedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuizAttempts", x => x.Id);
                    table.ForeignKey("FK_QuizAttempts_Quizzes_QuizId", x => x.QuizId, "Quizzes", "Id", onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MindMaps",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LectureId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    MeetingId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: false),
                    RootNodeJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MindMaps", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AuditLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Action = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Resource = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    MetadataJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditLogs", x => x.Id);
                });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "Topics");
            migrationBuilder.DropTable(name: "Keywords");
            migrationBuilder.DropTable(name: "Highlights");
            migrationBuilder.DropTable(name: "QuizAttempts");
            migrationBuilder.DropTable(name: "MindMaps");
            migrationBuilder.DropTable(name: "AuditLogs");
        }
    }
}
