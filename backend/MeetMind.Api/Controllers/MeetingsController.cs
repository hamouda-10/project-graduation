using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MeetMind.Api.Services;
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
        private readonly ICurrentUserService? _currentUser;

        public MeetingsController(ApplicationDbContext db)
            : this(db, null)
        {
        }

        [Microsoft.Extensions.DependencyInjection.ActivatorUtilitiesConstructor]
        public MeetingsController(ApplicationDbContext db, ICurrentUserService? currentUser)
        {
            _db = db;
            _currentUser = currentUser;
        }

        private Guid EffectiveUserId => _currentUser?.UserId ?? Guid.Empty;
        private bool IsAdmin => _currentUser == null || !_currentUser.IsAuthenticated || _currentUser.IsAdmin;

        [HttpGet]
        public async Task<ActionResult<IEnumerable<Meeting>>> GetMeetings()
        {
            var query = _db.Meetings
                .Include(m => m.TranscriptSegments)
                .Include(m => m.ActionItems)
                .Include(m => m.Keywords)
                .Include(m => m.Topics)
                .Include(m => m.Highlights)
                .AsQueryable();

            if (!IsAdmin && EffectiveUserId != Guid.Empty)
            {
                query = query.Where(m => m.HostId == EffectiveUserId);
            }

            return await query
                .OrderByDescending(m => m.CreatedAtUtc)
                .ToListAsync();
        }

        [HttpGet("{id:guid}")]
        public async Task<ActionResult<Meeting>> GetMeeting(Guid id)
        {
            var meeting = await _db.Meetings
                .Include(m => m.TranscriptSegments)
                .Include(m => m.ActionItems)
                .Include(m => m.Keywords)
                .Include(m => m.Topics)
                .Include(m => m.Highlights)
                .FirstOrDefaultAsync(m => m.Id == id && (IsAdmin || m.HostId == EffectiveUserId));

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

            var workspace = await _db.Workspaces.FirstOrDefaultAsync();
            if (workspace == null)
            {
                workspace = new Workspace
                {
                    Name = "Default Workspace",
                    Slug = $"ws-{Guid.NewGuid():N}",
                    OwnerId = EffectiveUserId == Guid.Empty ? Guid.NewGuid() : EffectiveUserId
                };
                _db.Workspaces.Add(workspace);
            }

            var meeting = new Meeting
            {
                Id = Guid.NewGuid(),
                WorkspaceId = workspace.Id,
                HostId = EffectiveUserId,
                Title = request.Title.Trim(),
                HostName = request.HostName ?? "Organizer",
                ScheduledDateUtc = request.ScheduledDateUtc ?? DateTime.UtcNow,
                DurationSeconds = request.DurationSeconds > 0 ? request.DurationSeconds : 0,
                ParticipantsCount = request.ParticipantsCount > 0 ? request.ParticipantsCount : 1,
                Status = ResourceStatus.Queued,
                Summary = null,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            _db.Meetings.Add(meeting);
            await _db.SaveChangesAsync();

            return CreatedAtAction(nameof(GetMeeting), new { id = meeting.Id }, meeting);
        }

        [HttpDelete("all")]
        public async Task<IActionResult> DeleteAllMeetings()
        {
            var targets = await _db.Meetings
                .Where(m => IsAdmin || m.HostId == EffectiveUserId)
                .ToListAsync();

            foreach (var meeting in targets)
            {
                DeletePhysicalFileSafe(meeting.StoragePath);
            }

            var ids = targets.Select(m => m.Id).ToList();
            var jobs = await _db.ProcessingJobs.Where(j => ids.Contains(j.ResourceId)).ToListAsync();
            var quizzes = await _db.Quizzes.Where(q => q.MeetingId.HasValue && ids.Contains(q.MeetingId.Value)).ToListAsync();
            var flashcards = await _db.Flashcards.Where(f => f.MeetingId.HasValue && ids.Contains(f.MeetingId.Value)).ToListAsync();
            var mindMaps = await _db.MindMaps.Where(mm => mm.MeetingId.HasValue && ids.Contains(mm.MeetingId.Value)).ToListAsync();

            _db.ProcessingJobs.RemoveRange(jobs);
            _db.Quizzes.RemoveRange(quizzes);
            _db.Flashcards.RemoveRange(flashcards);
            _db.MindMaps.RemoveRange(mindMaps);
            _db.Meetings.RemoveRange(targets);
            await _db.SaveChangesAsync();

            return Ok(new { success = true, deletedCount = ids.Count });
        }

        [HttpDelete("{id:guid}")]
        public async Task<IActionResult> DeleteMeeting(Guid id)
        {
            var meeting = await _db.Meetings
                .FirstOrDefaultAsync(m => m.Id == id && (IsAdmin || m.HostId == EffectiveUserId));
            if (meeting == null)
            {
                return NotFound();
            }

            DeletePhysicalFileSafe(meeting.StoragePath);
            var jobs = await _db.ProcessingJobs.Where(j => j.ResourceId == id).ToListAsync();
            _db.ProcessingJobs.RemoveRange(jobs);
            _db.Meetings.Remove(meeting);
            await _db.SaveChangesAsync();

            return NoContent();
        }

        private static void DeletePhysicalFileSafe(string? path)
        {
            if (!string.IsNullOrWhiteSpace(path) && System.IO.File.Exists(path))
            {
                try { System.IO.File.Delete(path); } catch { /* ignore cleanup lock */ }
            }
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
