using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;

namespace MeetMind.Api.Services
{
    public record AiTranscriptSegmentDto(
        [property: JsonPropertyName("id")] string? Id,
        [property: JsonPropertyName("speaker")] string Speaker,
        [property: JsonPropertyName("startTime")] double StartTime,
        [property: JsonPropertyName("endTime")] double EndTime,
        [property: JsonPropertyName("text")] string Text,
        [property: JsonPropertyName("confidence")] double Confidence = 0.92,
        [property: JsonPropertyName("language")] string Language = "auto",
        [property: JsonPropertyName("chunk_index")] int ChunkIndex = 0,
        [property: JsonPropertyName("is_partial")] bool IsPartial = false
    );

    public record AiTranscriptionResponseDto(
        [property: JsonPropertyName("success")] bool Success,
        [property: JsonPropertyName("language")] string Language,
        [property: JsonPropertyName("durationSeconds")] double DurationSeconds,
        [property: JsonPropertyName("engine")] string Engine,
        [property: JsonPropertyName("fullText")] string FullText,
        [property: JsonPropertyName("segments")] List<AiTranscriptSegmentDto> Segments
    );

    public record AiKeywordDto(
        [property: JsonPropertyName("term")] string Term,
        [property: JsonPropertyName("frequency")] int Frequency,
        [property: JsonPropertyName("importance")] double Importance,
        [property: JsonPropertyName("segment_ids")] List<string>? SegmentIds
    );

    public record AiActionItemDto(
        [property: JsonPropertyName("task")] string Task,
        [property: JsonPropertyName("assignee")] string? Assignee,
        [property: JsonPropertyName("deadline")] string? Deadline,
        [property: JsonPropertyName("priority")] string Priority,
        [property: JsonPropertyName("source_timestamp")] string? SourceTimestamp
    );

    public record AiHighlightDto(
        [property: JsonPropertyName("quote")] string Quote,
        [property: JsonPropertyName("context")] string? Context,
        [property: JsonPropertyName("speaker")] string? Speaker,
        [property: JsonPropertyName("timestamp")] string? Timestamp,
        [property: JsonPropertyName("category")] string Category,
        [property: JsonPropertyName("priority")] string Priority
    );

