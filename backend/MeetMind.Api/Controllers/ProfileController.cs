using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MeetMind.Api.Services;
using MeetMind.Core.Entities;
using MeetMind.Core.Enums;
using MeetMind.Infrastructure.Data;

namespace MeetMind.Api.Controllers
{
    [ApiController]
    [Route("api/v1/profile")]
    [Authorize]
    public class ProfileController : ControllerBase
    {
        private const long MaxAvatarBytes = 5 * 1024 * 1024;
        private readonly ApplicationDbContext _db;
        private readonly ICurrentUserService _currentUser;

        public ProfileController(ApplicationDbContext db, ICurrentUserService currentUser)
        {
            _db = db;
            _currentUser = currentUser;
        }

        public record UpdateProfileRequest(
            string? Name,
            string? Bio,
            string? JobTitle,
            string? Department,
            string? Organization);

        [HttpGet]
        public async Task<IActionResult> GetProfile()
        {
            if (_currentUser.IsGuest)
            {
                return Ok(new
                {
                    user = new
                    {
                        id = _currentUser.UserId.ToString(),
                        email = _currentUser.Email,
                        name = "Guest Explorer",
                        role = "guest",
                        authProvider = "guest",
                        isGuest = true,
                        initials = "GE"
                    },
                    recordings = Array.Empty<object>(),
                    analytics = new { totalMeetings = 0, totalLectures = 0, totalRecordings = 0, totalAiOutputs = 0 }
                });
            }

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == _currentUser.UserId);
            if (user == null) return NotFound(new { error = "User account not found." });

            var meetings = await _db.Meetings
                .Where(m => m.HostId == user.Id)
                .OrderByDescending(m => m.CreatedAtUtc)
                .ToListAsync();

            var lectures = await _db.Lectures
                .Where(l => l.InstructorId == user.Id)
                .OrderByDescending(l => l.CreatedAtUtc)
                .ToListAsync();

            var tasks = await _db.ActionItems.Where(t => t.UserId == user.Id).ToListAsync();
            var quizzes = await _db.Quizzes.Where(q => q.UserId == user.Id).ToListAsync();
            var attempts = await _db.QuizAttempts.Where(a => a.UserId == user.Id).ToListAsync();
            var flashcards = await _db.Flashcards.Where(f => f.UserId == user.Id).ToListAsync();
            var mindMaps = await _db.MindMaps.Where(m => m.UserId == user.Id).ToListAsync();
            var jobs = await _db.ProcessingJobs.Where(j => j.UserId == user.Id).OrderByDescending(j => j.UpdatedAtUtc).ToListAsync();

            var totalAudioDurationSeconds =
                meetings.Sum(m => m.DurationSeconds) + lectures.Sum(l => l.DurationSeconds);

            var totalSummaries =
                meetings.Count(m => !string.IsNullOrWhiteSpace(m.Summary)) +
                lectures.Count(l => !string.IsNullOrWhiteSpace(l.StudyNotes) || !string.IsNullOrWhiteSpace(l.DetailedSummary));

            var totalTranscriptions =
                meetings.Count(m => !string.IsNullOrWhiteSpace(m.FullTranscriptText)) +
                lectures.Count(l => !string.IsNullOrWhiteSpace(l.FullTranscriptText));

            var totalAiOutputs = totalTranscriptions + totalSummaries + quizzes.Count + flashcards.Count + mindMaps.Count;

