# Meelni: Real‑Time AI Mock Interviews (MVP PRD + Tech Spec)

_Last updated: 2025-11-05_

## 0) TL;DR
Meelni is a real-time AI mock interview platform for technology roles (starting with Product Management). It runs **natural back‑and‑forth conversations** via **LiveKit** for low-latency audio and **Hedra Video** for photoreal, lip‑synced interviewer avatars—so practice feels like a real onsite/virtual loop. After each session, Meelni generates **scored feedback** on structure, clarity, insight, and delivery, with concrete next steps and a longitudinal progress dashboard.

---

## 1) Product Overview

### Problem
Candidates rely on static prep guides or expensive human coaches. There's no affordable way to repeatedly practice **under realistic pressure** and get **high-quality feedback** that improves week over week.

### Solution
A **real‑time** mock interview with an **AI interviewer** that:
- Speaks and listens naturally, supports interruptions ("barge‑in") and clarifying questions.
- Mirrors video presence using **Hedra** so the interviewer looks and feels human.
- Gives **immediate lightweight coaching** between sections and **post‑session rubric feedback**, plus a plan for what to practice next.

### MVP Focus
- **Role**: Product Manager (PM/APM) interviews.
- **Rounds**: Behavioral, Product Sense, Execution, Strategy.
- **Modes**: Voice+Video (primary), Text only (fallback).

---

## 2) Goals & Non‑Goals

### Goals (MVP)
- Natural, **low‑latency** back‑and‑forth interview via LiveKit (audio) + Hedra (video).
- Dynamic question flow; interviewer asks follow‑ups based on user answers.
- Rubric‑based evaluation with **quantitative scores** and **actionable feedback**.
- **Progress tracking** over time by round & competency.
- **Session transcripts** with time-coded highlights and suggested rewrites.

### Non‑Goals (MVP)
- Live human interview marketplace.
- Coding/whiteboard IDE and grading.
- Enterprise coach dashboards (post‑MVP).
- Custom company-specific loops (phase 2).

---

## 3) Target Users & JTBD
- **PM Candidates / APMs / Career switchers**
  - _When I'm preparing for a PM interview, I want to practice realistic sessions so I can improve my structure, confidence, and content._
- **Bootcamps / Universities (future)**
  - _When I'm running a cohort, I want scalable mock interviews so students can get repeatable practice and measurable growth._

---

## 4) User Stories (MVP)
1. As a PM candidate, I can choose **Behavioral / Product Sense / Execution / Strategy** to practice.
2. As a user, I can conduct a **live voice+video** mock interview where the AI interrupts, probes, and clarifies naturally.
3. As a user, I receive a **scorecard** with strengths, weaknesses, and top 3 improvements.
4. As a user, I see **trend charts** for my scores by competency over time.
5. As a user, I can **review the transcript** with timestamps, key moments, and suggested rewrites.
6. As a user, I can **bookmark** answers to re‑record and compare.

---

## 5) Experience Flow

### 5.1 Onboarding
- Pick role (PM), experience level (APM, PM, Sr PM), and target companies (optional persona tuning).
- Mic & camera check, consent to recording.

### 5.2 Session Setup
- Choose round type (Behavioral/Product Sense/Execution/Strategy).
- Choose mode: **Voice+Video (AI avatar)** or **Text**.
- Warmup tip + sample prompt ("Use STAR", "Clarify constraints", etc.).

### 5.3 Live Interview (Conversational)
- **Turn-taking**: VAD + partial ASR enable interruptions; interviewer adapts mid-sentence.
- **Hedra avatar** renders photoreal interviewer synced to TTS; **eye-gaze** and subtle gestures for presence.
- **Adaptive flow**: follow-ups based on missing STAR elements, metrics depth, or weak assumptions.
- **Section markers**: soft transitions ("Let's move to execution…") to segment scoring.

### 5.4 Wrap-up & Feedback
- Instant **lightweight summary** (wins + 1 quick fix).
- Full **scorecard** (Clarity, Structure, Insight, Communication, Leadership signals).
- **Suggested drills** + 3 example prompts to practice tomorrow.
- Transcript + highlights + suggested rewrite blocks.

### 5.5 Progress
- Dashboard: rolling average, by-round radar chart, common weaknesses.
- Streaks & reminders (optional).

---

## 6) Conversational Design & Latency Targets

### 6.1 Natural Conversation Requirements
- **Barge‑in**: user can interrupt; interviewer yields and adapts.
- **Backchannels**: short verbal cues ("Okay", "Go on") to feel human.
- **Clarification**: interviewer asks for missing concrete metrics, constraints, or trade-offs.
- **Persona**: configurable (e.g., "Ex‑FAANG PM", "Startup Founder", "Strict Bar Raiser").

