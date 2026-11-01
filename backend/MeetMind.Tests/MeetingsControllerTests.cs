using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;
using MeetMind.Api.Controllers;
using MeetMind.Core.Entities;
using MeetMind.Core.Enums;
using MeetMind.Infrastructure.Data;

namespace MeetMind.Tests
{
    public class MeetingsControllerTests
    {
        private ApplicationDbContext CreateInMemoryDbContext()
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;

            return new ApplicationDbContext(options);
        }

        [Fact]
        public async Task GetMeetings_ReturnsAllMeetingsFromDatabase()
        {
            // Arrange
            using var db = CreateInMemoryDbContext();
            var workspaceId = Guid.NewGuid();
            db.Workspaces.Add(new Workspace { Id = workspaceId, Name = "Test WS", Slug = "test-ws", OwnerId = Guid.NewGuid() });
            db.Meetings.Add(new Meeting
            {
                Id = Guid.NewGuid(),
                WorkspaceId = workspaceId,
                Title = "Sprint Planning Sync",
                HostName = "Ava Chen",
                ScheduledDateUtc = DateTime.UtcNow,
                Status = ResourceStatus.Completed
            });
            await db.SaveChangesAsync();

            var controller = new MeetingsController(db);

            // Act
            var actionResult = await controller.GetMeetings();

            // Assert
            var result = Assert.IsAssignableFrom<System.Collections.Generic.IEnumerable<Meeting>>(actionResult.Value);
            Assert.Single(result);
            Assert.Equal("Sprint Planning Sync", result.First().Title);
        }

        [Fact]
        public async Task CreateMeeting_WithValidTitle_PersistsEntity()
        {
            // Arrange
            using var db = CreateInMemoryDbContext();
            var controller = new MeetingsController(db);
            var req = new CreateMeetingRequest
            {
                Title = "Architecture Decision Review",
                HostName = "Alex Kim",
                DurationSeconds = 3600,
                ParticipantsCount = 8
            };

            // Act
            var actionResult = await controller.CreateMeeting(req);

            // Assert
            var created = Assert.IsType<CreatedAtActionResult>(actionResult.Result);
            var meeting = Assert.IsType<Meeting>(created.Value);
            Assert.Equal("Architecture Decision Review", meeting.Title);
            Assert.Equal(8, meeting.ParticipantsCount);

            // Verify database persistence
            var inDb = await db.Meetings.FindAsync(meeting.Id);
            Assert.NotNull(inDb);
            Assert.Equal("Architecture Decision Review", inDb.Title);
        }

        [Fact]
        public async Task DeleteMeeting_RemovesFromDatabase()
        {
            // Arrange
            using var db = CreateInMemoryDbContext();
            var meetingId = Guid.NewGuid();
            var workspaceId = Guid.NewGuid();
            db.Meetings.Add(new Meeting
            {
                Id = meetingId,
                WorkspaceId = workspaceId,
                Title = "Meeting to Delete",
                HostName = "Marcus Lee"
            });
            await db.SaveChangesAsync();

            var controller = new MeetingsController(db);

            // Act
            var result = await controller.DeleteMeeting(meetingId);

            // Assert
            Assert.IsType<NoContentResult>(result);
            var inDb = await db.Meetings.FindAsync(meetingId);
            Assert.Null(inDb);
        }
    }
}
