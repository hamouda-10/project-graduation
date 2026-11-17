#!/usr/bin/env python3
"""
MeetMind AI - Grounded Intelligence & Educational/Meeting Analysis Service
Extracts executive/detailed summaries, keywords, topics, exam highlights, tasks, decisions,
quizzes, flashcards, mind maps, and grounded Q&A strictly from verified transcript segments.
"""

import json
import os
import re
import urllib.request
import urllib.error
from collections import Counter
from typing import Any, Dict, List, Optional


STOPWORDS = {
    # English
    "the", "and", "for", "that", "this", "with", "from", "have", "were", "been",
    "will", "would", "could", "should", "about", "into", "over", "after", "before",
    "there", "their", "they", "what", "when", "where", "which", "while", "your",
    "just", "like", "then", "than", "also", "very", "some", "more", "most",
    # Arabic
    "في", "من", "على", "إلى", "الى", "عن", "مع", "هذا", "هذه", "ذلك", "تلك",
    "التي", "الذي", "الذين", "تم", "كان", "كانت", "يكون", "تكون", "كل", "هو", "هي",
    "نحن", "هم", "أن", "إن", "او", "أو", "ثم", "هل", "ما", "ماذا", "كيف", "لماذا",
    "حيث", "بين", "عند", "قد", "لقد", "سوف", "عشان", "يعني", "بس", "جدا", " جدا",
}

DECISION_MARKERS = (
    "decided", "agreed", "approved", "confirmed", "resolved", "finalized", "will proceed",
    "تم الاتفاق", "تقرر", "اعتمدنا", "وافقنا", "القرار", "نلتزم", "سيتم اعتماد",
)

TASK_MARKERS = (
    "need to", "must ", "will send", "will prepare", "action item", "assigned to", "follow up",
    "responsible for", "by friday", "by monday", "next week", "tomorrow",
    "يجب", "مطلوب", "لازم", "تكليف", "مهمة", "سيقوم", "إعداد", "مراجعة", "تسليم", "متابعة",
)

HIGHLIGHT_MARKERS = (
    "important", "exam", "midterm", "final", "remember", "key point", "critical", "note that",
    "define", "definition", "means that", "for example",
    "مهم", "مهمة", "الامتحان", "الاختبار", "ركزوا", "احفظ", "تعريف", "المقصود", "على سبيل المثال", "قاعدة",
)

DEADLINE_PATTERN = re.compile(
    r"\b(?:by|before|until|on|next)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|"
    r"tomorrow|today|next week|end of week|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2})\b"
    r"|(?:قبل|بحلول|يوم|موعد)\s+(?:الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|غدا|غداً|الأسبوع القادم|\d{4}-\d{2}-\d{2})",
    re.IGNORECASE,
)


def _format_ts(seconds: float) -> str:
    sec = max(0, int(round(seconds or 0)))
    return f"{sec // 60:02d}:{sec % 60:02d}"


def _segments_to_text(segments: List[Dict[str, Any]]) -> str:
    lines = []
    for s in segments:
        start = float(s.get("start_time", s.get("startTime", 0)) or 0)
        speaker = s.get("speaker") or "Speaker"
        text = str(s.get("text") or "").strip()
        if text:
            lines.append(f"[{_format_ts(start)}] {speaker}: {text}")
    return "\n".join(lines)


def _call_gemini_json(prompt: str) -> Optional[Any]:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    model = os.environ.get("GEMINI_MODEL", "gemini-4-hydrogen")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            text = (
                body.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )
            if text:
                cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.IGNORECASE)
                return json.loads(cleaned)
    except (urllib.error.URLError, json.JSONDecodeError, KeyError, IndexError, TimeoutError):
        return None
    return None


def _call_openai_json(prompt: str) -> Optional[Any]:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": model,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": "Respond strictly with valid JSON grounded in the transcript."},
            {"role": "user", "content": prompt},
        ],
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            text = body["choices"][0]["message"]["content"]
            return json.loads(text)
    except (urllib.error.URLError, json.JSONDecodeError, KeyError, IndexError, TimeoutError):
        return None


