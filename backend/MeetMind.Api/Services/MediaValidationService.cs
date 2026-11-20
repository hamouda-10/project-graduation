using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;

namespace MeetMind.Api.Services
{
    public record MediaValidationResult(
        bool IsValid,
        string? ErrorMessage,
        bool HasAudioStream,
        bool HasVideoStream,
        double DurationSeconds,
        string FormatName,
        string? Category = null,
        string? DetectedMimeType = null);

    public interface IMediaValidationService
    {
        MediaValidationResult ValidateUploadDescriptor(string fileName, long fileSizeBytes, string? mimeType);
        Task<MediaValidationResult> ValidateFileAsync(string filePath, string? originalFilename = null, CancellationToken ct = default);
    }

    public class MediaValidationService : IMediaValidationService
    {
        private static readonly HashSet<string> BlockedNonMediaExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".txt", ".md", ".csv", ".json", ".xml", ".html", ".htm", ".css", ".js", ".ts",
            ".py", ".cs", ".java", ".sh", ".bat", ".exe", ".dll", ".zip", ".rar", ".7z",
            ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
            ".png", ".jpg", ".jpeg", ".gif", ".svg", ".bmp", ".webp"
        };

        private readonly long _maxBytes;

        public MediaValidationService(IConfiguration configuration)
        {
            var maxMb = configuration.GetValue<long?>("Storage:MaxRecordingSizeMb") ?? 500;
            _maxBytes = maxMb * 1024L * 1024L;
        }

        public MediaValidationResult ValidateUploadDescriptor(string fileName, long fileSizeBytes, string? mimeType)
        {
            if (fileSizeBytes <= 0)
            {
                return new MediaValidationResult(false, "Uploaded file is empty.", false, false, 0, "", "EmptyFile");
            }

            if (fileSizeBytes > _maxBytes)
            {
                return new MediaValidationResult(
                    false,
                    $"File exceeds maximum allowed size of {_maxBytes / (1024 * 1024)} MB.",
                    false,
                    false,
                    0,
                    "",
                    "FileSizeLimitExceeded");
            }

            var ext = Path.GetExtension(fileName ?? string.Empty);
            if (!string.IsNullOrWhiteSpace(ext) && BlockedNonMediaExtensions.Contains(ext))
            {
                return new MediaValidationResult(false, "Unsupported media format.", false, false, 0, "", "UnsupportedMediaContainer");
            }

            return new MediaValidationResult(true, null, true, false, 0, ext.TrimStart('.'));
        }

        private sealed record ContainerSignature(bool Recognized, bool RejectedNonMedia, string Format, string MimeType, string? Reason = null);