            return Ok(new
            {
                user = ToPublicProfileUser(user),
                analytics = new
                {
                    totalMeetings = meetings.Count,
                    totalLectures = lectures.Count,
                    totalRecordings = meetings.Count + lectures.Count,
                    totalAudioDurationSeconds,
                    totalAudioHours = Math.Round(totalAudioDurationSeconds / 3600.0, 1),
                    totalTranscriptions,
                    totalSummaries,
                    totalQuizzes = quizzes.Count,
                    totalQuizAttempts = attempts.Count,
                    averageQuizScore = attempts.Count > 0 ? (int)Math.Round(attempts.Average(a => a.ScorePercent)) : 0,
                    totalFlashcards = flashcards.Count,
                    masteredFlashcards = flashcards.Count(f => f.Mastered),
                    totalMindMaps = mindMaps.Count,
                    totalAiOutputs,
                    completedJobs = jobs.Count(j => j.Status == JobStatus.Completed),
                    failedJobs = jobs.Count(j => j.Status == JobStatus.Failed || j.Status == JobStatus.Cancelled),
                    pendingJobs = jobs.Count(j => j.Status != JobStatus.Completed && j.Status != JobStatus.Failed && j.Status != JobStatus.Cancelled),
                    tasksGenerated = tasks.Count,
                    tasksCompleted = tasks.Count(t => t.Completed),
                    tasksPending = tasks.Count(t => !t.Completed),
                    taskCompletionRate = tasks.Count > 0 ? (int)Math.Round((double)tasks.Count(t => t.Completed) / tasks.Count * 100.0) : 0
                },
                recordings = meetings.Select(m => new
                {
                    id = m.Id.ToString(),
                    title = m.Title,
                    type = "meeting",
                    date = m.ScheduledDateUtc.ToString("O"),
                    durationSeconds = m.DurationSeconds,
                    status = m.Status.ToString(),
                    hasSummary = !string.IsNullOrWhiteSpace(m.Summary)
                }).Concat(lectures.Select(l => new
                {
                    id = l.Id.ToString(),
                    title = l.Title,
                    type = "lecture",
                    date = l.ScheduledDateUtc.ToString("O"),
                    durationSeconds = l.DurationSeconds,
                    status = l.Status.ToString(),
                    hasSummary = !string.IsNullOrWhiteSpace(l.StudyNotes) || !string.IsNullOrWhiteSpace(l.DetailedSummary)
                })).OrderByDescending(r => r.date).ToList()
            });
        }

