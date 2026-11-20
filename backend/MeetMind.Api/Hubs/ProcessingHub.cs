using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MeetMind.Api.Services;
using MeetMind.Infrastructure.Data;

namespace MeetMind.Api.Hubs
{
    public interface IProcessingClient
    {
        Task ProcessingStarted(object payload);
        Task UploadCompleted(object payload);
        Task AudioExtractionStarted(object payload);
        Task TranscriptionStarted(object payload);
        Task TranscriptSegmentAvailable(object payload);
        Task TranscriptionCompleted(object payload);
        Task AIAnalysisStarted(object payload);
        Task SummaryReady(object payload);
        Task KeywordsReady(object payload);
        Task TasksReady(object payload);
        Task QuizReady(object payload);
        Task FlashcardsReady(object payload);
        Task ProcessingCompleted(object payload);
        Task ProcessingFailed(object payload);
    }

    public class ProcessingHub : Hub<IProcessingClient>
    {
        private readonly ICurrentUserService _currentUser;
        private readonly ApplicationDbContext _db;

        public ProcessingHub(ICurrentUserService currentUser, ApplicationDbContext db)
        {
            _currentUser = currentUser;
            _db = db;
        }

        public override async Task OnConnectedAsync()
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"User_{_currentUser.UserId}");
            await base.OnConnectedAsync();
        }

        public async Task JoinJobGroup(string jobId)
        {
            if (!Guid.TryParse(jobId, out var parsedJobId))
            {
                return;
            }

            var job = await _db.ProcessingJobs
                .AsNoTracking()
                .FirstOrDefaultAsync(j => j.Id == parsedJobId);

            if (job == null)
            {
                return;
            }

            if (!_currentUser.IsAdmin && job.UserId != _currentUser.UserId)
            {
                throw new HubException("Unauthorized to subscribe to this processing job.");
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, $"Job_{parsedJobId}");
        }

        public async Task LeaveJobGroup(string jobId)
        {
            if (Guid.TryParse(jobId, out var parsedJobId))
            {
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"Job_{parsedJobId}");
            }
        }

        public async Task JoinUserGroup(string userId)
        {
            // Never trust arbitrary client-provided userId; always bind to authenticated user unless Admin
            if (Guid.TryParse(userId, out var requestedUserId) &&
                (_currentUser.IsAdmin || requestedUserId == _currentUser.UserId))
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, $"User_{requestedUserId}");
                return;
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, $"User_{_currentUser.UserId}");
        }
    }
}