def _extract_keywords(segments: List[Dict[str, Any]], max_items: int = 12) -> List[Dict[str, Any]]:
    counter: Counter = Counter()
    seg_refs: Dict[str, List[str]] = {}
    for s in segments:
        seg_id = str(s.get("id") or "")
        text = str(s.get("text") or "")
        words = re.findall(r"[\w\u0600-\u06FF]{3,}", text)
        for w in words:
            norm = w.lower()
            if norm in STOPWORDS or norm.isdigit():
                continue
            counter[norm] += 1
            if seg_id:
                refs = seg_refs.setdefault(norm, [])
                if seg_id not in refs:
                    refs.append(seg_id)

    total = max(sum(counter.values()), 1)
    keywords = []
    for word, freq in counter.most_common(max_items):
        keywords.append({
            "word": word,
            "frequency": freq,
            "importance": round(min(1.0, (freq / total) * 8.0), 3),
            "segment_ids": seg_refs.get(word, [])[:5],
        })
    return keywords


def _deterministic_analysis(
    title: str,
    segments: List[Dict[str, Any]],
    mode: str,
    course_code: Optional[str] = None,
) -> Dict[str, Any]:
    non_empty = [s for s in segments if str(s.get("text") or "").strip()]
    if not non_empty:
        raise ValueError("Cannot analyze an empty transcript.")

    keywords = _extract_keywords(non_empty)
    key_points = [str(s["text"]).strip() for s in non_empty[:5]]

    # Decisions strictly matching transcript lines
    decisions: List[str] = []
    tasks: List[Dict[str, Any]] = []
    highlights: List[Dict[str, Any]] = []
    questions_asked: List[Dict[str, Any]] = []

    for s in non_empty:
        txt = str(s.get("text") or "").strip()
        lower = txt.lower()
        ts = _format_ts(float(s.get("start_time", s.get("startTime", 0)) or 0))
        speaker = str(s.get("speaker") or "Speaker")

        if any(m in lower for m in DECISION_MARKERS):
            decisions.append(txt)

        if any(m in lower for m in TASK_MARKERS):
            deadline_match = DEADLINE_PATTERN.search(txt)
            tasks.append({
                "title": txt[:140],
                "assignee": speaker if speaker not in ("Speaker", "المتحدث", "المتحدث 1", "Speaker 1") else None,
                "deadline_text": deadline_match.group(0) if deadline_match else "Deadline not specified.",
                "priority": "high" if any(u in lower for u in ("urgent", "critical", "عاجل", "فوراً")) else "medium",
                "source_timestamp": ts,
            })

        if any(m in lower for m in HIGHLIGHT_MARKERS):
            category = "definition" if any(d in lower for d in ("define", "definition", "تعريف", "المقصود")) else (
                "exam_focus" if any(e in lower for e in ("exam", "midterm", "الامتحان", "الاختبار")) else "important_point"
            )
            highlights.append({
                "text": txt,
                "category": category,
                "priority": "high" if category == "exam_focus" else "medium",
                "timestamp": ts,
                "speaker": speaker,
            })

        if "?" in txt or "؟" in txt:
            questions_asked.append({"question": txt, "answer": None, "timestamp": ts})

    if not highlights:
        first_ts = _format_ts(float(non_empty[0].get("start_time", non_empty[0].get("startTime", 0)) or 0))
        highlights.append({
            "text": str(non_empty[0]["text"]).strip(),
            "category": "important_point",
            "priority": "medium",
            "timestamp": first_ts,
            "speaker": str(non_empty[0].get("speaker") or "Speaker"),
        })

    # Topics derived from top keywords & segment clusters
    top_words = [k["word"] for k in keywords[:4]]
    topics = [
        {
            "title": kw,
            "description": f"Discussed in {len(next((k['segment_ids'] for k in keywords if k['word'] == kw), []))} transcript segments.",
            "timestamp_range": f"{_format_ts(float(non_empty[0].get('start_time', non_empty[0].get('startTime', 0)) or 0))} - {_format_ts(float(non_empty[-1].get('end_time', non_empty[-1].get('endTime', 0)) or 0))}",
        }
        for kw in top_words
    ]

    exec_summary = " ".join(key_points[:2])
    detailed_summary = "\n".join(f"- [{_format_ts(float(s.get('start_time', s.get('startTime', 0)) or 0))}] {s.get('speaker', 'Speaker')}: {s.get('text', '').strip()}" for s in non_empty[:8])

    # Quiz grounded strictly in actual segment quotes
    quiz_questions = []
    if len(non_empty) >= 1:
        s0 = non_empty[0]
        ts0 = _format_ts(float(s0.get("start_time", s0.get("startTime", 0)) or 0))
        quiz_questions.append({
            "id": "q_1",
            "question": f"Which statement was directly made at [{ts0}] in \"{title}\"?",
            "type": "multiple_choice",
            "options": [
                str(s0["text"]).strip()[:140],
                "No agenda items or concepts were discussed in this recording.",
                "The session was cancelled before any topic started.",
                "None of the recorded statements apply.",
            ],
            "correct_option_index": 0,
            "correct_answer_text": str(s0["text"]).strip()[:140],
            "explanation": f"Verified directly from transcript at [{ts0}].",
            "difficulty": "easy",
            "source_timestamp": ts0,
        })
    if len(non_empty) >= 2:
        s_mid = non_empty[len(non_empty) // 2]
        ts_mid = _format_ts(float(s_mid.get("start_time", s_mid.get("startTime", 0)) or 0))
        quiz_questions.append({
            "id": "q_2",
            "question": f"True or False: At [{ts_mid}], {s_mid.get('speaker', 'the speaker')} stated: \"{str(s_mid['text']).strip()[:120]}\".",
            "type": "true_false",
            "options": ["True", "False"],
            "correct_option_index": 0,
            "correct_answer_text": "True",
            "explanation": f"Confirmed verbatim in the transcript at [{ts_mid}].",
            "difficulty": "easy",
            "source_timestamp": ts_mid,
        })
    if len(non_empty) >= 3:
        s_last = non_empty[-1]
        ts_last = _format_ts(float(s_last.get("start_time", s_last.get("startTime", 0)) or 0))
        quiz_questions.append({
            "id": "q_3",
            "question": f"Summarize the closing point recorded at [{ts_last}] in \"{title}\".",
            "type": "short_answer",
            "options": [],
            "correct_option_index": 0,
            "correct_answer_text": str(s_last["text"]).strip(),
            "explanation": f"Directly supported by the final transcript segment at [{ts_last}].",
            "difficulty": "medium",
            "source_timestamp": ts_last,
        })

    flashcards = [
        {
            "front": f"What key point was discussed at [{_format_ts(float(s.get('start_time', s.get('startTime', 0)) or 0))}] by {s.get('speaker', 'Speaker')}?",
            "back": str(s["text"]).strip(),
            "source_timestamp": _format_ts(float(s.get("start_time", s.get("startTime", 0)) or 0)),
        }
        for s in non_empty[:6]
    ]

    mind_map = {
        "id": "root",
        "label": title,
        "description": exec_summary[:180],
        "children": [
            {
                "id": f"topic_{idx+1}",
                "label": t["title"],
                "description": t["description"],
                "children": [],
            }
            for idx, t in enumerate(topics)
        ],
    }

    return {
        "mode": mode,
        "executive_summary": exec_summary,
        "detailed_summary": detailed_summary,
        "summary": exec_summary,
        "study_notes": detailed_summary if mode == "lecture" else None,
        "key_points": key_points,
        "topics": topics,
        "keywords": keywords,
        "highlights": highlights,
        "decisions": decisions,
        "tasks": tasks,
        "questions_asked": questions_asked,
        "key_concepts": [
            {"term": h["text"][:60], "definition": h["text"], "timestamp": h["timestamp"]}
            for h in highlights[:5]
        ],
        "quiz": {
            "title": f"Assessment Quiz: {title}",
            "course_code": course_code,
            "questions": quiz_questions,
        },
        "flashcards": flashcards,
        "mind_map": mind_map,
    }


def analyze_transcript(
    title: str,
    segments: List[Dict[str, Any]],
    mode: str = "meeting",
    course_code: Optional[str] = None,
    language: str = "auto",
) -> Dict[str, Any]:
    """Run grounded LLM analysis when configured, or strict transcript-derived extraction."""
    transcript_text = _segments_to_text(segments)
    if not transcript_text:
        raise ValueError("Cannot analyze an empty transcript.")

    prompt = f"""You are MeetMind AI's analytical engine.
Analyze the following {mode} titled "{title}" {f'(Course: {course_code})' if course_code else ''}.
STRICT GROUNDING RULES:
1. Base EVERY single summary sentence, keyword, decision, task, highlight, quiz question, and flashcard strictly on the transcript below.
2. NEVER invent speaker names, dates, deadlines, or facts. If a deadline is not stated in the transcript, set deadline_text to "Deadline not specified.". If an assignee is not stated, set assignee to null.
3. Keep the analysis language natural to the transcript (or '{language}' if specified).

Transcript:
\"\"\"
{transcript_text[:28000]}
\"\"\"

Return valid JSON matching this schema:
{{
  "executive_summary": "concise summary",
  "detailed_summary": "structured multi-point summary",
  "study_notes": "academic study notes if lecture else null",
  "key_points": ["point 1"],
  "topics": [{{"title": "topic", "description": "desc", "timestamp_range": "00:00 - 01:00"}}],
  "keywords": [{{"word": "term", "frequency": 2, "importance": 0.85, "segment_ids": []}}],
  "highlights": [{{"text": "important sentence", "category": "exam_focus|definition|important_point|example", "priority": "high|medium|low", "timestamp": "00:00", "speaker": "Speaker 1"}}],
  "decisions": ["decision explicitly stated"],
  "tasks": [{{"title": "task", "assignee": null, "deadline_text": "Deadline not specified.", "priority": "high|medium|low", "source_timestamp": "00:00"}}],
  "questions_asked": [{{"question": "q", "answer": null, "timestamp": "00:00"}}],
  "key_concepts": [{{"term": "concept", "definition": "definition from transcript", "timestamp": "00:00"}}],
  "quiz": {{
    "title": "Quiz: {title}",
    "questions": [
      {{
        "id": "q_1",
        "question": "question",
        "type": "multiple_choice|true_false|short_answer",
        "options": ["opt1", "opt2", "opt3", "opt4"],
        "correct_option_index": 0,
        "correct_answer_text": "opt1",
        "explanation": "grounded explanation",
        "difficulty": "easy|medium|hard",
        "source_timestamp": "00:00"
      }}
    ]
  }},
  "flashcards": [{{"front": "term or question", "back": "answer from transcript", "source_timestamp": "00:00"}}],
  "mind_map": {{"id": "root", "label": "{title}", "description": "", "children": []}}
}}"""

    llm_data = _call_gemini_json(prompt) or _call_openai_json(prompt)
    fallback = _deterministic_analysis(title, segments, mode, course_code)

    if isinstance(llm_data, dict) and llm_data.get("executive_summary"):
        merged = {**fallback, **llm_data, "mode": mode}
        if not merged.get("keywords"):
            merged["keywords"] = fallback["keywords"]
        if not merged.get("summary"):
            merged["summary"] = merged["executive_summary"]
        return merged

    return fallback


def answer_grounded_question(
    question: str,
    title: str,
    segments: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Answer user question strictly from transcript segments; state explicitly if absent."""
    if not segments:
        return {
            "answer": f"No transcript content is available for \"{title}\". Not mentioned in this recording.",
            "evidence_found": False,
            "citations": [],
        }

    transcript_text = _segments_to_text(segments)
    prompt = f"""Answer the user question ONLY using facts explicitly stated in the transcript for "{title}".
If the answer is not stated in the transcript, set evidence_found to false and set answer to "Not mentioned in this recording.".
Question: {question}
Transcript:
\"\"\"
{transcript_text[:24000]}
\"\"\"
Return JSON:
{{"answer": "...", "evidence_found": true, "citations": [{{"speaker": "...", "timestamp": "00:00", "quote": "..."}}]}}"""

    llm_resp = _call_gemini_json(prompt) or _call_openai_json(prompt)
    if isinstance(llm_resp, dict) and isinstance(llm_resp.get("answer"), str):
        return {
            "answer": llm_resp["answer"],
            "evidence_found": bool(llm_resp.get("evidence_found", bool(llm_resp.get("citations")))),
            "citations": llm_resp.get("citations") or [],
        }

    # Deterministic keyword/token scoring fallback
    tokens = [
        t for t in re.findall(r"[\w\u0600-\u06FF]{3,}", question.lower())
        if t not in STOPWORDS
    ]
    scored = []
    for s in segments:
        txt = str(s.get("text") or "").strip()
        lower = txt.lower()
        score = sum(1 for t in tokens if t in lower)
        if score > 0:
            scored.append((score, s))

    scored.sort(key=lambda x: x[0], reverse=True)
    if not scored:
        return {
            "answer": f"Not mentioned in this recording. Based on the verified transcript for \"{title}\", there is no direct evidence to answer \"{question}\".",
            "evidence_found": False,
            "citations": [],
        }

    citations = []
    for _, s in scored[:3]:
        start = float(s.get("start_time", s.get("startTime", 0)) or 0)
        citations.append({
            "speaker": str(s.get("speaker") or "Speaker"),
            "timestamp": _format_ts(start),
            "quote": str(s.get("text") or "").strip(),
        })

    return {
        "answer": f"The transcript confirms that {citations[0]['speaker']} ({citations[0]['timestamp']}) noted: \"{citations[0]['quote']}\".",
        "evidence_found": True,
        "citations": citations,
    }