        [HttpPut]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request)
        {
            if (_currentUser.IsGuest)
                return StatusCode(StatusCodes.Status403Forbidden, new { error = "Guest sessions cannot modify a saved profile." });

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == _currentUser.UserId);
            if (user == null) return NotFound(new { error = "User account not found." });

            if (request.Name != null)
            {
                var trimmed = request.Name.Trim();
                if (trimmed.Length < 2 || trimmed.Length > 100)
                    return BadRequest(new { error = "Full name must be between 2 and 100 characters." });
                user.Name = trimmed;
                user.NameCustomized = true;
            }

            if (request.Bio != null) user.Bio = request.Bio.Trim()[..Math.Min(500, request.Bio.Trim().Length)];
            if (request.JobTitle != null) user.JobTitle = request.JobTitle.Trim()[..Math.Min(100, request.JobTitle.Trim().Length)];
            if (request.Department != null) user.Department = request.Department.Trim()[..Math.Min(100, request.Department.Trim().Length)];
            if (request.Organization != null) user.Organization = request.Organization.Trim()[..Math.Min(120, request.Organization.Trim().Length)];

            user.UpdatedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return Ok(new { success = true, user = ToPublicProfileUser(user) });
        }

        [HttpPost("avatar")]
        [RequestSizeLimit(MaxAvatarBytes)]
        public async Task<IActionResult> UploadAvatar([FromForm] IFormFile avatar)
        {
            if (_currentUser.IsGuest)
                return StatusCode(StatusCodes.Status403Forbidden, new { error = "Guest sessions cannot upload a profile photo." });

            if (avatar == null || avatar.Length == 0)
                return BadRequest(new { error = "Profile image file is required." });

            if (avatar.Length > MaxAvatarBytes)
                return BadRequest(new { error = "Profile image exceeds the 5 MB maximum file size." });

            await using var ms = new MemoryStream();
            await avatar.CopyToAsync(ms);
            var bytes = ms.ToArray();

            var ext = DetectImageExtension(bytes);
            if (ext == null)
                return BadRequest(new { error = "Unsupported or corrupted image file. Only valid JPG, PNG, and WEBP images are allowed." });

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == _currentUser.UserId);
            if (user == null) return NotFound(new { error = "User account not found." });

            var avatarsDir = GetAvatarsDirectory();
            Directory.CreateDirectory(avatarsDir);

            var newFileName = $"avatar_{user.Id:N}_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}{ext}";
            var newFilePath = Path.Combine(avatarsDir, newFileName);
            await System.IO.File.WriteAllBytesAsync(newFilePath, bytes);

            if (!string.IsNullOrWhiteSpace(user.AvatarFileName))
            {
                var oldPath = Path.Combine(avatarsDir, Path.GetFileName(user.AvatarFileName));
                if (System.IO.File.Exists(oldPath)) System.IO.File.Delete(oldPath);
            }

            user.AvatarFileName = newFileName;
            user.AvatarUrl = $"/api/v1/profile/avatars/{newFileName}";
            user.AvatarCustomized = true;
            user.UpdatedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return Ok(new { success = true, avatarUrl = user.AvatarUrl, user = ToPublicProfileUser(user) });
        }

        [HttpDelete("avatar")]
        public async Task<IActionResult> DeleteAvatar()
        {
            if (_currentUser.IsGuest)
                return StatusCode(StatusCodes.Status403Forbidden, new { error = "Guest sessions cannot modify profile photos." });

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == _currentUser.UserId);
            if (user == null) return NotFound(new { error = "User account not found." });

            if (!string.IsNullOrWhiteSpace(user.AvatarFileName))
            {
                var oldPath = Path.Combine(GetAvatarsDirectory(), Path.GetFileName(user.AvatarFileName));
                if (System.IO.File.Exists(oldPath)) System.IO.File.Delete(oldPath);
            }

            user.AvatarFileName = null;
            user.AvatarUrl = null;
            user.AvatarCustomized = true;
            user.UpdatedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return Ok(new { success = true, user = ToPublicProfileUser(user) });
        }

        [HttpGet("avatars/{fileName}")]
        public async Task<IActionResult> GetAvatar(string fileName)
        {
            var safeName = Path.GetFileName(fileName);
            var owner = await _db.Users.FirstOrDefaultAsync(u => u.AvatarFileName == safeName);
            if (owner == null) return NotFound(new { error = "Profile image not found." });

            var isAdmin = User.IsInRole("Admin");
            if (!isAdmin && owner.Id != _currentUser.UserId)
                return StatusCode(StatusCodes.Status403Forbidden, new { error = "You do not have permission to access this profile image." });

            var fullPath = Path.Combine(GetAvatarsDirectory(), safeName);
            if (!System.IO.File.Exists(fullPath)) return NotFound(new { error = "Profile image not found." });

            var contentType = Path.GetExtension(safeName).ToLowerInvariant() switch
            {
                ".png" => "image/png",
                ".webp" => "image/webp",
                _ => "image/jpeg"
            };
            Response.Headers["X-Content-Type-Options"] = "nosniff";
            return PhysicalFile(fullPath, contentType);
        }

        private static string GetAvatarsDirectory() =>
            Path.Combine(Directory.GetCurrentDirectory(), "data", "avatars");

        private static string? DetectImageExtension(byte[] bytes)
        {
            if (bytes.Length < 12) return null;
            // PNG
            if (bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47) return ".png";
            // JPEG
            if (bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF) return ".jpg";
            // WEBP (RIFF....WEBP)
            if (bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 &&
                bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50) return ".webp";
            return null;
        }

        private static object ToPublicProfileUser(User user) => new
        {
            id = user.Id.ToString(),
            email = user.Email,
            name = user.Name,
            role = user.Role.ToString().ToLowerInvariant(),
            authProvider = string.IsNullOrEmpty(user.PasswordHash) ? "google" : "local",
            hasPassword = !string.IsNullOrEmpty(user.PasswordHash),
            avatarUrl = user.AvatarUrl,
            bio = user.Bio ?? string.Empty,
            jobTitle = user.JobTitle ?? string.Empty,
            department = user.Department ?? "General",
            organization = user.Organization ?? string.Empty,
            createdAt = user.CreatedAtUtc.ToString("O"),
            updatedAt = user.UpdatedAtUtc.ToString("O")
        };
    }
}