        private static ContainerSignature InspectContainerSignature(string filePath)
        {
            var header = new byte[64];
            int bytesRead;
            using (var fs = File.OpenRead(filePath))
            {
                bytesRead = fs.Read(header, 0, header.Length);
            }

            if (bytesRead < 4)
            {
                return new ContainerSignature(false, true, "unknown", "application/octet-stream", "Uploaded file is truncated or contains fewer than 4 bytes.");
            }

            var ascii = Encoding.ASCII.GetString(header, 0, bytesRead);

            // Reject obvious non-media signatures even if renamed to .m4a/.mp3
            if (bytesRead >= 5 && ascii.StartsWith("%PDF-", StringComparison.Ordinal))
                return new ContainerSignature(false, true, "pdf", "application/pdf", "Uploaded file is a PDF document, not an audio or video recording.");
            if (bytesRead >= 8 && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47)
                return new ContainerSignature(false, true, "png", "image/png", "Uploaded file is a PNG image, not an audio or video recording.");
            if (header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF)
                return new ContainerSignature(false, true, "jpeg", "image/jpeg", "Uploaded file is a JPEG image, not an audio or video recording.");
            if (header[0] == 0x50 && header[1] == 0x4B && (header[2] == 0x03 || header[2] == 0x05 || header[2] == 0x07))
                return new ContainerSignature(false, true, "zip", "application/zip", "Uploaded file is a ZIP archive, not an audio or video recording.");

            var trimmed = ascii.TrimStart();
            if (trimmed.StartsWith("<!DOCTYPE", StringComparison.OrdinalIgnoreCase) ||
                trimmed.StartsWith("<html", StringComparison.OrdinalIgnoreCase) ||
                trimmed.StartsWith("{\"error\"", StringComparison.OrdinalIgnoreCase))
            {
                return new ContainerSignature(false, true, "text", "text/plain", "Uploaded file contains HTML/JSON text instead of audio or video data.");
            }

            // EBML / WebM / Matroska (frequently saved with .m4a or .webm)
            if (header[0] == 0x1A && header[1] == 0x45 && header[2] == 0xDF && header[3] == 0xA3)
                return new ContainerSignature(true, false, "webm", "audio/webm");

            // ISO Base Media (MP4 / M4A / MOV / 3GP)
            if (bytesRead >= 12)
            {
                var box = Encoding.ASCII.GetString(header, 4, 4);
                if (box is "ftyp" or "moov" or "mdat" or "wide" or "free")
                    return new ContainerSignature(true, false, "m4a", "audio/mp4");
            }

            // RIFF WAV / AVI
            if (bytesRead >= 12 && ascii.StartsWith("RIFF", StringComparison.Ordinal))
            {
                var riffType = Encoding.ASCII.GetString(header, 8, 4);
                if (riffType == "WAVE")
                    return new ContainerSignature(true, false, "wav", "audio/wav");
                if (riffType == "AVI ")
                    return new ContainerSignature(true, false, "avi", "video/x-msvideo");
            }

            // OGG / OPUS
            if (ascii.StartsWith("OggS", StringComparison.Ordinal))
                return new ContainerSignature(true, false, "ogg", "audio/ogg");

            // FLAC
            if (ascii.StartsWith("fLaC", StringComparison.Ordinal))
                return new ContainerSignature(true, false, "flac", "audio/flac");

            // MP3 (ID3 tag or MPEG sync)
            if (ascii.StartsWith("ID3", StringComparison.Ordinal))
                return new ContainerSignature(true, false, "mp3", "audio/mpeg");
            if (header[0] == 0xFF && (header[1] & 0xE0) == 0xE0)
            {
                var layer = (header[1] >> 1) & 0x03;
                return layer == 0
                    ? new ContainerSignature(true, false, "aac", "audio/aac")
                    : new ContainerSignature(true, false, "mp3", "audio/mpeg");
            }

            // AIFF / CAF / AMR / WMA(ASF)
            if (bytesRead >= 12 && ascii.StartsWith("FORM", StringComparison.Ordinal) &&
                (Encoding.ASCII.GetString(header, 8, 4) is "AIFF" or "AIFC"))
                return new ContainerSignature(true, false, "aiff", "audio/aiff");
            if (ascii.StartsWith("caff", StringComparison.Ordinal))
                return new ContainerSignature(true, false, "caf", "audio/x-caf");
            if (bytesRead >= 6 && ascii.StartsWith("#!AMR", StringComparison.Ordinal))
                return new ContainerSignature(true, false, "amr", "audio/amr");
            if (bytesRead >= 4 && header[0] == 0x30 && header[1] == 0x26 && header[2] == 0xB2 && header[3] == 0x75)
                return new ContainerSignature(true, false, "wma", "audio/x-ms-wma");

            return new ContainerSignature(false, false, "unknown", "application/octet-stream");
        }

        private static async Task<bool> TryTolerantFfmpegProbeAsync(string filePath, CancellationToken ct)
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "ffmpeg",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                psi.ArgumentList.Add("-v");
                psi.ArgumentList.Add("error");
                psi.ArgumentList.Add("-err_detect");
                psi.ArgumentList.Add("ignore_err");
                psi.ArgumentList.Add("-fflags");
                psi.ArgumentList.Add("+genpts+igndts+discardcorrupt");
                psi.ArgumentList.Add("-analyzeduration");
                psi.ArgumentList.Add("100M");
                psi.ArgumentList.Add("-probesize");
                psi.ArgumentList.Add("100M");
                psi.ArgumentList.Add("-i");
                psi.ArgumentList.Add(filePath);
                psi.ArgumentList.Add("-vn");
                psi.ArgumentList.Add("-t");
                psi.ArgumentList.Add("5");
                psi.ArgumentList.Add("-f");
                psi.ArgumentList.Add("null");
                psi.ArgumentList.Add("-");