### 6.2 Latency Budget (E2E, P95)
| Stage | Target |
|---|---|
| Capture + uplink (LiveKit) | 30–60 ms |
| ASR partials (streaming) | 200–400 ms |
| NLU/Policy + Dialogue | 150–300 ms |
| TTS start (first audio byte) | < 300 ms |
| Hedra video sync lead | 0–100 ms (viseme pre-roll) |
| **Total Per Turn (perceived)** | **< 1.2 s** |

Notes: Favor **incremental generation** (ASR partials → early intent → speak-while-think).

---

## 7) Scoring Rubric (PM MVP)

**Dimensions (1–5 each):**
- **Structure**: clear frameworks (STAR, metrics trees, PR/FAQ ordering).
- **Clarity & Brevity**: concise points, minimal ramble.
- **Insight/Reasoning**: trade-offs, metrics, edge cases, risks.
- **Communication**: tone, pace, confidence, active listening.
- **Leadership Signals**: ownership, bar-raising, collaboration.

**Output:**
- Overall score (avg + weighted if needed).
- 3 strengths, 3 targeted improvements.
- 2–3 example rewrites ("Try saying it like this…").

---

## 8) Metrics (MVP)
- **Session completion rate** ≥ 75%
- **Weekly return rate** ≥ 40%
- **Avg CSAT on feedback helpfulness** ≥ 4.5/5
- **Latency P95** ≤ 1.2s per turn
- **Rubric inter-rater agreement** (human vs. AI) ≥ 0.75 Cohen's κ on sample set

---

## 9) Risks & Mitigations
- **Latency spikes** → Regional LiveKit + GPU autoscaling; degrade to audio-only if needed.
- **Uncanny avatar** → Calibrate Hedra persona; use subtle motion; allow "minimal animations" mode.
- **Generic feedback** → Chain-of-thought suppressed but multi-pass rubric with **evidence quotes** from transcript.
- **Cost** → Cache evaluation; compress transcripts; on-device VAD; schedule batch evaluation post-session.

---

## 10) Architecture (MVP)

**Frontend**: Next.js (App Router) + React + Tailwind + shadcn/ui
**Realtime**: LiveKit WebRTC (Audio) + Hedra Video (Avatar render)
**ASR/TTS**: Realtime model (e.g., OpenAI Realtime / Whisper + low-latency TTS)
**Dialogue**: Interviewer Agent (RAG + tools)
**Eval**: Separate Scorer LLM (rubric prompt)
**DB**: Postgres (Supabase)
**Auth**: Clerk/NextAuth
**Hosting**: Vercel (web), LiveKit Cloud, Supabase

### 10.1 High-Level Flow
1. Browser connects to **LiveKit**; publishes mic; subscribes to **Interviewer** downlink.
2. Audio → **ASR (streaming)** → partial tokens → **Dialogue Agent**.
3. Agent plans response; streams **TTS audio**; simultaneously streams **viseme/phoneme** to **Hedra** for lip‑sync video.
4. Session segmentation events emitted for **scoring**.
5. On end: transcript → **Eval LLM** → scores + feedback → DB.
6. Dashboard pulls aggregates.

### 10.2 State Machine (Interview Agent)
```
IDLE -> INTRO -> QUESTION(n) -> FOLLOW_UP* -> COACHING? -> TRANSITION -> ... -> WRAP
```
- Interrupt handler at every state.
- Timebox guardrails (e.g., 90s answer nudges).
- Policy layer prevents sensitive/PII capture beyond consent.

---

## 11) Data Model (Draft)

```sql
-- Users
create table app_user (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  created_at timestamptz default now()
);

-- Interview sessions
create table interview_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_user(id),
  role text default 'pm',
  round_type text check (round_type in ('behavioral','product_sense','execution','strategy')),
  mode text check (mode in ('voice_video','text')),
  persona text, -- e.g., 'bar_raiser', 'founder'
  started_at timestamptz default now(),
  ended_at timestamptz
);

-- Turn-level transcript
create table transcript_turn (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references interview_session(id),
  speaker text check (speaker in ('user','interviewer')),
  started_at timestamptz,
  ended_at timestamptz,
  text text,
  audio_ms int,
  latency_ms int,
  section text -- 'behavioral','product_sense', etc.
);

-- Feedback / scoring
create table feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references interview_session(id) unique,
  structure_score int,
  clarity_score int,
  insight_score int,
  communication_score int,
  leadership_score int,
  overall_score numeric,
  strengths jsonb,
  improvements jsonb,
  drills jsonb,
  summary text,
  created_at timestamptz default now()
);
```

