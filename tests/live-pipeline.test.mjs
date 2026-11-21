import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.MEETMIND_TEST_URL || "http://127.0.0.1:3000";
const DB_PATH = path.resolve(process.cwd(), "data/meetmind_db.json");
const RECORDINGS_DIR = path.resolve(process.cwd(), "data/recordings");
const CHUNKS_DIR = path.resolve(process.cwd(), "data/chunks");

function wrapPcmAsWavBuffer(pcmBuffer, sampleRate = 16000, channels = 1, bitsPerSample = 16) {
  if (pcmBuffer.length >= 4 && pcmBuffer.subarray(0, 4).toString("ascii") === "RIFF") {
    return pcmBuffer;
  }
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

function createSilentWavBase64(durationSec = 1.5, sampleRate = 16000) {
  const numSamples = Math.round(durationSec * sampleRate);
  const pcm = Buffer.alloc(numSamples * 2, 0);
  return wrapPcmAsWavBuffer(pcm, sampleRate, 1, 16).toString("base64");
}

function createToneWavBase64(durationSec = 1.8, freqHz = 440, sampleRate = 16000) {
  const numSamples = Math.round(durationSec * sampleRate);
  const pcm = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round(Math.sin((2 * Math.PI * freqHz * i) / sampleRate) * 4000);
    pcm.writeInt16LE(sample, i * 2);
  }
  return wrapPcmAsWavBuffer(pcm, sampleRate, 1, 16).toString("base64");
}

const createdUserIds = new Set();
const createdEmails = new Set();
const createdResourceIds = new Set();

async function registerTestUser(prefix) {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const email = `${prefix}_${unique}@meetmind.test`;
  const password = `LiveTest!${unique}9`;
  createdEmails.add(email);

  const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      name: `Test ${prefix}`,
      email,
      password,
      confirmPassword: password,
      department: "Engineering",
    }),
  });
  const data = await res.json();
  assert.equal(res.status, 201, `Register failed for ${prefix}: ${JSON.stringify(data)}`);
  assert.ok(data.token, "Auth token must be returned");
  createdUserIds.add(data.user.id);
  return { token: data.token, user: data.user };
}

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