                using var proc = Process.Start(psi);
                if (proc == null) return false;
                using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                timeoutCts.CancelAfter(TimeSpan.FromSeconds(30));
                await proc.WaitForExitAsync(timeoutCts.Token);
                return proc.ExitCode == 0;
            }
            catch
            {
                return false;
            }
        }

        public async Task<MediaValidationResult> ValidateFileAsync(string filePath, string? originalFilename = null, CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
            {
                return new MediaValidationResult(false, "Media file was not found.", false, false, 0, "", "StorageError");
            }

            var info = new FileInfo(filePath);
            var desc = ValidateUploadDescriptor(originalFilename ?? info.Name, info.Length, null);
            if (!desc.IsValid)
            {
                return desc;
            }

            var signature = InspectContainerSignature(filePath);
            if (signature.RejectedNonMedia)
            {
                return new MediaValidationResult(
                    false,
                    signature.Reason ?? "Unsupported media format.",
                    false,
                    false,
                    0,
                    signature.Format,
                    "UnsupportedMediaContainer",
                    signature.MimeType);
            }

            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "ffprobe",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                psi.ArgumentList.Add("-v");
                psi.ArgumentList.Add("error");
                psi.ArgumentList.Add("-analyzeduration");
                psi.ArgumentList.Add("100M");
                psi.ArgumentList.Add("-probesize");
                psi.ArgumentList.Add("100M");
                psi.ArgumentList.Add("-show_entries");
                psi.ArgumentList.Add("stream=codec_type,codec_name");
                psi.ArgumentList.Add("-show_entries");
                psi.ArgumentList.Add("format=duration,format_name");
                psi.ArgumentList.Add("-of");
                psi.ArgumentList.Add("json");
                psi.ArgumentList.Add(filePath);

                using var proc = Process.Start(psi);
                if (proc == null)
                {
                    return signature.Recognized
                        ? new MediaValidationResult(true, null, true, false, 1, signature.Format, null, signature.MimeType)
                        : new MediaValidationResult(false, "Unable to verify media container because ffprobe could not start.", false, false, 0, "", "FFmpegUnavailable");
                }

                using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                timeoutCts.CancelAfter(TimeSpan.FromSeconds(30));

                var stdoutTask = proc.StandardOutput.ReadToEndAsync(timeoutCts.Token);
                var stderrTask = proc.StandardError.ReadToEndAsync(timeoutCts.Token);
                await proc.WaitForExitAsync(timeoutCts.Token);
                var stdout = await stdoutTask;
                var stderr = await stderrTask;

                if (proc.ExitCode != 0 || string.IsNullOrWhiteSpace(stdout))
                {
                    // Attempt tolerant FFmpeg decode before concluding the container is unreadable
                    if (await TryTolerantFfmpegProbeAsync(filePath, ct))
                    {
                        var detectedFmt = signature.Recognized ? signature.Format : info.Extension.TrimStart('.');
                        return new MediaValidationResult(true, null, true, false, 1, detectedFmt, null, signature.Recognized ? signature.MimeType : null);
                    }

                    var detail = string.IsNullOrWhiteSpace(stderr) ? "" : $" ({stderr.Trim().Split('\n')[0]})";
                    return new MediaValidationResult(
                        false,
                        $"Unreadable or corrupted media container{detail}. Please verify the file plays locally or convert to MP3/WAV/M4A.",
                        false,
                        false,
                        0,
                        signature.Format,
                        "UnsupportedMediaContainer");
                }

                using var doc = JsonDocument.Parse(stdout);
                var hasAudio = false;
                var hasVideo = false;
                double duration = 0;
                var formatName = "";

                if (doc.RootElement.TryGetProperty("streams", out var streams) && streams.ValueKind == JsonValueKind.Array)
                {
                    foreach (var stream in streams.EnumerateArray())
                    {
                        var codecType = stream.TryGetProperty("codec_type", out var ctProp) ? ctProp.GetString() : null;
                        if (codecType == "audio") hasAudio = true;
                        if (codecType == "video") hasVideo = true;
                    }
                }

                if (doc.RootElement.TryGetProperty("format", out var format))
                {
                    if (format.TryGetProperty("duration", out var durProp) && double.TryParse(durProp.GetString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var d))
                    {
                        duration = d;
                    }
                    if (format.TryGetProperty("format_name", out var fmtProp))
                    {
                        formatName = fmtProp.GetString() ?? "";
                    }
                }

                if (!hasAudio)
                {
                    return new MediaValidationResult(false, "Audio stream was not found in the uploaded file.", false, hasVideo, duration, formatName, "InvalidAudioStream");
                }

                if (duration > 0 && duration < 0.3)
                {
                    return new MediaValidationResult(false, "Recording is too short (minimum 0.3 seconds).", hasAudio, hasVideo, duration, formatName, "InvalidAudioStream");
                }

                var resolvedMime = signature.Recognized ? signature.MimeType : null;
                return new MediaValidationResult(true, null, hasAudio, hasVideo, duration, formatName, null, resolvedMime);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex) when (ex is Win32Exception || ex is FileNotFoundException)
            {
                // ffprobe binary is missing in this runtime — validate via binary magic bytes rather than misreporting corruption
                if (signature.Recognized)
                {
                    return new MediaValidationResult(true, null, true, false, 1, signature.Format, null, signature.MimeType);
                }
                return new MediaValidationResult(
                    false,
                    "Media container signature could not be verified and ffprobe is unavailable on the server.",
                    false,
                    false,
                    0,
                    "",
                    "FFmpegUnavailable");
            }
            catch
            {
                if (signature.Recognized)
                {
                    return new MediaValidationResult(true, null, true, false, 1, signature.Format, null, signature.MimeType);
                }
                return new MediaValidationResult(false, "Unable to inspect uploaded media container.", false, false, 0, "", "UnsupportedMediaContainer");
            }
        }
    }
}

