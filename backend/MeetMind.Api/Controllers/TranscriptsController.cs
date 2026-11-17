using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MeetMind.Api.Services;
using MeetMind.Core.Entities;
using MeetMind.Infrastructure.Data;

namespace MeetMind.Api.Controllers
{
    [ApiController]
    [Route("api/v1/[controller]")]
    public class TranscriptsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly ICurrentUserService _currentUser;
        private readonly IPdfExportService _pdfExport;

        public TranscriptsController(ApplicationDbContext db, ICurrentUserService currentUser, IPdfExportService pdfExport)
        {
            _db = db;
            _currentUser = currentUser;
            _pdfExport = pdfExport;
        }

        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetTranscript(Guid id, CancellationToken ct)
        {
            var meeting = await _db.Meetings
                .Include(m => m.TranscriptSegments)
                .FirstOrDefaultAsync(m => m.Id == id && (_currentUser.IsAdmin || m.HostId == _currentUser.UserId), ct);

            if (meeting != null)
            {
                return Ok(new { id = meeting.Id, title = meeting.Title, type = "meeting", segments = meeting.TranscriptSegments.OrderBy(s => s.StartTimeSeconds) });
            }

            var lecture = await _db.Lectures
                .Include(l => l.TranscriptSegments)
                .FirstOrDefaultAsync(l => l.Id == id && (_currentUser.IsAdmin || l.InstructorId == _currentUser.UserId), ct);

            if (lecture != null)
            {
                return Ok(new { id = lecture.Id, title = lecture.Title, type = "lecture", segments = lecture.TranscriptSegments.OrderBy(s => s.StartTimeSeconds) });
            }

            return NotFound(new { error = "Transcript not found" });
        }

        [HttpPut("{id:guid}/speakers")]
        public async Task<IActionResult> RenameSpeaker(Guid id, [FromBody] RenameSpeakerRequest req, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(req.OldSpeaker) || string.IsNullOrWhiteSpace(req.NewSpeaker))
            {
                return BadRequest(new { error = "OldSpeaker and NewSpeaker are required." });
            }

            var segments = await _db.TranscriptSegments
                .Where(s => (s.MeetingId == id || s.LectureId == id) && s.Speaker == req.OldSpeaker)
                .ToListAsync(ct);

            foreach (var seg in segments)
            {
                seg.Speaker = req.NewSpeaker.Trim();
            }

            await _db.SaveChangesAsync(ct);
            return Ok(new { success = true, updatedCount = segments.Count });
        }

        [HttpGet("{id:guid}/export")]
        public async Task<IActionResult> ExportDocument(Guid id, [FromQuery] string format = "html", CancellationToken ct = default)
        {
            try
            {
                var (bytes, fileName, contentType) = await _pdfExport.ExportTranscriptDocumentAsync(
                    id, _currentUser.UserId, _currentUser.IsAdmin, format, ct);
                return File(bytes, contentType, fileName);
            }
            catch (System.IO.FileNotFoundException)
            {
                return NotFound(new { error = "Transcript not found." });
            }
        }

        [HttpGet("search")]
        public async Task<IActionResult> SearchTranscripts([FromQuery] string q, CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(q))
            {
                return Ok(Array.Empty<object>());
            }

            var query = q.Trim();
            var matches = await _db.TranscriptSegments
                .Where(s => s.Text.Contains(query) || s.Speaker.Contains(query))
                .OrderBy(s => s.StartTimeSeconds)
                .Take(50)
                .Select(s => new
                {
                    s.Id,
                    resourceId = s.MeetingId ?? s.LectureId,
                    s.Speaker,
                    s.StartTimeSeconds,
                    s.EndTimeSeconds,
                    s.Text
                })
                .ToListAsync(ct);

            return Ok(matches);
        }
    }

    public record RenameSpeakerRequest(string OldSpeaker, string NewSpeaker);
}
