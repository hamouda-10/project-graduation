using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;

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
        public async Task JoinJobGroup(string jobId)
        {
            if (!string.IsNullOrWhiteSpace(jobId))
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, $"Job_{jobId}");
            }
        }

        public async Task LeaveJobGroup(string jobId)
        {
            if (!string.IsNullOrWhiteSpace(jobId))
            {
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"Job_{jobId}");
            }
        }

        public async Task JoinUserGroup(string userId)
        {
            if (!string.IsNullOrWhiteSpace(userId))
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, $"User_{userId}");
            }
        }
    }
}
