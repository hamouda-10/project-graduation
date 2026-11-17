using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;
using MeetMind.Api.Controllers;
using MeetMind.Api.Services;
using MeetMind.Core.Entities;
using MeetMind.Core.Enums;
using MeetMind.Infrastructure.Data;

namespace MeetMind.Tests
{
    internal class TestUserService : ICurrentUserService
    {
        public Guid UserId { get; set; }
        public bool IsAuthenticated { get; set; } = true;
        public bool IsAdmin { get; set; } = false;
        public string Email { get; set; } = "user@meetmind.ai";
    }

    public class AiPipelineIntegrationTests
    {
        private static ApplicationDbContext CreateDb()
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options;
            return new ApplicationDbContext(options);
        }

        [Fact]
        public void MediaValidation_RejectsEmptyAndUnsupportedFiles()
        {
            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?> { { "Storage:MaxRecordingSizeMb", "10" } })
                .Build();
            var validator = new MediaValidationService(config);

            var empty = validator.ValidateUploadDescriptor("empty.wav", 0, "audio/wav");
            Assert.False(empty.IsValid);
            Assert.Contains("empty", empty.ErrorMessage, StringComparison.OrdinalIgnoreCase);

            var invalidExt = validator.ValidateUploadDescriptor("notes.txt", 2048, "text/plain");
            Assert.False(invalidExt.IsValid);
            Assert.Contains("Unsupported", invalidExt.ErrorMessage, StringComparison.OrdinalIgnoreCase);

            var oversized = validator.ValidateUploadDescriptor("large.mp4", 20L * 1024 * 1024, "video/mp4");
            Assert.False(oversized.IsValid);

            var validMp4 = validator.ValidateUploadDescriptor("lecture.mp4", 4096, "video/mp4");
            Assert.True(validMp4.IsValid);
        }

        [Fact]
        public async Task UserIsolation_And_DeleteAll_OnlyAffectCurrentUsersRecordings()
        {
            using var db = CreateDb();
            var userA = Guid.NewGuid();
            var userB = Guid.NewGuid();
            var ws = new Workspace { Id = Guid.NewGuid(), Name = "WS", Slug = "ws", OwnerId = userA };
            db.Workspaces.Add(ws);

            db.Meetings.Add(new Meeting { Id = Guid.NewGuid(), WorkspaceId = ws.Id, HostId = userA, Title = "User A Sync" });
            db.Meetings.Add(new Meeting { Id = Guid.NewGuid(), WorkspaceId = ws.Id, HostId = userB, Title = "User B Sync" });
            await db.SaveChangesAsync();

            var controllerA = new MeetingsController(db, new TestUserService { UserId = userA, IsAuthenticated = true, IsAdmin = false });
            var resA = await controllerA.GetMeetings();
            var listA = Assert.IsAssignableFrom<IEnumerable<Meeting>>(resA.Value).ToList();
            Assert.Single(listA);
            Assert.Equal("User A Sync", listA[0].Title);

            await controllerA.DeleteAllMeetings();
            Assert.Empty(await db.Meetings.Where(m => m.HostId == userA).ToListAsync());
            Assert.Single(await db.Meetings.Where(m => m.HostId == userB).ToListAsync());
        }

        [Fact]
        public async Task CreateMeeting_DoesNotFabricateFakeSummaryOrTranscript()
        {
            using var db = CreateDb();
            var controller = new MeetingsController(db);
            var res = await controller.CreateMeeting(new CreateMeetingRequest { Title = "Real Sync" });
            var created = Assert.IsType<CreatedAtActionResult>(res.Result);
            var meeting = Assert.IsType<Meeting>(created.Value);

            Assert.Null(meeting.Summary);
            Assert.Empty(meeting.TranscriptSegments);
            Assert.Equal(ResourceStatus.Queued, meeting.Status);
        }

        [Fact]
        public async Task TranscriptSpeakerRename_And_ArabicRtlExport_PreserveUnicode()
        {
            using var db = CreateDb();
            var userId = Guid.NewGuid();
            var meetingId = Guid.NewGuid();
            var ws = new Workspace { Id = Guid.NewGuid(), Name = "WS", Slug = "ws", OwnerId = userId };
            db.Workspaces.Add(ws);
            db.Meetings.Add(new Meeting
            {
                Id = meetingId,
                WorkspaceId = ws.Id,
                HostId = userId,
                Title = "اجتماع الهندسة المعمارية",
                Summary = "ملخص الاجتماع الفني",
                TranscriptSegments = new List<TranscriptSegment>
                {
                    new() { MeetingId = meetingId, Speaker = "Speaker 1", StartTimeSeconds = 0, EndTimeSeconds = 4, Text = "مرحبا بكم في مراجعة النظام." }
                }
            });
            await db.SaveChangesAsync();

            var userSvc = new TestUserService { UserId = userId, IsAuthenticated = true, IsAdmin = true };
            var transcriptsCtrl = new TranscriptsController(db, userSvc, new PdfExportService(db));

            var renameResult = await transcriptsCtrl.RenameSpeakers(meetingId, new RenameSpeakersRequest
            {
                SpeakerMap = new Dictionary<string, string> { { "Speaker 1", "د. أحمد حسن" } }
            });
            Assert.IsType<OkObjectResult>(renameResult);

            var updatedSegment = await db.TranscriptSegments.FirstAsync(s => s.MeetingId == meetingId);
            Assert.Equal("د. أحمد حسن", updatedSegment.Speaker);

            var pdfService = new PdfExportService(db);
            var (content, fileName, contentType) = await pdfService.ExportTranscriptDocumentAsync(meetingId, userId, true, "html");
            var html = Encoding.UTF8.GetString(content);
            Assert.Contains("dir=\"rtl\"", html);
            Assert.Contains("د. أحمد حسن", html);
            Assert.Contains("مرحبا بكم في مراجعة النظام.", html);
            Assert.Contains("text/html", contentType);
        }
    }
}
