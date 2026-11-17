using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MeetMind.Api.Services;
using MeetMind.Core.Entities;
using MeetMind.Core.Enums;
using MeetMind.Infrastructure.Data;

namespace MeetMind.Api.Controllers
{
    public class QuizSubmitRequest
    {
        public Dictionary<string, JsonElement> Answers { get; set; } = new();
    }

    public class UpdateActionItemRequest
    {
        public string? Title { get; set; }
        public string? OwnerName { get; set; }
        public string? DeadlineText { get; set; }
        public TaskPriority? Priority { get; set; }
        public bool? Completed { get; set; }
    }

    [ApiController]
    [Route("api/v1/quizzes")]
    public class QuizzesController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly ICurrentUserService _currentUser;

        public QuizzesController(ApplicationDbContext db, ICurrentUserService currentUser)
        {
            _db = db;
            _currentUser = currentUser;
        }

        private bool IsAdmin => !_currentUser.IsAuthenticated || _currentUser.IsAdmin;

        [HttpGet]
        public async Task<IActionResult> GetQuizzes()
        {
            var quizzes = await _db.Quizzes
                .Include(q => q.Questions)
                .Where(q => IsAdmin || q.UserId == _currentUser.UserId)
                .OrderByDescending(q => q.CreatedAtUtc)
                .ToListAsync();

            return Ok(quizzes);
        }

        [HttpPost("{id:guid}/submit")]
        public async Task<IActionResult> SubmitQuiz(Guid id, [FromBody] QuizSubmitRequest request)
        {
            var quiz = await _db.Quizzes
                .Include(q => q.Questions)
                .FirstOrDefaultAsync(q => q.Id == id && (IsAdmin || q.UserId == _currentUser.UserId));

            if (quiz == null)
            {
                return NotFound(new { error = "Quiz not found." });
            }

            int correct = 0;
            var breakdown = new List<object>();

            foreach (var q in quiz.Questions)
            {
                bool isCorrect = false;
                if (request.Answers.TryGetValue(q.Id.ToString(), out var submitted))
                {
                    if (q.QuestionType == QuizQuestionType.MultipleChoice || q.QuestionType == QuizQuestionType.TrueFalse)
                    {
                        if (submitted.ValueKind == JsonValueKind.Number && submitted.TryGetInt32(out var idx))
                        {
                            isCorrect = idx == q.CorrectOptionIndex;
                        }
                    }
                    else if (!string.IsNullOrWhiteSpace(q.CorrectAnswerText))
                    {
                        var answerText = submitted.GetString() ?? "";
                        isCorrect = answerText.Contains(q.CorrectAnswerText, StringComparison.OrdinalIgnoreCase);
                    }
                }

                if (isCorrect) correct++;
                breakdown.Add(new
                {
                    questionId = q.Id,
                    correct = isCorrect,
                    correctOptionIndex = q.CorrectOptionIndex,
                    correctAnswerText = q.CorrectAnswerText,
                    explanation = q.Explanation
                });
            }

            var total = Math.Max(1, quiz.Questions.Count);
            var score = (int)Math.Round((double)correct / total * 100);

            quiz.AttemptsCount += 1;
            quiz.LastScorePercent = score;

            _db.QuizAttempts.Add(new QuizAttempt
            {
                QuizId = quiz.Id,
                UserId = _currentUser.UserId,
                ScorePercent = score,
                CorrectCount = correct,
                TotalQuestions = quiz.Questions.Count,
                AnswersJson = JsonSerializer.Serialize(request.Answers)
            });

            await _db.SaveChangesAsync();

            return Ok(new
            {
                quizId = quiz.Id,
                scorePercent = score,
                correctCount = correct,
                totalQuestions = quiz.Questions.Count,
                breakdown
            });
        }
    }

    [ApiController]
    [Route("api/v1/tasks")]
    public class TasksController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly ICurrentUserService _currentUser;

        public TasksController(ApplicationDbContext db, ICurrentUserService currentUser)
        {
            _db = db;
            _currentUser = currentUser;
        }

        private bool IsAdmin => !_currentUser.IsAuthenticated || _currentUser.IsAdmin;

        [HttpGet]
        public async Task<IActionResult> GetTasks()
        {
            var tasks = await _db.ActionItems
                .Where(t => IsAdmin || t.UserId == _currentUser.UserId)
                .OrderByDescending(t => t.CreatedAtUtc)
                .ToListAsync();

            return Ok(tasks);
        }

        [HttpPatch("{id:guid}")]
        public async Task<IActionResult> UpdateTask(Guid id, [FromBody] UpdateActionItemRequest request)
        {
            var item = await _db.ActionItems
                .FirstOrDefaultAsync(t => t.Id == id && (IsAdmin || t.UserId == _currentUser.UserId));
            if (item == null)
            {
                return NotFound(new { error = "Task not found." });
            }

            if (!string.IsNullOrWhiteSpace(request.Title)) item.Title = request.Title.Trim();
            if (request.OwnerName != null) item.OwnerName = string.IsNullOrWhiteSpace(request.OwnerName) ? null : request.OwnerName.Trim();
            if (request.DeadlineText != null) item.DeadlineText = request.DeadlineText.Trim();
            if (request.Priority.HasValue) item.Priority = request.Priority.Value;
            if (request.Completed.HasValue) item.Completed = request.Completed.Value;

            await _db.SaveChangesAsync();
            return Ok(item);
        }
    }

    [ApiController]
    [Route("api/v1/notifications")]
    public class NotificationsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly ICurrentUserService _currentUser;

        public NotificationsController(ApplicationDbContext db, ICurrentUserService currentUser)
        {
            _db = db;
            _currentUser = currentUser;
        }

        private bool IsAdmin => !_currentUser.IsAuthenticated || _currentUser.IsAdmin;

        [HttpGet]
        public async Task<IActionResult> GetNotifications()
        {
            var items = await _db.Notifications
                .Where(n => IsAdmin || n.UserId == _currentUser.UserId)
                .OrderByDescending(n => n.CreatedAtUtc)
                .Take(100)
                .ToListAsync();

            return Ok(items);
        }

        [HttpPost("mark-all-read")]
        public async Task<IActionResult> MarkAllRead()
        {
            var items = await _db.Notifications
                .Where(n => !n.Read && (IsAdmin || n.UserId == _currentUser.UserId))
                .ToListAsync();

            foreach (var n in items)
            {
                n.Read = true;
            }

            await _db.SaveChangesAsync();
            return Ok(new { updated = items.Count });
        }
    }
}