    public record AiQuizQuestionDto(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("question")] string Question,
        [property: JsonPropertyName("type")] string Type,
        [property: JsonPropertyName("options")] List<string> Options,
        [property: JsonPropertyName("correctOptionIndex")] int CorrectOptionIndex,
        [property: JsonPropertyName("correctAnswerText")] string? CorrectAnswerText,
        [property: JsonPropertyName("explanation")] string Explanation,
        [property: JsonPropertyName("difficulty")] string Difficulty,
        [property: JsonPropertyName("timestampRef")] string? TimestampRef
    );

    public record AiFlashcardDto(
        [property: JsonPropertyName("front")] string Front,
        [property: JsonPropertyName("back")] string Back,
        [property: JsonPropertyName("timestampRef")] string? TimestampRef
    );

    public record AiAnalysisResponseDto(
        [property: JsonPropertyName("executiveSummary")] string ExecutiveSummary,
        [property: JsonPropertyName("detailedSummary")] string DetailedSummary,
        [property: JsonPropertyName("topics")] List<string> Topics,
        [property: JsonPropertyName("keywords")] List<AiKeywordDto> Keywords,
        [property: JsonPropertyName("keyPoints")] List<string> KeyPoints,
        [property: JsonPropertyName("decisions")] List<string> Decisions,
        [property: JsonPropertyName("actionItems")] List<AiActionItemDto> ActionItems,
        [property: JsonPropertyName("highlights")] List<AiHighlightDto> Highlights,
        [property: JsonPropertyName("quizQuestions")] List<AiQuizQuestionDto> QuizQuestions,
        [property: JsonPropertyName("flashcards")] List<AiFlashcardDto> Flashcards,
        [property: JsonPropertyName("mindMap")] JsonElement? MindMap
    );

    public record AiQuestionCitationDto(
        [property: JsonPropertyName("speaker")] string Speaker,
        [property: JsonPropertyName("timestamp")] string Timestamp,
        [property: JsonPropertyName("quote")] string Quote
    );

    public record AiAskResponseDto(
        [property: JsonPropertyName("answer")] string Answer,
        [property: JsonPropertyName("evidenceFound")] bool EvidenceFound,
        [property: JsonPropertyName("citations")] List<AiQuestionCitationDto> Citations
    );

    public interface IAiServiceClient
    {
        Task<AiTranscriptionResponseDto> TranscribeFileAsync(string filePath, string resourceType, string language, CancellationToken ct = default);
        Task<AiTranscriptionResponseDto> TranscribeChunkAsync(byte[] bytes, string fileName, string language, double startOffsetSeconds, bool isFinal, CancellationToken ct = default);
        Task<AiAnalysisResponseDto> AnalyzeTranscriptAsync(string title, string resourceType, string language, List<AiTranscriptSegmentDto> segments, string? courseCode = null, CancellationToken ct = default);
        Task<AiAskResponseDto> AskQuestionAsync(string title, string question, List<AiTranscriptSegmentDto> segments, CancellationToken ct = default);
    }

    public class AiServiceClient : IAiServiceClient
    {
        private readonly HttpClient _http;
        private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

        public AiServiceClient(HttpClient http)
        {
            _http = http;
        }

        public async Task<AiTranscriptionResponseDto> TranscribeFileAsync(
            string filePath,
            string resourceType,
            string language,
            CancellationToken ct = default)
        {
            using var form = new MultipartFormDataContent();
            await using var stream = File.OpenRead(filePath);
            using var fileContent = new StreamContent(stream);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            form.Add(fileContent, "file", Path.GetFileName(filePath));
            var isMeeting = string.Equals(resourceType, "meeting", StringComparison.OrdinalIgnoreCase);
            form.Add(new StringContent(isMeeting ? "true" : "false"), "is_meeting");
            form.Add(new StringContent(string.IsNullOrWhiteSpace(language) ? "auto" : language), "language");

            var response = await _http.PostAsync("/api/v1/transcribe", form, ct);
            var body = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException(ExtractErrorDetail(body, "Audio transcription failed."));
            }

            var result = MapTranscriptionResponse(body, language);
            if (result.Segments == null || result.Segments.Count == 0)
            {
                throw new InvalidOperationException("No audible speech detected in the recording.");
            }

            return result;
        }

        public async Task<AiTranscriptionResponseDto> TranscribeChunkAsync(
            byte[] bytes,
            string fileName,
            string language,
            double startOffsetSeconds,
            bool isFinal,
            CancellationToken ct = default)
        {
            using var form = new MultipartFormDataContent();
            using var byteContent = new ByteArrayContent(bytes);
            byteContent.Headers.ContentType = new MediaTypeHeaderValue("audio/webm");
            form.Add(byteContent, "file", fileName);
            form.Add(new StringContent(string.IsNullOrWhiteSpace(language) ? "auto" : language), "language");
            form.Add(new StringContent("false"), "is_meeting");
            form.Add(new StringContent(startOffsetSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture)), "offset_seconds");
            form.Add(new StringContent(isFinal ? "false" : "true"), "is_partial");

            var response = await _http.PostAsync("/api/v1/transcribe-chunk", form, ct);
            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException(ExtractErrorDetail(body, "Chunk transcription failed."));
            }

            return MapTranscriptionResponse(body, language);
        }

        public async Task<AiAnalysisResponseDto> AnalyzeTranscriptAsync(
            string title,
            string resourceType,
            string language,
            List<AiTranscriptSegmentDto> segments,
            string? courseCode = null,
            CancellationToken ct = default)
        {
            var mode = string.Equals(resourceType, "lecture", StringComparison.OrdinalIgnoreCase)
                ? "lecture"
                : "meeting";
            var payload = new
            {
                title,
                mode,
                language = string.IsNullOrWhiteSpace(language) ? "auto" : language,
                course_code = courseCode,
                segments = segments.ConvertAll(s => new
                {
                    id = s.Id ?? Guid.NewGuid().ToString("N"),
                    speaker = s.Speaker,
                    start_time = s.StartTime,
                    end_time = s.EndTime,
                    text = s.Text,
                    confidence = s.Confidence,
                    is_partial = s.IsPartial
                })
            };

            var response = await _http.PostAsJsonAsync("/api/v1/analyze", payload, JsonOptions, ct);
            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException(ExtractErrorDetail(body, "AI transcript analysis failed."));
            }

            return MapAnalysisResponse(body);
        }

        public async Task<AiAskResponseDto> AskQuestionAsync(
            string title,
            string question,
            List<AiTranscriptSegmentDto> segments,
            CancellationToken ct = default)
        {
            var payload = new
            {
                title,
                question,
                segments = segments.ConvertAll(s => new
                {
                    id = s.Id ?? Guid.NewGuid().ToString("N"),
                    speaker = s.Speaker,
                    start_time = s.StartTime,
                    end_time = s.EndTime,
                    text = s.Text,
                    confidence = s.Confidence,
                    is_partial = s.IsPartial
                })
            };

            var response = await _http.PostAsJsonAsync("/api/v1/ask", payload, JsonOptions, ct);
            var body = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                throw new InvalidOperationException(ExtractErrorDetail(body, "AI Q&A service error."));
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var answer = root.TryGetProperty("answer", out var ansEl) ? ansEl.GetString() ?? "Not mentioned in this recording." : "Not mentioned in this recording.";
            var evidenceFound =
                (root.TryGetProperty("evidence_found", out var evEl) && evEl.ValueKind == JsonValueKind.True) ||
                (root.TryGetProperty("evidenceFound", out var evCamelEl) && evCamelEl.ValueKind == JsonValueKind.True);

            var citations = new List<AiQuestionCitationDto>();
            if (root.TryGetProperty("citations", out var citArr) && citArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var c in citArr.EnumerateArray())
                {
                    citations.Add(new AiQuestionCitationDto(
                        c.TryGetProperty("speaker", out var sp) ? sp.GetString() ?? "Speaker" : "Speaker",
                        c.TryGetProperty("timestamp", out var ts) ? ts.GetString() ?? "00:00" : "00:00",
                        c.TryGetProperty("quote", out var q) ? q.GetString() ?? "" : ""
                    ));
                }
            }

            return new AiAskResponseDto(answer, evidenceFound, citations);
        }

        private static AiTranscriptionResponseDto MapTranscriptionResponse(string body, string fallbackLang)
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var lang = root.TryGetProperty("detected_language", out var dl)
                ? dl.GetString() ?? fallbackLang
                : root.TryGetProperty("language", out var l)
                    ? l.GetString() ?? fallbackLang
                    : fallbackLang;
            var duration = root.TryGetProperty("duration_seconds", out var ds)
                ? ds.GetDouble()
                : root.TryGetProperty("durationSeconds", out var dc)
                    ? dc.GetDouble()
                    : 0;
            var fullText = root.TryGetProperty("full_text", out var ft)
                ? ft.GetString() ?? ""
                : root.TryGetProperty("fullText", out var fc)
                    ? fc.GetString() ?? ""
                    : "";

            var segments = new List<AiTranscriptSegmentDto>();
            if (root.TryGetProperty("segments", out var segArr) && segArr.ValueKind == JsonValueKind.Array)
            {
                var idx = 0;
                foreach (var s in segArr.EnumerateArray())
                {
                    var start = s.TryGetProperty("start_time", out var st) ? st.GetDouble() : (s.TryGetProperty("startTime", out var stc) ? stc.GetDouble() : 0);
                    var end = s.TryGetProperty("end_time", out var et) ? et.GetDouble() : (s.TryGetProperty("endTime", out var etc) ? etc.GetDouble() : start + 1);
                    var conf = s.TryGetProperty("confidence", out var cf) && cf.ValueKind == JsonValueKind.Number ? cf.GetDouble() : 0.9;
                    var isPart = (s.TryGetProperty("is_partial", out var ip) && ip.ValueKind == JsonValueKind.True) || (s.TryGetProperty("isPartial", out var ipc) && ipc.ValueKind == JsonValueKind.True);
                    segments.Add(new AiTranscriptSegmentDto(
                        s.TryGetProperty("id", out var idEl) ? idEl.GetString() : $"seg_{idx + 1}",
                        s.TryGetProperty("speaker", out var spEl) ? spEl.GetString() ?? "Speaker" : "Speaker",
                        start,
                        end,
                        s.TryGetProperty("text", out var txEl) ? txEl.GetString() ?? "" : "",
                        conf,
                        lang,
                        idx,
                        isPart
                    ));
                    idx++;
                }
            }

            return new AiTranscriptionResponseDto(true, lang, duration, "ai_service", fullText, segments);
        }

        private static AiAnalysisResponseDto MapAnalysisResponse(string body)
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            var execSummary = root.TryGetProperty("executive_summary", out var es)
                ? es.GetString() ?? ""
                : root.TryGetProperty("executiveSummary", out var esc)
                    ? esc.GetString() ?? ""
                    : "";
            var detSummary = root.TryGetProperty("detailed_summary", out var ds)
                ? ds.GetString() ?? execSummary
                : root.TryGetProperty("detailedSummary", out var dsc)
                    ? dsc.GetString() ?? execSummary
                    : execSummary;

            var topics = new List<string>();
            if (root.TryGetProperty("topics", out var topArr) && topArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var t in topArr.EnumerateArray())
                {
                    if (t.ValueKind == JsonValueKind.String)
                    {
                        var val = t.GetString();
                        if (!string.IsNullOrWhiteSpace(val)) topics.Add(val);
                    }
                    else if (t.ValueKind == JsonValueKind.Object && t.TryGetProperty("title", out var tt))
                    {
                        var val = tt.GetString();
                        if (!string.IsNullOrWhiteSpace(val)) topics.Add(val);
                    }
                }
            }

            var keywords = new List<AiKeywordDto>();
            if (root.TryGetProperty("keywords", out var kwArr) && kwArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var k in kwArr.EnumerateArray())
                {
                    var term = k.TryGetProperty("word", out var w) ? w.GetString() : (k.TryGetProperty("term", out var tm) ? tm.GetString() : null);
                    if (string.IsNullOrWhiteSpace(term)) continue;
                    var freq = k.TryGetProperty("frequency", out var fr) && fr.ValueKind == JsonValueKind.Number ? fr.GetInt32() : 1;
                    var imp = k.TryGetProperty("importance", out var im) && im.ValueKind == JsonValueKind.Number ? im.GetDouble() : 0.5;
                    var segIds = new List<string>();
                    if (k.TryGetProperty("segment_ids", out var sids) && sids.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var sid in sids.EnumerateArray())
                        {
                            if (sid.GetString() is string sVal) segIds.Add(sVal);
                        }
                    }
                    keywords.Add(new AiKeywordDto(term, freq, imp, segIds));
                }
            }

            var keyPoints = new List<string>();
            var kpProp = root.TryGetProperty("key_points", out var kp1) ? kp1 : (root.TryGetProperty("keyPoints", out var kp2) ? kp2 : default);
            if (kpProp.ValueKind == JsonValueKind.Array)
            {
                foreach (var p in kpProp.EnumerateArray())
                {
                    if (p.GetString() is string pv) keyPoints.Add(pv);
                }
            }

            var decisions = new List<string>();
            if (root.TryGetProperty("decisions", out var decArr) && decArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var d in decArr.EnumerateArray())
                {
                    if (d.GetString() is string dv) decisions.Add(dv);
                }
            }

            var actionItems = new List<AiActionItemDto>();
            var taskProp = root.TryGetProperty("tasks", out var t1) ? t1 : (root.TryGetProperty("actionItems", out var t2) ? t2 : default);
            if (taskProp.ValueKind == JsonValueKind.Array)
            {
                foreach (var t in taskProp.EnumerateArray())
                {
                    var taskTitle = t.TryGetProperty("title", out var tt) ? tt.GetString() : (t.TryGetProperty("task", out var tk) ? tk.GetString() : null);
                    if (string.IsNullOrWhiteSpace(taskTitle)) continue;
                    var assignee = t.TryGetProperty("assignee", out var asg) ? asg.GetString() : null;
                    var deadline = t.TryGetProperty("deadline_text", out var dt) ? dt.GetString() : (t.TryGetProperty("deadline", out var dl) ? dl.GetString() : "Deadline not specified.");
                    var priority = t.TryGetProperty("priority", out var pr) ? pr.GetString() ?? "medium" : "medium";
                    var srcTs = t.TryGetProperty("source_timestamp", out var sts) ? sts.GetString() : null;
                    actionItems.Add(new AiActionItemDto(taskTitle, assignee, deadline, priority, srcTs));
                }
            }

            var highlights = new List<AiHighlightDto>();
            if (root.TryGetProperty("highlights", out var hlArr) && hlArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var h in hlArr.EnumerateArray())
                {
                    var quote = h.TryGetProperty("text", out var tx) ? tx.GetString() : (h.TryGetProperty("quote", out var qt) ? qt.GetString() : null);
                    if (string.IsNullOrWhiteSpace(quote)) continue;
                    highlights.Add(new AiHighlightDto(
                        quote,
                        h.TryGetProperty("context", out var ctx) ? ctx.GetString() : null,
                        h.TryGetProperty("speaker", out var sp) ? sp.GetString() : null,
                        h.TryGetProperty("timestamp", out var ts) ? ts.GetString() : "00:00",
                        h.TryGetProperty("category", out var cat) ? cat.GetString() ?? "important_point" : "important_point",
                        h.TryGetProperty("priority", out var pri) ? pri.GetString() ?? "medium" : "medium"
                    ));
                }
            }

            var quizQuestions = new List<AiQuizQuestionDto>();
            JsonElement qArray = default;
            if (root.TryGetProperty("quiz", out var quizObj) && quizObj.ValueKind == JsonValueKind.Object && quizObj.TryGetProperty("questions", out var qqNested))
            {
                qArray = qqNested;
            }
            else if (root.TryGetProperty("quizQuestions", out var qqFlat))
            {
                qArray = qqFlat;
            }
            if (qArray.ValueKind == JsonValueKind.Array)
            {
                foreach (var q in qArray.EnumerateArray())
                {
                    var opts = new List<string>();
                    if (q.TryGetProperty("options", out var oArr) && oArr.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var o in oArr.EnumerateArray())
                        {
                            if (o.GetString() is string ov) opts.Add(ov);
                        }
                    }
                    var coIdx = q.TryGetProperty("correct_option_index", out var ci1) && ci1.ValueKind == JsonValueKind.Number
                        ? ci1.GetInt32()
                        : (q.TryGetProperty("correctOptionIndex", out var ci2) && ci2.ValueKind == JsonValueKind.Number ? ci2.GetInt32() : 0);
                    quizQuestions.Add(new AiQuizQuestionDto(
                        q.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? Guid.NewGuid().ToString("N") : Guid.NewGuid().ToString("N"),
                        q.TryGetProperty("question", out var qEl) ? qEl.GetString() ?? "" : "",
                        q.TryGetProperty("type", out var tpEl) ? tpEl.GetString() ?? "multiple_choice" : "multiple_choice",
                        opts,
                        coIdx,
                        q.TryGetProperty("correct_answer_text", out var ca1) ? ca1.GetString() : (q.TryGetProperty("correctAnswerText", out var ca2) ? ca2.GetString() : null),
                        q.TryGetProperty("explanation", out var exEl) ? exEl.GetString() ?? "" : "",
                        q.TryGetProperty("difficulty", out var dfEl) ? dfEl.GetString() ?? "medium" : "medium",
                        q.TryGetProperty("source_timestamp", out var ts1) ? ts1.GetString() : (q.TryGetProperty("timestampRef", out var ts2) ? ts2.GetString() : null)
                    ));
                }
            }

            var flashcards = new List<AiFlashcardDto>();
            if (root.TryGetProperty("flashcards", out var fcArr) && fcArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var fc in fcArr.EnumerateArray())
                {
                    flashcards.Add(new AiFlashcardDto(
                        fc.TryGetProperty("front", out var fr) ? fr.GetString() ?? "" : "",
                        fc.TryGetProperty("back", out var bk) ? bk.GetString() ?? "" : "",
                        fc.TryGetProperty("source_timestamp", out var st1) ? st1.GetString() : (fc.TryGetProperty("timestampRef", out var st2) ? st2.GetString() : null)
                    ));
                }
            }

            JsonElement? mindMap = null;
            if (root.TryGetProperty("mind_map", out var mm1) && mm1.ValueKind == JsonValueKind.Object)
            {
                mindMap = mm1.Clone();
            }
            else if (root.TryGetProperty("mindMap", out var mm2) && mm2.ValueKind == JsonValueKind.Object)
            {
                mindMap = mm2.Clone();
            }

            return new AiAnalysisResponseDto(
                execSummary,
                detSummary,
                topics,
                keywords,
                keyPoints,
                decisions,
                actionItems,
                highlights,
                quizQuestions,
                flashcards,
                mindMap
            );
        }

        private static string ExtractErrorDetail(string body, string fallback)
        {
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("detail", out var detail))
                {
                    return detail.GetString() ?? fallback;
                }
                if (doc.RootElement.TryGetProperty("error", out var error))
                {
                    return error.GetString() ?? fallback;
                }
            }
            catch
            {
                // ignore JSON parse issues
            }
            return fallback;
        }
    }
}
