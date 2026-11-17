using System;
using System.Collections.Generic;
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
    public class LecturesController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly ICurrentUserService _currentUser;

        public LecturesController(ApplicationDbContext db, ICurrentUserService currentUser)
        {
            _db = db;
            _currentUser = currentUser;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<Lecture>>> GetLectures()
        {
            return await _db.Lectures
                .Include(l => l.TranscriptSegments)
                .Include(l => l.Keywords)
                .Include(l => l.Topics)
                .Include(l => l.Highlights)
                .Where(l => _currentUser.IsAdmin || l.InstructorId == _currentUser.UserId)
                .OrderByDescending(l => l.CreatedAtUtc)
                .ToListAsync();
        }

        [HttpGet("{id:guid}")]
        public async Task<ActionResult<Lecture>> GetLecture(Guid id)
        {
            var lecture = await _db.Lectures
                .Include(l => l.TranscriptSegments)
                .Include(l => l.Keywords)
                .Include(l => l.Topics)
                .Include(l => l.Highlights)
                .FirstOrDefaultAsync(l => l.Id == id && (_currentUser.IsAdmin || l.InstructorId == _currentUser.UserId));

            if (lecture == null) return NotFound(new { error = "Lecture not found" });
            return lecture;
        }

        [HttpDelete("all")]
        public async Task<IActionResult> DeleteAllLectures()
        {
            var targets = await _db.Lectures
                .Where(l => _currentUser.IsAdmin || l.InstructorId == _currentUser.UserId)
                .ToListAsync();

            foreach (var l in targets)
            {
                if (!string.IsNullOrWhiteSpace(l.StoragePath) && System.IO.File.Exists(l.StoragePath))
                {
                    try { System.IO.File.Delete(l.StoragePath); } catch { /* ignore */ }
                }
            }

            var ids = targets.Select(l => l.Id).ToList();
            _db.ProcessingJobs.RemoveRange(await _db.ProcessingJobs.Where(j => ids.Contains(j.ResourceId)).ToListAsync());
            _db.Quizzes.RemoveRange(await _db.Quizzes.Where(q => q.LectureId.HasValue && ids.Contains(q.LectureId.Value)).ToListAsync());
            _db.Flashcards.RemoveRange(await _db.Flashcards.Where(f => f.LectureId.HasValue && ids.Contains(f.LectureId.Value)).ToListAsync());
            _db.MindMaps.RemoveRange(await _db.MindMaps.Where(mm => mm.LectureId.HasValue && ids.Contains(mm.LectureId.Value)).ToListAsync());
            _db.Lectures.RemoveRange(targets);
            await _db.SaveChangesAsync();

            return Ok(new { success = true, deletedCount = ids.Count });
        }

        [HttpDelete("{id:guid}")]
        public async Task<IActionResult> DeleteLecture(Guid id)
        {
            var lecture = await _db.Lectures
                .FirstOrDefaultAsync(l => l.Id == id && (_currentUser.IsAdmin || l.InstructorId == _currentUser.UserId));
            if (lecture == null) return NotFound();

            if (!string.IsNullOrWhiteSpace(lecture.StoragePath) && System.IO.File.Exists(lecture.StoragePath))
            {
                try { System.IO.File.Delete(lecture.StoragePath); } catch { /* ignore */ }
            }

            _db.ProcessingJobs.RemoveRange(await _db.ProcessingJobs.Where(j => j.ResourceId == id).ToListAsync());
            _db.Lectures.Remove(lecture);
            await _db.SaveChangesAsync();
            return NoContent();
        }
    }
}
