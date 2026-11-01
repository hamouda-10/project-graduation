using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MeetMind.Core.Entities;
using MeetMind.Core.Enums;
using MeetMind.Infrastructure.Data;

namespace MeetMind.Api.Controllers
{
    [ApiController]
    [Route("api/v1/[controller]")]
    public class MeetingsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;

        public MeetingsController(ApplicationDbContext db)
        {
            _db = db;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<Meeting>>> GetMeetings()
        {
            return await _db.Meetings
                .Include(m => m.TranscriptSegments)
                .Include(m => m.ActionItems)
                .OrderByDescending(m => m.CreatedAtUtc)
                .ToListAsync();
        }

        [HttpGet("{id:guid}")]
        public async Task<ActionResult<Meeting>> GetMeeting(Guid id)
        {
            var meeting = await _db.Meetings
                .Include(m => m.TranscriptSegments)
                .Include(m => m.ActionItems)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (meeting == null)
            {
                return NotFound(new { error = "Meeting not found" });
            }

            return meeting;
        }

        [HttpPost]
        public async Task<ActionResult<Meeting>> CreateMeeting([FromBody] CreateMeetingRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Title))
            {
                return BadRequest(new { error = "Title is required" });
            }

            var workspace = await _db.Workspaces.FirstOrDefaultAsync() ?? new Workspace
            {
                Name = "Default Workspace",
                Slug = "default-ws",
                OwnerId = Guid.NewGuid()
            };

            var meeting = new Meeting
            {
                Id = Guid.NewGuid(),
                WorkspaceId = workspace.Id,
                Title = request.Title,
                HostName = request.HostName ?? "Alex Kim",
                ScheduledDateUtc = request.ScheduledDateUtc ?? DateTime.UtcNow,
                DurationSeconds = request.DurationSeconds > 0 ? request.DurationSeconds : 2700,
                ParticipantsCount = request.ParticipantsCount > 0 ? request.ParticipantsCount : 4,
                Status = ResourceStatus.Completed,
                Summary = "Meeting summary generated from transcript segments.",
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            _db.Meetings.Add(meeting);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(GetMeeting), new { id = meeting.Id }, meeting);
        }

        [HttpDelete("{id:guid}")]
        public async Task<IActionResult> DeleteMeeting(Guid id)
        {
            var meeting = await _db.Meetings.FindAsync(id);
            if (meeting == null)
            {
                return NotFound();
            }

            _db.Meetings.Remove(meeting);
            await _db.SaveChangesAsync();

            return NoContent();
        }
    }

    public class CreateMeetingRequest
    {
        public string Title { get; set; } = string.Empty;
        public string? HostName { get; set; }
        public DateTime? ScheduledDateUtc { get; set; }
        public int DurationSeconds { get; set; }
        public int ParticipantsCount { get; set; }
    }
}
