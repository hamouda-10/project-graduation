using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MeetMind.Api.Services;
using MeetMind.Core.Enums;
using MeetMind.Infrastructure.Data;

namespace MeetMind.Api.Controllers
{
    [ApiController]
    [Route("api/v1/[controller]")]
    public class JobsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IBackgroundProcessingQueue _queue;
        private readonly ICurrentUserService _currentUser;

        public JobsController(ApplicationDbContext db, IBackgroundProcessingQueue queue, ICurrentUserService currentUser)
        {
            _db = db;
            _queue = queue;
            _currentUser = currentUser;
        }

        [HttpGet]
        public async Task<IActionResult> ListJobs(CancellationToken ct)
        {
            var jobs = await _db.ProcessingJobs
                .Where(j => _currentUser.IsAdmin || j.UserId == _currentUser.UserId)
                .OrderByDescending(j => j.CreatedAtUtc)
                .ToListAsync(ct);
            return Ok(jobs);
        }

        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetJob(Guid id, CancellationToken ct)
        {
            var job = await _db.ProcessingJobs
                .FirstOrDefaultAsync(j => j.Id == id && (_currentUser.IsAdmin || j.UserId == _currentUser.UserId), ct);
            if (job == null) return NotFound(new { error = "Job not found" });
            return Ok(job);
        }

        [HttpPost("{id:guid}/retry")]
        public async Task<IActionResult> RetryJob(Guid id, CancellationToken ct)
        {
            var job = await _db.ProcessingJobs
                .FirstOrDefaultAsync(j => j.Id == id && (_currentUser.IsAdmin || j.UserId == _currentUser.UserId), ct);
            if (job == null) return NotFound(new { error = "Job not found" });

            if (string.IsNullOrWhiteSpace(job.StoragePath) || !System.IO.File.Exists(job.StoragePath))
            {
                return BadRequest(new { error = "Original media file is no longer available on disk." });
            }

            job.Status = JobStatus.Queued;
            job.Stage = "RetryQueued";
            job.ProgressPercent = 5;
            job.RetryCount = 0;
            job.FailureCategory = JobFailureCategory.None;
            job.ErrorMessage = null;
            job.UpdatedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);

            await _queue.EnqueueJobAsync(job.Id, ct);
            return Accepted(new { success = true, job });
        }

        [HttpPost("{id:guid}/cancel")]
        public async Task<IActionResult> CancelJob(Guid id, CancellationToken ct)
        {
            var job = await _db.ProcessingJobs
                .FirstOrDefaultAsync(j => j.Id == id && (_currentUser.IsAdmin || j.UserId == _currentUser.UserId), ct);
            if (job == null) return NotFound(new { error = "Job not found" });

            _queue.RequestCancel(id);
            job.Status = JobStatus.Cancelled;
            job.Stage = "Cancelled";
            job.FailureCategory = JobFailureCategory.CancelledByUser;
            job.ErrorMessage = "Processing cancelled by user.";
            job.UpdatedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);

            return Ok(new { success = true, job });
        }
    }
}