---

## 12) API Spec (MVP)

### Auth
- `POST /api/auth/callback` (Clerk/NextAuth)

### Session
- `POST /api/interview/start` → `{ sessionId, token(LiveKit), persona, roundType }`
- `POST /api/interview/end` → `{ sessionId }` (triggers evaluation job)

### Realtime Hooks (server → client events via LiveKit data channel)
- `sectionTransition`
- `nudgeTimebox`
- `coachTip`
- `wrapSignal`

### Evaluation
- `POST /api/eval/{{sessionId}}` → generates scores & feedback (idempotent)
- `GET /api/feedback/{{sessionId}}`

### Dashboard
- `GET /api/metrics/summary` → per-user aggregates
- `GET /api/history` → session list + key scores

---

## 13) Prompting & Policy (Sketch)

### 13.1 Interviewer Agent System Prompt
> You are a seasoned PM interviewer. Conduct a realistic, time‑boxed mock interview.
> Behaviors: ask one question at a time, use brief backchannels, interrupt if candidate rambles, probe for metrics, constraints, trade‑offs, and risks. Adapt questions to their previous answer. Avoid giving away solutions. Keep tone professional but supportive.

### 13.2 Scorer Prompt (Rubric)
Inputs: transcript, section markers, time budget.
Outputs: 5 dimension scores (1–5), 3 strengths, 3 improvements with "how to fix" and examples.

### 13.3 Safety & Privacy
- Explicit consent modal for audio/video recording.
- Redact PII from transcripts before storage (server-side filter).
- EU data residency toggle (post‑MVP).

---

## 14) Hedra Integration Notes
- Use **viseme stream** or phoneme-aligned cues for lip sync.
- Preload **persona templates** (lighting, camera angle, attire).
- Provide **Fallbacks**: audio-only if GPU saturation or network loss.
- Allow **user toggle**: "Subtle animation" vs "Expressive".

---

## 15) Test Plan

### Functional
- Barge-in handling, partial ASR, error recovery.
- Section transitions + timers.
- Eval consistency on a fixed gold transcript set.

### Non‑Functional
- Latency P95 under varied network (Wi‑Fi, LTE).
- Load test: concurrent sessions with avatar render.
- Cost profiling per 20‑min session.

### Acceptance
- 20 pilot users rate feedback helpfulness ≥ 4.5/5.
- Latency & stability within targets.
- Rubric agreement with human coach ≥ 0.75 κ on 30 samples.

---

## 16) Rollout
- **Alpha**: Invite-only (20–50 users).
- **Beta**: Payment wall (monthly), text-only fallback public.
- **v1**: Add company-specific templates, coach marketplace (optional).

---

## 17) Open Questions
- Do we weight **Insight** more heavily than **Communication** for PM v1?
- Add **Hypothesis‑driven drill mode** (micro‑exercises between sessions)?
- Store raw audio for model improvement or discard after eval (privacy)?
- Which Hedra persona defaults resonate most with users?

---

## 18) Roadmap (90 Days)
- **Weeks 1–2**: Architecture, UI wireframes, DB, auth.
- **Weeks 3–5**: LiveKit audio, streaming ASR/TTS, barge‑in.
- **Weeks 6–7**: Hedra avatar integration, persona presets.
- **Weeks 8–9**: Interview agent policies + sectioning.
- **Weeks 10–11**: Evaluation engine + dashboard.
- **Week 12**: Alpha pilot + tuning.

---

## 19) Appendix A — Sample Question Sets (PM)
- **Behavioral**: conflict resolution, failure postmortem, cross‑functional alignment.
- **Product Sense**: design X for Y users; prioritize v1; success metrics.
- **Execution**: metrics drops; experiment design; trade‑offs.
- **Strategy**: market entry; pricing; platform bets.

---

## 20) Appendix B — Sample JSON for Feedback
```json
{
  "sessionId": "uuid",
  "scores": {
    "structure": 4,
    "clarity": 3,
    "insight": 4,
    "communication": 4,
    "leadership": 3,
    "overall": 3.6
  },
  "strengths": ["Clear problem framing", "Good metric awareness", "Calm delivery"],
  "improvements": [
    "Tighten STAR: add concrete numbers in Results",
    "State 2–3 trade‑offs before choosing",
    "Proactively call out risks + mitigation"
  ],
  "drills": [
    "60‑sec STAR answers on 3 conflicts",
    "Metrics tree for retention drop",
    "Design critique: 2 alternatives + trade‑offs"
  ]
}
```
