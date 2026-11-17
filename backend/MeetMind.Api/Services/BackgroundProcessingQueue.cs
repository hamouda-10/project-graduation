using System;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace MeetMind.Api.Services
{
    public interface IBackgroundProcessingQueue
    {
        ValueTask EnqueueJobAsync(Guid jobId, CancellationToken ct = default);
        ValueTask<Guid> DequeueAsync(CancellationToken ct);
        void RequestCancel(Guid jobId);
        bool IsCancellationRequested(Guid jobId);
        void ClearCancel(Guid jobId);
    }

    public class BackgroundProcessingQueue : IBackgroundProcessingQueue
    {
        private readonly Channel<Guid> _queue = Channel.CreateUnbounded<Guid>(
            new UnboundedChannelOptions { SingleReader = false, SingleWriter = false });

        private readonly ConcurrentDictionary<Guid, byte> _cancelledJobs = new();

        public ValueTask EnqueueJobAsync(Guid jobId, CancellationToken ct = default)
        {
            _cancelledJobs.TryRemove(jobId, out _);
            return _queue.Writer.WriteAsync(jobId, ct);
        }

        public ValueTask<Guid> DequeueAsync(CancellationToken ct)
        {
            return _queue.Reader.ReadAsync(ct);
        }

        public void RequestCancel(Guid jobId) => _cancelledJobs[jobId] = 1;

        public bool IsCancellationRequested(Guid jobId) => _cancelledJobs.ContainsKey(jobId);

        public void ClearCancel(Guid jobId) => _cancelledJobs.TryRemove(jobId, out _);
    }
}