describe("MeetMind AI — Real Continuous Live Arabic/Mixed Speech Intelligence Pipeline E2E", () => {
  after(() => {
    for (const rid of createdResourceIds) {
      for (const ext of ["wav", "webm", "m4a"]) {
        const filePath = path.join(RECORDINGS_DIR, `recording_${rid}.${ext}`);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch {
            // ignore
          }
        }
      }
      const liveDir = path.join(CHUNKS_DIR, `live_${rid}`);
      if (fs.existsSync(liveDir)) {
        try {
          fs.rmSync(liveDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    }

    if (!fs.existsSync(DB_PATH)) return;
    try {
      const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
      if (Array.isArray(db.users)) {
        db.users = db.users.filter((u) => !createdUserIds.has(u.id) && !createdEmails.has(u.email));
      }
      if (Array.isArray(db.authSessions)) {
        db.authSessions = db.authSessions.filter((s) => !createdUserIds.has(s.userId));
      }
      if (Array.isArray(db.meetings)) {
        db.meetings = db.meetings.filter((m) => !createdResourceIds.has(m.id));
      }
      if (Array.isArray(db.lectures)) {
        db.lectures = db.lectures.filter((l) => !createdResourceIds.has(l.id));
      }
      if (Array.isArray(db.recordingSessions)) {
        db.recordingSessions = db.recordingSessions.filter((s) => !createdResourceIds.has(s.id));
      }
      if (Array.isArray(db.tasks)) {
        db.tasks = db.tasks.filter(
          (t) => !createdResourceIds.has(t.meetingId) && !createdResourceIds.has(t.lectureId),
        );
      }
      if (Array.isArray(db.quizzes)) {
        db.quizzes = db.quizzes.filter(
          (q) => !createdResourceIds.has(q.meetingId) && !createdResourceIds.has(q.lectureId),
        );
      }
      if (Array.isArray(db.flashcards)) {
        db.flashcards = db.flashcards.filter(
          (f) => !createdResourceIds.has(f.meetingId) && !createdResourceIds.has(f.lectureId),
        );
      }
      if (Array.isArray(db.mindMaps)) {
        db.mindMaps = db.mindMaps.filter((m) => !createdResourceIds.has(m.lectureId));
      }
      if (Array.isArray(db.notifications)) {
        db.notifications = db.notifications.filter(
          (n) =>
            !createdUserIds.has(n.userId) && !createdResourceIds.has(n.targetUrl?.split("/").pop()),
        );
      }
      if (Array.isArray(db.chatMessages)) {
        db.chatMessages = db.chatMessages.filter(
          (c) => !createdResourceIds.has(c.resourceId) && !createdUserIds.has(c.userId),
        );
      }
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
    } catch {
      // ignore cleanup error
    }
  });

  it("1. Enforces strict cross-user ownership isolation on all live session, chunk, status, recovery, and finalize endpoints", async () => {
    const userA = await registerTestUser("iso_owner");
    const userB = await registerTestUser("iso_other");

    const startRes = await fetch(`${BASE_URL}/api/v1/recordings/session/start`, {
      method: "POST",
      headers: authHeaders(userA.token),
      body: JSON.stringify({
        type: "lecture",
        title: "جلسة خاصة للمستخدم الأول",
        courseCode: "SEC 401",
        speakerName: "د. سارة",
        language: "ar-EG",
      }),
    });
    assert.equal(startRes.status, 200);
    const { recordingId } = await startRes.json();
    createdResourceIds.add(recordingId);

    const [forbiddenGet, forbiddenStatus, forbiddenAppend, forbiddenChunk, forbiddenFinalize, otherActive] =
      await Promise.all([
        fetch(`${BASE_URL}/api/v1/transcripts/session/${recordingId}`, {
          headers: authHeaders(userB.token),
        }),
        fetch(`${BASE_URL}/api/v1/recordings/session/${recordingId}/status`, {
          method: "PATCH",
          headers: authHeaders(userB.token),
          body: JSON.stringify({ status: "Paused" }),
        }),
        fetch(`${BASE_URL}/api/v1/transcripts/session/append-segment`, {
          method: "POST",
          headers: authHeaders(userB.token),
          body: JSON.stringify({
            recordingId,
            segment: { speaker: "دخيل", startTime: 0, endTime: 2, text: "نص غير مصرح" },
          }),
        }),
        fetch(`${BASE_URL}/api/v1/transcripts/live-chunk`, {
          method: "POST",
          headers: authHeaders(userB.token),
          body: JSON.stringify({
            recordingId,
            chunkId: `${recordingId}_seq_99`,
            sequenceNumber: 99,
            audioBase64: createSilentWavBase64(1),
            mimeType: "audio/wav",
            startTime: 0,
            endTime: 1,
            speaker: "دخيل",
            language: "ar-EG",
          }),
        }),
        fetch(`${BASE_URL}/api/v1/transcripts/live-session/finalize`, {
          method: "POST",
          headers: authHeaders(userB.token),
          body: JSON.stringify({
            recordingId,
            type: "lecture",
            title: "اختراق",
            durationSeconds: 3,
          }),
        }),
        fetch(`${BASE_URL}/api/v1/recordings/session/active`, {
          headers: authHeaders(userB.token),
        }),
      ]);

    assert.equal(forbiddenGet.status, 403, "Cross-user GET session must return 403");
    assert.equal(forbiddenStatus.status, 403, "Cross-user PATCH status must return 403");
    assert.equal(forbiddenAppend.status, 403, "Cross-user append-segment must return 403");
    assert.equal(forbiddenChunk.status, 403, "Cross-user live-chunk must return 403");
    assert.equal(forbiddenFinalize.status, 403, "Cross-user finalize must return 403");
    const otherActiveJson = await otherActive.json();
    assert.equal(otherActiveJson.session, null, "User B must not see User A's active session");
  });

  it(
    "2. Streams WAV chunks to disk (verifying real Gemini ASR invocation & zero fake fallback), enforces out-of-order canonical sorting & idempotency, recovers interrupted sessions, assembles multi-chunk WAV via ffmpeg, runs unified post-transcription AI pipeline, verifies grounded quiz & grounded AI chat",
    { timeout: 180000 },
    async () => {
      const healthRes = await fetch(`${BASE_URL}/api/v1/health`);
      const health = await healthRes.json();
      assert.equal(healthRes.status, 200);
      assert.equal(health.aiConfigured, true, "Server must have GEMINI_API_KEY configured");
      assert.equal(health.ffmpegAvailable, true, "Server must have ffmpeg installed");

      const userA = await registerTestUser("live_e2e");

      // 1. Start persistent live lecture session
      const startRes = await fetch(`${BASE_URL}/api/v1/recordings/session/start`, {
        method: "POST",
        headers: authHeaders(userA.token),
        body: JSON.stringify({
          type: "lecture",
          title: "محاضرة هندسة أنظمة الزمن الحقيقي — اختبار مباشر",
          courseCode: "CS 710",
          speakerName: "د. طارق",
          language: "mixed",
        }),
      });
      assert.equal(startRes.status, 200);
      const { recordingId } = await startRes.json();
      createdResourceIds.add(recordingId);

      // 2. Stream 3 valid 16kHz RIFF WAV chunks to POST /api/v1/transcripts/live-chunk
      // Note: Even if the upstream Gemini project has depleted credits (HTTP 402 -> 422),
      // the server MUST persist every WAV chunk to disk AND MUST NOT return fabricated transcript text.
      const chunkPayloads = [
        { seq: 0, start: 0, end: 12, wav: createToneWavBase64(1.8, 320) },
        { seq: 1, start: 12, end: 24, wav: createToneWavBase64(1.8, 440) },
        { seq: 2, start: 24, end: 36, wav: createToneWavBase64(1.8, 520) },
      ];

      let liveAsrCreditsAvailable = true;
      for (const c of chunkPayloads) {
        const res = await fetch(`${BASE_URL}/api/v1/transcripts/live-chunk`, {
          method: "POST",
          headers: authHeaders(userA.token),
          body: JSON.stringify({
            recordingId,
            sessionId: recordingId,
            chunkId: `${recordingId}_wav_${c.seq}`,
            sequenceNumber: c.seq,
            chunkIndex: c.seq,
            audioBase64: c.wav,
            mimeType: "audio/wav",
            startTime: c.start,
            endTime: c.end,
            duration: c.end - c.start,
            speaker: "د. طارق",
            language: "mixed",
            isMeeting: false,
          }),
        });
        const body = await res.json();
        if (res.status === 422 && body.error && /402|الرصيد|credits/i.test(body.error)) {
          liveAsrCreditsAvailable = false;
          assert.equal(body.success, false, "Depleted-credits ASR must return success: false (never fake text)");
          assert.equal(body.retryable, false, "HTTP 402 billing errors must be marked retryable: false");
        } else {
          assert.equal(res.status, 200, `Unexpected live-chunk response: ${JSON.stringify(body)}`);
          assert.equal(body.success, true);
        }
      }

      // Verify all 3 WAV chunks were genuinely persisted to disk for assembly
      const chunksDir = path.join(CHUNKS_DIR, `live_${recordingId}`);
      assert.ok(fs.existsSync(chunksDir), "Live audio chunks directory must be persisted on disk");
      const savedChunkFiles = fs.readdirSync(chunksDir).filter((f) => f.endsWith(".wav"));
      assert.equal(savedChunkFiles.length, 3, "All 3 streamed WAV chunks must be saved on disk");

      // If live ASR credits were available, verify idempotent replay + silence rejection directly on /live-chunk
      if (liveAsrCreditsAvailable) {
        const replayRes = await fetch(`${BASE_URL}/api/v1/transcripts/live-chunk`, {
          method: "POST",
          headers: authHeaders(userA.token),
          body: JSON.stringify({
            recordingId,
            chunkId: `${recordingId}_wav_1`,
            sequenceNumber: 1,
            audioBase64: chunkPayloads[1].wav,
            mimeType: "audio/wav",
            startTime: 12,
            endTime: 24,
            speaker: "د. طارق",
            language: "mixed",
          }),
        });
        const replayBody = await replayRes.json();
        assert.equal(replayRes.status, 200);
        assert.equal(replayBody.duplicate, true, "Duplicate chunkId must return duplicate: true");

        const silentRes = await fetch(`${BASE_URL}/api/v1/transcripts/live-chunk`, {
          method: "POST",
          headers: authHeaders(userA.token),
          body: JSON.stringify({
            recordingId,
            chunkId: `${recordingId}_wav_silent`,
            sequenceNumber: 3,
            audioBase64: createSilentWavBase64(1.5),
            mimeType: "audio/wav",
            startTime: 36,
            endTime: 38,
            speaker: "د. طارق",
            language: "mixed",
          }),
        });
        const silentBody = await silentRes.json();
        assert.equal(silentRes.status, 200);
        assert.equal(silentBody.isSilence, true, "Silent chunk must return isSilence: true");
      }

      // 3. Persist Arabic + Mixed AR/EN segments OUT OF ORDER (seq 0, seq 2, seq 1) + duplicate replay of seq 1
      const spokenLines = [
        "أهلاً بكم في محاضرة هندسة البرمجيات. النهارده هنتكلم عن بناء أنظمة الزمن الحقيقي باستخدام FastAPI و SignalR مع قاعدة بيانات SQL Server.",
        "دي نقطة مهمة جداً ممكن تيجي في الامتحان: لازم نستخدم نظام Queue مع Idempotency Key عشان نمنع تكرار البيانات لو حصل انقطاع في الشبكة.",
        "قررنا إننا نعتمد معمارية Microservices في المشروع. والمطلوب من المهندس أحمد يخلص توثيق الـ API يوم الخميس الجاي.",
      ];

      const appendSeg = async (seq, startTime, endTime, text) => {
        const res = await fetch(`${BASE_URL}/api/v1/transcripts/session/append-segment`, {
          method: "POST",
          headers: authHeaders(userA.token),
          body: JSON.stringify({
            recordingId,
            segment: {
              id: `seg_${recordingId}_seq_${seq}`,
              speaker: "د. طارق",
              startTime,
              endTime,
              text,
              sequenceNumber: seq,
              chunkId: `${recordingId}_seg_${seq}`,
              isFinal: true,
            },
          }),
        });
        assert.equal(res.status, 200);
        return res.json();
      };

      await appendSeg(0, 0, 12, spokenLines[0]);
      await appendSeg(2, 24, 36, spokenLines[2]); // deliberately out of order!
      await appendSeg(1, 12, 24, spokenLines[1]);
      await appendSeg(1, 12, 24, spokenLines[1]); // duplicate replay!

      // Verify canonical order [0, 1, 2] & zero duplicates in DB
      const transcriptRes = await fetch(`${BASE_URL}/api/v1/transcripts/session/${recordingId}`, {
        headers: authHeaders(userA.token),
      });
      assert.equal(transcriptRes.status, 200);
      const transcriptJson = await transcriptRes.json();
      assert.equal(transcriptJson.segments.length, 3, "Must store exactly 3 deduplicated segments");
      assert.deepEqual(
        transcriptJson.segments.map((s) => s.sequenceNumber),
        [0, 1, 2],
        "Out-of-order segments must be sorted canonically by sequenceNumber",
      );

      // 4. Crash / Reload Recovery flow: mark Interrupted -> fetch /session/active
      const interruptRes = await fetch(
        `${BASE_URL}/api/v1/recordings/session/${recordingId}/status`,
        {
          method: "PATCH",
          headers: authHeaders(userA.token),
          body: JSON.stringify({ status: "Interrupted", durationSeconds: 38 }),
        },
      );
      assert.equal(interruptRes.status, 200);

      const recoverRes = await fetch(`${BASE_URL}/api/v1/recordings/session/active`, {
        headers: authHeaders(userA.token),
      });
      assert.equal(recoverRes.status, 200);
      const recoverJson = await recoverRes.json();
      assert.ok(recoverJson.session, "Interrupted session must be recoverable via /session/active");
      assert.equal(recoverJson.session.recordingId, recordingId);
      assert.equal(recoverJson.session.status, "Interrupted");
      assert.equal(recoverJson.session.segments.length, 3);

      // 5. Stop & Finalize -> real ffmpeg multi-chunk WAV assembly + Unified Post-Transcription Intelligence Pipeline
      const finalizeRes = await fetch(`${BASE_URL}/api/v1/transcripts/live-session/finalize`, {
        method: "POST",
        headers: authHeaders(userA.token),
        body: JSON.stringify({
          recordingId,
          type: "lecture",
          title: "محاضرة هندسة أنظمة الزمن الحقيقي — اختبار مباشر",
          courseCode: "CS 710",
          language: "mixed",
          durationSeconds: 38,
        }),
      });
      const finalizeJson = await finalizeRes.json();
      assert.equal(finalizeRes.status, 200, `Finalize failed: ${JSON.stringify(finalizeJson)}`);
      assert.equal(finalizeJson.success, true);
      assert.equal(finalizeJson.status, "Completed");
      assert.equal(finalizeJson.hasAudio, true, "ffmpeg must assemble streamed WAV chunks into canonical audio");
      assert.equal(finalizeJson.segmentsCount, 3);

      // Verify assembled audio streams back as a valid multi-chunk RIFF WAV file
      const audioRes = await fetch(`${BASE_URL}/api/v1/recordings/audio/${recordingId}`, {
        headers: { Authorization: `Bearer ${userA.token}` },
      });
      assert.equal(audioRes.status, 200, "Assembled recording audio must stream with HTTP 200");
      const audioBuf = Buffer.from(await audioRes.arrayBuffer());
      assert.equal(
        audioBuf.subarray(0, 4).toString("ascii"),
        "RIFF",
        "Assembled audio must be a valid RIFF WAV container",
      );
      assert.ok(
        audioBuf.length > 100000,
        `Assembled 3x1.8s 16kHz WAV must exceed 100KB, got ${audioBuf.length} bytes`,
      );
      assert.equal(
        fs.existsSync(chunksDir),
        false,
        "Temporary live_chunks directory must be cleaned up after assembly",
      );

      // 6. Verify Unified Post-Transcription Outputs on the Lecture record
      const lectureRes = await fetch(`${BASE_URL}/api/v1/lectures/${recordingId}`, {
        headers: authHeaders(userA.token),
      });
      assert.equal(lectureRes.status, 200);
      const lecture = await lectureRes.json();
      assert.equal(lecture.status, "Completed");
      assert.ok(lecture.summary && lecture.summary.length > 30, "Summary must be populated");
      assert.ok(
        lecture.detailedSummary && lecture.detailedSummary.length > 30,
        "Detailed summary must be populated",
      );
      assert.ok(
        Array.isArray(lecture.keywords) && lecture.keywords.length >= 3,
        "Keywords must be extracted with frequency counts",
      );
      assert.ok(
        lecture.keywords.some((k) => /fastapi|signalr|sql|microservices|api|idempotency/i.test(k.term)),
        `Keywords must preserve mixed English technical terms, got: ${JSON.stringify(lecture.keywords.map((k) => k.term))}`,
      );
      assert.ok(
        lecture.keywords.every((k) => typeof k.frequency === "number" && k.frequency >= 1 && k.timestamp),
        "Every keyword must include frequency and timestamp",
      );
      assert.ok(
        Array.isArray(lecture.highlights) && lecture.highlights.length >= 1,
        "Important sentences / Arabic exam emphasis cues must be extracted",
      );
      assert.ok(
        lecture.highlights.some((h) => h.quote.includes("امتحان") || h.quote.includes("مهمة") || h.quote.includes("قررنا")),
        "Highlights must capture Arabic emphasis/decision sentences",
      );

      // Verify Tasks, Quiz (with groundingVerified), Flashcards & Mind Map
      const [tasksRes, quizzesRes, flashcardsRes, mindMapsRes] = await Promise.all([
        fetch(`${BASE_URL}/api/v1/tasks`, { headers: authHeaders(userA.token) }),
        fetch(`${BASE_URL}/api/v1/quizzes`, { headers: authHeaders(userA.token) }),
        fetch(`${BASE_URL}/api/v1/flashcards`, { headers: authHeaders(userA.token) }),
        fetch(`${BASE_URL}/api/v1/mindmaps`, { headers: authHeaders(userA.token) }),
      ]);
      const [tasks, quizzes, flashcards, mindMaps] = await Promise.all([
        tasksRes.json(),
        quizzesRes.json(),
        flashcardsRes.json(),
        mindMapsRes.json(),
      ]);

      assert.ok(
        tasks.some((t) => t.lectureId === recordingId),
        "Unified pipeline must extract action items/tasks from transcript",
      );
      const lectureQuiz = quizzes.find((q) => q.lectureId === recordingId);
      assert.ok(lectureQuiz, "Unified pipeline must generate a quiz for the live lecture");
      assert.ok(lectureQuiz.questions.length >= 1, "Quiz must contain grounded questions");
      for (const q of lectureQuiz.questions) {
        assert.equal(
          q.groundingVerified,
          true,
          `Quiz question must pass grounding verification: ${q.question}`,
        );
        assert.ok(
          q.sourceTranscriptSegment && q.sourceTranscriptSegment.length > 5,
          "Quiz question must cite its sourceTranscriptSegment",
        );
      }
      assert.ok(
        flashcards.some((f) => f.lectureId === recordingId),
        "Unified pipeline must generate flashcards",
      );
      assert.ok(
        mindMaps.some((m) => m.lectureId === recordingId),
        "Unified pipeline must generate a mind map",
      );

      // 7. Grounded AI Chat Q&A — In-Transcript & Out-of-Transcript anti-hallucination check
      const inScopeAsk = await fetch(`${BASE_URL}/api/v1/ai/ask`, {
        method: "POST",
        headers: authHeaders(userA.token),
        body: JSON.stringify({
          resourceId: recordingId,
          question: "ما هي التقنيات التي تم ذكرها مثل FastAPI و SignalR؟",
        }),
      });
      assert.equal(inScopeAsk.status, 200);
      const inScopeData = await inScopeAsk.json();
      assert.equal(inScopeData.evidenceFound, true, "AI chat must confirm evidence for spoken facts");

      const outScopeAsk = await fetch(`${BASE_URL}/api/v1/ai/ask`, {
        method: "POST",
        headers: authHeaders(userA.token),
        body: JSON.stringify({
          resourceId: recordingId,
          question: "ما هو سعر تذكرة السفر إلى كوكب المريخ الذي ذكره المحاضر؟",
        }),
      });
      assert.equal(outScopeAsk.status, 200);
      const outScopeData = await outScopeAsk.json();
      assert.equal(
        outScopeData.evidenceFound,
        false,
        `AI chat must refuse to hallucinate facts absent from transcript, got: ${JSON.stringify(outScopeData)}`,
      );
    },
  );

  it("3. Finalizing an empty session with zero speech and zero audio fails cleanly (422) without fabricating content", async () => {
    const user = await registerTestUser("live_empty");

    const startRes = await fetch(`${BASE_URL}/api/v1/recordings/session/start`, {
      method: "POST",
      headers: authHeaders(user.token),
      body: JSON.stringify({
        type: "meeting",
        title: "جلسة فارغة للتحقق",
        language: "ar-EG",
      }),
    });
    const sessionStart = await startRes.json();
    const emptyId = sessionStart.recordingId;
    createdResourceIds.add(emptyId);

    const finalizeRes = await fetch(`${BASE_URL}/api/v1/transcripts/live-session/finalize`, {
      method: "POST",
      headers: authHeaders(user.token),
      body: JSON.stringify({
        recordingId: emptyId,
        type: "meeting",
        title: "جلسة فارغة للتحقق",
        language: "ar-EG",
        segments: [],
        durationSeconds: 3,
      }),
    });
    const finalizeData = await finalizeRes.json();
    assert.equal(finalizeRes.status, 422, "Empty session must return HTTP 422 instead of fake data");
    assert.equal(finalizeData.success, false);
    assert.equal(finalizeData.segmentsCount, 0);
  });
});
