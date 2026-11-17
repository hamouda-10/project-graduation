using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using MeetMind.Infrastructure.Data;

namespace MeetMind.Api.Services
{
    public interface IPdfExportService
    {
        Task<(byte[] Content, string FileName, string ContentType)> ExportTranscriptDocumentAsync(
            Guid resourceId,
            Guid userId,
            bool isAdmin,
            string format = "html",
            CancellationToken ct = default);
    }

    public class PdfExportService : IPdfExportService
    {
        private readonly ApplicationDbContext _db;

        public PdfExportService(ApplicationDbContext db)
        {
            _db = db;
        }

        public async Task<(byte[] Content, string FileName, string ContentType)> ExportTranscriptDocumentAsync(
            Guid resourceId,
            Guid userId,
            bool isAdmin,
            string format = "html",
            CancellationToken ct = default)
        {
            var meeting = await _db.Meetings
                .Include(m => m.TranscriptSegments)
                .Include(m => m.ActionItems)
                .FirstOrDefaultAsync(m => m.Id == resourceId && (isAdmin || m.HostId == userId), ct);

            var lecture = meeting == null
                ? await _db.Lectures
                    .Include(l => l.TranscriptSegments)
                    .Include(l => l.ActionItems)
                    .FirstOrDefaultAsync(l => l.Id == resourceId && (isAdmin || l.InstructorId == userId), ct)
                : null;

            if (meeting == null && lecture == null)
            {
                throw new FileNotFoundException("Recording not found.");
            }

            var title = meeting?.Title ?? lecture!.Title;
            var summary = meeting?.Summary ?? lecture?.StudyNotes ?? string.Empty;
            var segments = (meeting?.TranscriptSegments ?? lecture!.TranscriptSegments)
                .OrderBy(s => s.StartTimeSeconds)
                .ToList();
            var tasks = (meeting?.ActionItems ?? lecture!.ActionItems).ToList();

            var isArabic = segments.Any(s => s.Text.Any(c => c >= 0x0600 && c <= 0x06FF)) ||
                           title.Any(c => c >= 0x0600 && c <= 0x06FF);
            var dir = isArabic ? "rtl" : "ltr";

            if (string.Equals(format, "txt", StringComparison.OrdinalIgnoreCase))
            {
                var sb = new StringBuilder();
                sb.AppendLine($"# {title}");
                if (!string.IsNullOrWhiteSpace(summary))
                {
                    sb.AppendLine();
                    sb.AppendLine(summary);
                }
                sb.AppendLine();
                foreach (var seg in segments)
                {
                    sb.AppendLine($"[{FormatTime(seg.StartTimeSeconds)} - {FormatTime(seg.EndTimeSeconds)}] {seg.Speaker}: {seg.Text}");
                }
                return (Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray(),
                    $"transcript_{resourceId}.txt",
                    "text/plain; charset=utf-8");
            }

            var html = new StringBuilder();
            html.AppendLine("<!DOCTYPE html>");
            html.AppendLine($"<html lang=\"{(isArabic ? "ar" : "en")}\" dir=\"{dir}\">");
            html.AppendLine("<head><meta charset=\"utf-8\" />");
            html.AppendLine($"<title>{WebUtility.HtmlEncode(title)}</title>");
            html.AppendLine("<style>body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;max-width:820px;margin:32px auto;line-height:1.7;color:#111}h1{color:#7c5a10;border-bottom:2px solid #d4af37;padding-bottom:8px}.seg{margin:10px 0;padding:10px;border-inline-start:3px solid #d4af37;background:#fafafa}.meta{font-size:12px;color:#555;font-weight:bold}@media print{body{margin:12mm}}</style>");
            html.AppendLine("</head><body>");
            html.AppendLine($"<h1>{WebUtility.HtmlEncode(title)}</h1>");
            if (!string.IsNullOrWhiteSpace(summary))
            {
                html.AppendLine($"<section><h2>{(isArabic ? "الملخص" : "Summary")}</h2><pre style=\"white-space:pre-wrap;font-family:inherit\">{WebUtility.HtmlEncode(summary)}</pre></section>");
            }
            if (tasks.Count > 0)
            {
                html.AppendLine($"<section><h2>{(isArabic ? "المهام المستخرجة" : "Action Items")}</h2><ul>");
                foreach (var t in tasks)
                {
                    html.AppendLine($"<li>{WebUtility.HtmlEncode(t.Title)} — {WebUtility.HtmlEncode(t.DeadlineText ?? "Deadline not specified.")}</li>");
                }
                html.AppendLine("</ul></section>");
            }
            html.AppendLine($"<section><h2>{(isArabic ? "النص المفرغ" : "Transcript")}</h2>");
            foreach (var seg in segments)
            {
                html.AppendLine($"<div class=\"seg\"><div class=\"meta\">[{FormatTime(seg.StartTimeSeconds)} - {FormatTime(seg.EndTimeSeconds)}] {WebUtility.HtmlEncode(seg.Speaker)}</div><div>{WebUtility.HtmlEncode(seg.Text)}</div></div>");
            }
            html.AppendLine("</section></body></html>");

            return (Encoding.UTF8.GetBytes(html.ToString()),
                $"transcript_{resourceId}.html",
                "text/html; charset=utf-8");
        }

        private static string FormatTime(double sec)
        {
            var ts = TimeSpan.FromSeconds(Math.Max(0, sec));
            return $"{(int)ts.TotalMinutes:D2}:{ts.Seconds:D2}";
        }
    }
}
