# Feedback & Insights Implementation Tickets

**Project**: Enhanced Feedback Generation Flow & Insights Dashboard
**Epic**: Improve post-interview experience and provide actionable insights
**Sprint Timeline**: 8 weeks (4 phases, 2 weeks each)

---

## **Phase 1: Foundation (Weeks 1-2)**

### Ticket P1-001: Database Schema Updates for Session Validation

**Priority**: P0 (Blocker)
**Effort**: 3 story points
**Dependencies**: None
**Agent Type**: Developer

**Description**:
Add new columns to `interview_session` and `feedback` tables to support session validation, status tracking, and rubric versioning.

**Acceptance Criteria**:
- [ ] Add `status` enum column to `interview_session` table (`in_progress`, `completed`, `abandoned`, `too_short`, `error`)
- [ ] Add `total_turns`, `total_words`, `duration_seconds` columns to `interview_session`
- [ ] Add `status` enum column to `feedback` table (`pending`, `processing`, `completed`, `failed`, `skipped`)
- [ ] Add `status_reason`, `rubric_version`, `processing_started_at`, `processing_duration_ms` columns to `feedback`
- [ ] Create migration files with Drizzle ORM
- [ ] Add indexes: `idx_session_user_status`, `idx_session_ended_at`, `idx_feedback_session_status`
- [ ] Update RLS policies to allow status reads for polling
- [ ] Deploy migration to dev environment and verify

**Technical Notes**:
```typescript
// lib/db/schema.ts
export const interviewSession = pgTable("interview_session", {
  // Existing columns...
  status: text("status", {
    enum: ["in_progress", "completed", "abandoned", "too_short", "error"]
  }).default("in_progress").notNull(),
  total_turns: integer("total_turns").default(0),
  total_words: integer("total_words").default(0),
  duration_seconds: integer("duration_seconds"),
});

export const feedback = pgTable("feedback", {
  // Existing columns...
  status: text("status", {
    enum: ["pending", "processing", "completed", "failed", "skipped"]
  }).default("pending").notNull(),
  status_reason: text("status_reason"),
  rubric_version: text("rubric_version").default("1.0.0").notNull(),
  processing_started_at: timestamp("processing_started_at"),
  processing_duration_ms: integer("processing_duration_ms"),
});
```

**Testing**:
- Unit tests for schema validation
- Verify migration runs without errors
- Test RLS policies with multiple user accounts

**Files to Modify**:
- `lib/db/schema.ts`
- `drizzle/migrations/*.sql` (new migration)

---

### Ticket P1-002: Session Validation Utility Functions

**Priority**: P0 (Blocker)
**Effort**: 5 story points
**Dependencies**: P1-001
**Agent Type**: Developer

**Description**:
Create utility functions to validate session completeness and determine feedback eligibility.

**Acceptance Criteria**:
- [ ] Create `lib/evaluation/session-validator.ts` module
- [ ] Implement `validateSessionCompleteness(sessionId)` function
- [ ] Implement `calculateSessionStats(sessionId)` function (turns, words, duration)
- [ ] Return validation result with status: `valid`, `partial`, `insufficient`, `abandoned`
- [ ] Include detailed reasons for rejection (e.g., "too_short: 2 turns < 5 minimum")
- [ ] Write unit tests with 8+ edge cases (short sessions, empty sessions, partial sessions)
- [ ] Add JSDoc documentation with examples

**Validation Tiers**:
```typescript
export enum SessionTier {
  FULL = "full",          // ≥20 turns, ≥20 min, ≥5 substantive responses
  PARTIAL = "partial",    // ≥5 turns, ≥5 min, ≥3 substantive responses
  INSUFFICIENT = "insufficient", // < 5 turns or < 5 min
  ABANDONED = "abandoned" // 0 turns
}

export interface SessionValidation {
  tier: SessionTier;
  isValid: boolean;
  stats: {
    totalTurns: number;
    userTurns: number;
    totalWords: number;
    durationSeconds: number;
  };
  reasons: string[];
  recommendations: string[];
}
```

**Edge Cases to Test**:
1. Session with 0 turns (abandoned)
2. Session with 3 turns, 2 minutes (too short)
3. Session with 8 turns, 12 minutes (partial)
4. Session with 25 turns, 30 minutes (full)
5. Session with 15 turns but only 2 substantive responses (insufficient)
6. Session with network disconnect mid-interview
7. Session with only agent turns (user never spoke)
8. Session with very long duration but few turns (user AFK)

**Testing**:
- Unit tests for each tier
- Integration test with real session data
- Performance test (validation should complete in <100ms)

**Files to Create**:
- `lib/evaluation/session-validator.ts`
- `lib/evaluation/__tests__/session-validator.test.ts`

---

### Ticket P1-003: Inngest Setup and Feedback Generation Worker

**Priority**: P0 (Blocker)
**Effort**: 8 story points
**Dependencies**: P1-001, P1-002
**Agent Type**: Developer

**Description**:
Set up Inngest for background job processing and create the feedback generation worker.

**Acceptance Criteria**:
- [ ] Install and configure Inngest SDK (`npm install inngest`)
- [ ] Create Inngest client configuration in `lib/inngest/client.ts`
- [ ] Create Next.js API route for Inngest webhook: `app/api/inngest/route.ts`
- [ ] Implement `feedback.generate` Inngest function
- [ ] Implement `insights.update` Inngest function (trigger after feedback completes)
- [ ] Add retry logic (2 retries with exponential backoff)
- [ ] Add timeout handling (120s max for GPT-4 call)
- [ ] Add error logging and monitoring
- [ ] Test with dev Inngest environment
- [ ] Deploy to staging and verify job execution

**Inngest Function Structure**:
```typescript
// lib/inngest/functions/generate-feedback.ts
import { inngest } from "@/lib/inngest/client";

export const generateFeedback = inngest.createFunction(
  {
    id: "feedback-generate",
    retries: 2,
    throttle: { limit: 10, period: "1m" },
  },
  { event: "feedback/generate.requested" },
  async ({ event, step }) => {
    const { sessionId } = event.data;

    // Step 1: Validate session
    const validation = await step.run("validate-session", async () => {
      return validateSessionCompleteness(sessionId);
    });

    if (!validation.isValid) {
      await step.run("mark-skipped", async () => {
        await db.update(feedback)
          .set({ status: "skipped", status_reason: validation.reasons.join(", ") })
          .where(eq(feedback.session_id, sessionId));
      });
      return { status: "skipped", reason: validation.reasons };
    }

    // Step 2: Fetch transcript
    const transcript = await step.run("fetch-transcript", async () => {
      return fetchSessionTranscript(sessionId);
    });

    // Step 3: Call GPT-4 for evaluation
    const evaluation = await step.run("evaluate-session", async () => {
      return evaluateWithGPT4(transcript, validation.tier);
    });

    // Step 4: Save feedback
    await step.run("save-feedback", async () => {
      await db.update(feedback)
        .set({
          status: "completed",
          overall_score: evaluation.overall_score,
          structure_score: evaluation.structure_score,
          clarity_score: evaluation.clarity_score,
          insight_score: evaluation.insight_score,
          communication_score: evaluation.communication_score,
          leadership_score: evaluation.leadership_score,
          strengths: evaluation.strengths,
          improvements: evaluation.improvements,
          drills: evaluation.drills,
          summary: evaluation.summary,
          rubric_version: "1.0.0",
        })
        .where(eq(feedback.session_id, sessionId));
    });

    // Step 5: Trigger insights update
    await step.sendEvent("trigger-insights-update", {
      name: "insights/update.requested",
      data: { userId: event.data.userId, sessionId },
    });

    return { status: "completed", feedbackId: evaluation.id };
  }
);
```

**Environment Variables**:
```bash
INNGEST_EVENT_KEY=evt_...
INNGEST_SIGNING_KEY=signkey_...
```

**Testing**:
- Unit tests for each step function
- Integration test with mock GPT-4 responses
- End-to-end test with real session
- Monitor Inngest dashboard for job status

**Files to Create**:
- `lib/inngest/client.ts`
- `lib/inngest/functions/generate-feedback.ts`
- `lib/inngest/functions/update-insights.ts`
- `app/api/inngest/route.ts`

---

### Ticket P1-004: Session End API Endpoint

**Priority**: P0 (Blocker)
**Effort**: 5 story points
**Dependencies**: P1-002, P1-003
**Agent Type**: Developer

**Description**:
Create API endpoint to handle session end, validate session, and trigger feedback generation.

**Acceptance Criteria**:
- [ ] Create `app/api/session/end/route.ts`
- [ ] Validate user authentication and session ownership
- [ ] Calculate session stats (turns, words, duration)
- [ ] Update `interview_session` table with final stats and status
- [ ] Validate session completeness
- [ ] Trigger Inngest job if session is valid
- [ ] Return appropriate status and error messages
- [ ] Implement idempotency (handle duplicate requests)
- [ ] Add rate limiting (10 requests/min per user)
- [ ] Write API tests with 5+ scenarios

**API Specification**:
```typescript
// POST /api/session/end
// Request
{
  sessionId: string;
}

// Response (200 OK)
{
  status: "queued" | "skipped";
  reason?: string; // if skipped
  estimatedTime?: number; // seconds
  feedbackId?: string;
}

// Error Responses
// 400: Invalid sessionId or already ended
// 401: Unauthorized
// 422: Validation failed
// 500: Internal error
```

**Implementation**:
```typescript
// app/api/session/end/route.ts
import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { validateSessionCompleteness } from "@/lib/evaluation/session-validator";

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();

  // 1. Authenticate user
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Verify session ownership
  const session = await db.query.interviewSession.findFirst({
    where: and(
      eq(interviewSession.id, sessionId),
      eq(interviewSession.user_id, user.id)
    ),
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.ended_at) {
    // Already ended - return existing feedback status
    const existingFeedback = await db.query.feedback.findFirst({
      where: eq(feedback.session_id, sessionId),
    });
    return NextResponse.json({
      status: existingFeedback?.status === "completed" ? "completed" : "queued",
      feedbackId: existingFeedback?.id,
    });
  }

  // 3. Calculate session stats
  const stats = await calculateSessionStats(sessionId);

  // 4. Update session
  await db.update(interviewSession)
    .set({
      ended_at: new Date(),
      total_turns: stats.totalTurns,
      total_words: stats.totalWords,
      duration_seconds: stats.durationSeconds,
      status: "completed",
    })
    .where(eq(interviewSession.id, sessionId));

  // 5. Validate session
  const validation = await validateSessionCompleteness(sessionId);

  if (!validation.isValid) {
    // Mark as skipped
    await db.insert(feedback).values({
      session_id: sessionId,
      status: "skipped",
      status_reason: validation.reasons.join(", "),
    });

    return NextResponse.json({
      status: "skipped",
      reason: validation.reasons[0],
    }, { status: 422 });
  }

  // 6. Create feedback record
  const [feedbackRecord] = await db.insert(feedback).values({
    session_id: sessionId,
    status: "pending",
  }).returning();

  // 7. Trigger Inngest job
  await inngest.send({
    name: "feedback/generate.requested",
    data: { sessionId, userId: user.id, tier: validation.tier },
  });

  return NextResponse.json({
    status: "queued",
    estimatedTime: 45,
    feedbackId: feedbackRecord.id,
  });
}
```

**Testing**:
- Test with valid session (should queue job)
- Test with too-short session (should skip)
- Test with abandoned session (should skip)
- Test with already-ended session (should return existing status)
- Test with concurrent requests (should be idempotent)
- Test rate limiting

**Files to Create**:
- `app/api/session/end/route.ts`
- `app/api/session/end/__tests__/route.test.ts`

---

### Ticket P1-005: Feedback Polling API Endpoint

**Priority**: P0 (Blocker)
**Effort**: 3 story points
**Dependencies**: P1-001
**Agent Type**: Developer

**Description**:
Create API endpoint for clients to poll feedback generation status.

**Acceptance Criteria**:
- [ ] Create `app/api/feedback/[sessionId]/route.ts`
- [ ] Fetch feedback record by session ID
- [ ] Verify user owns the session (RLS)
- [ ] Return status and feedback data (if completed)
- [ ] Return estimated time remaining (if processing)
- [ ] Handle edge cases (not found, unauthorized, error states)
- [ ] Add caching headers (no-cache for pending, cache for completed)
- [ ] Write API tests

**API Specification**:
```typescript
// GET /api/feedback/[sessionId]
// Response (200 OK)
{
  status: "pending" | "processing" | "completed" | "failed" | "skipped";
  estimatedTimeRemaining?: number; // seconds
  feedback?: {
    overall_score: number;
    structure_score: number;
    clarity_score: number;
    insight_score: number;
    communication_score: number;
    leadership_score: number;
    strengths: string[];
    improvements: string[];
    drills: string[];
    summary: string;
    rubric_version: string;
  };
  error?: string;
  skipReason?: string;
}
```

**Implementation**:
```typescript
// app/api/feedback/[sessionId]/route.ts
export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const feedbackRecord = await db.query.feedback.findFirst({
    where: eq(feedback.session_id, params.sessionId),
    with: { session: true },
  });

  if (!feedbackRecord || feedbackRecord.session.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Calculate estimated time remaining
  let estimatedTimeRemaining;
  if (feedbackRecord.status === "processing" && feedbackRecord.processing_started_at) {
    const elapsed = Date.now() - new Date(feedbackRecord.processing_started_at).getTime();
    estimatedTimeRemaining = Math.max(0, 45 - Math.floor(elapsed / 1000));
  }

  const response = {
    status: feedbackRecord.status,
    estimatedTimeRemaining,
    ...(feedbackRecord.status === "completed" && {
      feedback: {
        overall_score: feedbackRecord.overall_score,
        structure_score: feedbackRecord.structure_score,
        clarity_score: feedbackRecord.clarity_score,
        insight_score: feedbackRecord.insight_score,
        communication_score: feedbackRecord.communication_score,
        leadership_score: feedbackRecord.leadership_score,
        strengths: feedbackRecord.strengths,
        improvements: feedbackRecord.improvements,
        drills: feedbackRecord.drills,
        summary: feedbackRecord.summary,
        rubric_version: feedbackRecord.rubric_version,
      },
    }),
    ...(feedbackRecord.status === "skipped" && {
      skipReason: feedbackRecord.status_reason,
    }),
    ...(feedbackRecord.status === "failed" && {
      error: feedbackRecord.status_reason,
    }),
  };

  // Cache headers
  const headers = new Headers();
  if (feedbackRecord.status === "completed") {
    headers.set("Cache-Control", "public, max-age=3600");
  } else {
    headers.set("Cache-Control", "no-cache");
  }

  return NextResponse.json(response, { headers });
}
```

**Testing**:
- Test with pending feedback (should return pending)
- Test with completed feedback (should return full data)
- Test with skipped feedback (should return skip reason)
- Test with failed feedback (should return error)
- Test unauthorized access

**Files to Create**:
- `app/api/feedback/[sessionId]/route.ts`

---

### Ticket P1-006: Enhanced Feedback Loading UI Component

**Priority**: P1
**Effort**: 5 story points
**Dependencies**: P1-005
**Agent Type**: Developer (UI focus)

**Description**:
Create enhanced loading screen for feedback generation with progress indicators, animated orb, and encouraging messages.

**Acceptance Criteria**:
- [ ] Create `app/feedback/[sessionId]/components/feedback-loading.tsx`
- [ ] Implement animated orb visualizer (reuse from interview page)
- [ ] Add progress bar with smooth animations
- [ ] Display analysis stages with checkmarks
- [ ] Rotate through encouraging messages
- [ ] Show estimated time remaining (countdown)
- [ ] Poll `/api/feedback/[sessionId]` every 3s
- [ ] Handle timeout (>90s) with retry option
- [ ] Transition to success/error states
- [ ] Add Framer Motion animations

**Component Structure**:
```tsx
// app/feedback/[sessionId]/components/feedback-loading.tsx
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Orb } from "@/components/ui/orb";

export function FeedbackLoading({ sessionId }: { sessionId: string }) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);
  const [message, setMessage] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(45);

  const stages = [
    { label: "Transcript processed", complete: false },
    { label: "Evaluating structure", complete: false },
    { label: "Scoring competencies", complete: false },
    { label: "Generating recommendations", complete: false },
  ];

  const messages = [
    "Your interview coach is reviewing your responses...",
    "Analyzing framework adherence and structure...",
    "Evaluating clarity and depth of insights...",
    "Identifying your strongest moments...",
    "Finding opportunities for growth...",
    "Almost there! Finalizing your personalized feedback...",
  ];

  useEffect(() => {
    // Poll for status
    const interval = setInterval(async () => {
      const res = await fetch(`/api/feedback/${sessionId}`);
      const data = await res.json();

      if (data.status === "completed") {
        window.location.href = `/feedback/${sessionId}`;
      } else if (data.status === "failed") {
        // Show error state
      }

      if (data.estimatedTimeRemaining !== undefined) {
        setEstimatedTime(data.estimatedTimeRemaining);
      }

      // Update progress (simulated based on elapsed time)
      setProgress((prev) => Math.min(prev + 5, 95));
    }, 3000);

    return () => clearInterval(interval);
  }, [sessionId]);

  // Rotate messages every 5s
  useEffect(() => {
    const interval = setInterval(() => {
      setMessage((prev) => (prev + 1) % messages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full space-y-8"
      >
        {/* Animated Orb */}
        <div className="flex justify-center">
          <Orb size={200} state="speaking" />
        </div>

        {/* Status Message */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-display">Analyzing Your Performance</h2>
          <motion.p
            key={message}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-muted-foreground"
          >
            {messages[message]}
          </motion.p>
        </div>

        {/* Progress Stages */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          {stages.map((stage, index) => (
            <div key={index} className="flex items-center gap-3">
              {index < Math.floor(progress / 25) ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                >
                  <span className="text-primary-foreground text-xs">✓</span>
                </motion.div>
              ) : index === Math.floor(progress / 25) ? (
                <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-border" />
              )}
              <span className="text-sm text-muted-foreground">{stage.label}</span>
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <p className="text-sm text-center text-muted-foreground">
            Est. time remaining: ~{estimatedTime} seconds
          </p>
        </div>
      </motion.div>
    </div>
  );
}
```

**Testing**:
- Test loading state transitions
- Test with slow API responses (>60s)
- Test with failed API calls
- Verify animations are smooth (60fps)
- Test polling behavior (should stop when completed)

**Files to Create**:
- `app/feedback/[sessionId]/components/feedback-loading.tsx`

---

### Ticket P1-007: Edge Case UI Components (Insufficient/Partial/Error)

**Priority**: P1
**Effort**: 3 story points
**Dependencies**: P1-005
**Agent Type**: Developer (UI focus)

**Description**:
Create UI components for edge cases: insufficient data, partial feedback, and errors.

**Acceptance Criteria**:
- [ ] Create `app/feedback/[sessionId]/components/feedback-insufficient.tsx`
- [ ] Create `app/feedback/[sessionId]/components/feedback-partial.tsx`
- [ ] Create `app/feedback/[sessionId]/components/feedback-error.tsx`
- [ ] Display session stats (actual vs required)
- [ ] Show clear error messages
- [ ] Provide actionable next steps (CTAs)
- [ ] Add retry functionality for errors
- [ ] Match tactical design system

**Insufficient Data Component**:
```tsx
// app/feedback/[sessionId]/components/feedback-insufficient.tsx
export function FeedbackInsufficient({ stats }: { stats: SessionStats }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md space-y-6">
        <div className="text-center">
          <div className="text-6xl mb-4">🕒</div>
          <h1 className="text-2xl font-display mb-2">Session Too Short</h1>
          <p className="text-muted-foreground">
            We need at least 3 minutes and a few exchanges to provide
            meaningful feedback.
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-sm">Session Duration</span>
            <span className="text-sm font-mono">
              {stats.durationSeconds}s / 180s required
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm">User Responses</span>
            <span className="text-sm font-mono">
              {stats.userTurns} / 3 required
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <a href={`/interview/${sessionId}/transcript`}>View Transcript</a>
          </Button>
          <Button asChild>
            <a href="/setup">Start New Interview</a>
          </Button>
        </div>

        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <p className="text-sm">
            💡 <strong>Tip:</strong> Aim for 10+ minutes to get comprehensive
            feedback on your interview performance.
          </p>
        </div>
      </div>
    </div>
  );
}
```

**Testing**:
- Test with different session stats
- Test CTA buttons navigate correctly
- Verify responsive design

**Files to Create**:
- `app/feedback/[sessionId]/components/feedback-insufficient.tsx`
- `app/feedback/[sessionId]/components/feedback-partial.tsx`
- `app/feedback/[sessionId]/components/feedback-error.tsx`

---

## **Phase 2: Insights MVP (Weeks 3-4)**

### Ticket P2-001: User Insights Table Schema

**Priority**: P1
**Effort**: 5 story points
**Dependencies**: P1-001
**Agent Type**: Developer

**Description**:
Create `user_insights` table for pre-aggregated analytics with incremental update support.

**Acceptance Criteria**:
- [ ] Create `user_insights` table with JSONB columns for flexibility
- [ ] Add columns: `overall_stats`, `by_interview_type`, `by_difficulty`, `trends`, `competency_breakdown`
- [ ] Add `version` column for optimistic locking
- [ ] Create indexes for user_id lookups
- [ ] Add RLS policies (users can only read own insights)
- [ ] Create migration and deploy to dev
- [ ] Write seed function to backfill existing users

**Schema**:
```typescript
// lib/db/schema.ts
export const userInsights = pgTable("user_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").references(() => appUser.id, { onDelete: "cascade" }).notNull(),

  overall_stats: jsonb("overall_stats").notNull().$type<{
    total_sessions: number;
    completed_sessions: number;
    total_minutes: number;
    avg_score: number;
    median_score: number;
    percentile_25: number;
    percentile_75: number;
    percentile_90: number;
  }>(),

  by_interview_type: jsonb("by_interview_type").notNull().$type<{
    product_sense: { count: number; avg_score: number; last_5_avg: number };
    analytical: { count: number; avg_score: number; last_5_avg: number };
    leadership: { count: number; avg_score: number; last_5_avg: number };
    strategy: { count: number; avg_score: number; last_5_avg: number };
  }>(),

  by_difficulty: jsonb("by_difficulty").notNull().$type<{
    junior: { count: number; avg_score: number };
    intermediate: { count: number; avg_score: number };
    senior: { count: number; avg_score: number };
  }>(),

  trends: jsonb("trends").notNull().$type<{
    last_5_sessions_avg: number;
    all_time_avg: number;
    improvement_trend: "improving" | "stable" | "declining";
    velocity: number;
  }>(),

  competency_breakdown: jsonb("competency_breakdown").notNull().$type<{
    structure: number;
    clarity: number;
    insight: number;
    communication: number;
    leadership: number;
  }>(),

  last_session_id: uuid("last_session_id").references(() => interviewSession.id),
  last_updated_at: timestamp("last_updated_at").defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("user_insights_user_id_idx").on(table.user_id),
}));
```

**RLS Policies**:
```sql
CREATE POLICY "Users can view own insights"
  ON user_insights FOR SELECT
  USING (auth.uid() = user_id);
```

**Testing**:
- Test JSONB queries (e.g., `overall_stats->>'avg_score'`)
- Test RLS policies with multiple users
- Verify indexes improve query performance

**Files to Modify**:
- `lib/db/schema.ts`
- `drizzle/migrations/*.sql`

---

### Ticket P2-002: Insights Aggregation Engine

**Priority**: P1
**Effort**: 8 story points
**Dependencies**: P2-001
**Agent Type**: Developer

**Description**:
Create insights aggregation engine to calculate user analytics from session/feedback data.

**Acceptance Criteria**:
- [ ] Create `lib/evaluation/insights-engine.ts`
- [ ] Implement `calculateUserInsights(userId)` function
- [ ] Aggregate stats: total sessions, avg score, percentiles, trends
- [ ] Group by interview type and difficulty
- [ ] Calculate competency averages
- [ ] Detect improvement trends (improving/stable/declining)
- [ ] Calculate velocity (points per session improvement)
- [ ] Write comprehensive unit tests

**Implementation**:
```typescript
// lib/evaluation/insights-engine.ts
export async function calculateUserInsights(userId: string): Promise<UserInsightsData> {
  // Fetch all user sessions with feedback
  const sessions = await db.query.interviewSession.findMany({
    where: eq(interviewSession.user_id, userId),
    with: { feedback: true },
    orderBy: [desc(interviewSession.started_at)],
  });

  const completedSessions = sessions.filter(
    (s) => s.feedback && s.feedback.status === "completed"
  );

  if (completedSessions.length === 0) {
    return getEmptyInsights(userId);
  }

  // Calculate overall stats
  const scores = completedSessions.map((s) => s.feedback!.overall_score);
  const overallStats = {
    total_sessions: sessions.length,
    completed_sessions: completedSessions.length,
    total_minutes: Math.round(
      sessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / 60
    ),
    avg_score: average(scores),
    median_score: median(scores),
    percentile_25: percentile(scores, 25),
    percentile_75: percentile(scores, 75),
    percentile_90: percentile(scores, 90),
  };

  // Group by interview type
  const byType = groupBy(completedSessions, (s) => s.round_type);
  const by_interview_type = {
    product_sense: calculateTypeStats(byType["product_sense"]),
    analytical: calculateTypeStats(byType["analytical"]),
    leadership: calculateTypeStats(byType["leadership"]),
    strategy: calculateTypeStats(byType["strategy"]),
  };

  // Group by difficulty
  const byDifficulty = groupBy(completedSessions, (s) => s.config?.difficulty || "intermediate");
  const by_difficulty = {
    junior: calculateDifficultyStats(byDifficulty["junior"]),
    intermediate: calculateDifficultyStats(byDifficulty["intermediate"]),
    senior: calculateDifficultyStats(byDifficulty["senior"]),
  };

  // Calculate trends
  const last5Scores = scores.slice(0, 5);
  const last5Avg = average(last5Scores);
  const allTimeAvg = average(scores);
  const velocity = calculateVelocity(scores);

  const trends = {
    last_5_sessions_avg: last5Avg,
    all_time_avg: allTimeAvg,
    improvement_trend: detectTrend(last5Avg, allTimeAvg),
    velocity,
  };

  // Competency breakdown
  const competency_breakdown = {
    structure: average(completedSessions.map((s) => s.feedback!.structure_score)),
    clarity: average(completedSessions.map((s) => s.feedback!.clarity_score)),
    insight: average(completedSessions.map((s) => s.feedback!.insight_score)),
    communication: average(completedSessions.map((s) => s.feedback!.communication_score)),
    leadership: average(completedSessions.map((s) => s.feedback!.leadership_score)),
  };

  return {
    overall_stats: overallStats,
    by_interview_type,
    by_difficulty,
    trends,
    competency_breakdown,
  };
}

function detectTrend(recent: number, allTime: number): "improving" | "stable" | "declining" {
  const delta = recent - allTime;
  if (delta > 0.5) return "improving";
  if (delta < -0.5) return "declining";
  return "stable";
}

function calculateVelocity(scores: number[]): number {
  if (scores.length < 2) return 0;
  // Simple linear regression slope
  const n = scores.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const y = scores.reverse(); // oldest to newest

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return slope;
}
```

**Testing**:
- Test with 0 sessions (should return empty state)
- Test with 1 session (minimal data)
- Test with 10+ sessions (full analytics)
- Test trend detection (improving, stable, declining)
- Test velocity calculation

**Files to Create**:
- `lib/evaluation/insights-engine.ts`
- `lib/evaluation/__tests__/insights-engine.test.ts`

---

### Ticket P2-003: Inngest Insights Update Worker

**Priority**: P1
**Effort**: 5 story points
**Dependencies**: P2-001, P2-002
**Agent Type**: Developer

**Description**:
Create Inngest worker to update user insights after feedback generation.

**Acceptance Criteria**:
- [ ] Create `lib/inngest/functions/update-insights.ts`
- [ ] Trigger after feedback completion
- [ ] Call `calculateUserInsights(userId)`
- [ ] Upsert into `user_insights` table
- [ ] Handle optimistic locking (version conflicts)
- [ ] Add retry logic
- [ ] Test with concurrent updates

**Implementation**:
```typescript
// lib/inngest/functions/update-insights.ts
export const updateInsights = inngest.createFunction(
  {
    id: "insights-update",
    retries: 2,
    concurrency: { limit: 5 },
  },
  { event: "insights/update.requested" },
  async ({ event, step }) => {
    const { userId, sessionId } = event.data;

    const insights = await step.run("calculate-insights", async () => {
      return calculateUserInsights(userId);
    });

    await step.run("upsert-insights", async () => {
      // Upsert with optimistic locking
      const existing = await db.query.userInsights.findFirst({
        where: eq(userInsights.user_id, userId),
      });

      if (existing) {
        await db.update(userInsights)
          .set({
            ...insights,
            last_session_id: sessionId,
            last_updated_at: new Date(),
            version: existing.version + 1,
          })
          .where(and(
            eq(userInsights.user_id, userId),
            eq(userInsights.version, existing.version) // optimistic lock
          ));
      } else {
        await db.insert(userInsights).values({
          user_id: userId,
          ...insights,
          last_session_id: sessionId,
        });
      }
    });

    return { status: "updated", userId };
  }
);
```

**Testing**:
- Test with new user (insert)
- Test with existing user (update)
- Test concurrent updates (version conflicts)
- Verify retry logic

**Files to Create**:
- `lib/inngest/functions/update-insights.ts`

---

### Ticket P2-004: Insights API Endpoint

**Priority**: P1
**Effort**: 3 story points
**Dependencies**: P2-001
**Agent Type**: Developer

**Description**:
Create API endpoint to fetch pre-aggregated user insights.

**Acceptance Criteria**:
- [ ] Create `app/api/insights/route.ts`
- [ ] Fetch `user_insights` record for authenticated user
- [ ] Return empty state if no insights yet
- [ ] Add cache headers (5 min cache)
- [ ] Handle date range filtering (future enhancement)
- [ ] Write API tests

**API Specification**:
```typescript
// GET /api/insights?userId={id}
// Response (200 OK)
{
  overall: {
    total_sessions: number;
    completed_sessions: number;
    total_minutes: number;
    avg_score: number;
    median_score: number;
    percentiles: { p25: number; p50: number; p75: number; p90: number };
  };
  by_type: {
    product_sense: { count: number; avg_score: number; recent_avg: number };
    analytical: { count: number; avg_score: number; recent_avg: number };
    leadership: { count: number; avg_score: number; recent_avg: number };
    strategy: { count: number; avg_score: number; recent_avg: number };
  };
  trends: {
    improvement_trend: "improving" | "stable" | "declining";
    velocity: number;
    last_5_avg: number;
    all_time_avg: number;
  };
  competencies: {
    structure: number;
    clarity: number;
    insight: number;
    communication: number;
    leadership: number;
  };
  last_updated: string;
}
```

**Implementation**:
```typescript
// app/api/insights/route.ts
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const insights = await db.query.userInsights.findFirst({
    where: eq(userInsights.user_id, user.id),
  });

  if (!insights) {
    return NextResponse.json({
      overall: { total_sessions: 0, completed_sessions: 0, total_minutes: 0 },
      by_type: {},
      trends: { improvement_trend: "stable", velocity: 0 },
      competencies: {},
      last_updated: null,
    });
  }

  const response = {
    overall: insights.overall_stats,
    by_type: insights.by_interview_type,
    by_difficulty: insights.by_difficulty,
    trends: insights.trends,
    competencies: insights.competency_breakdown,
    last_updated: insights.last_updated_at.toISOString(),
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, max-age=300", // 5 min cache
    },
  });
}
```

**Testing**:
- Test with user who has insights
- Test with new user (no insights)
- Test caching behavior

**Files to Create**:
- `app/api/insights/route.ts`

---

### Ticket P2-005: Analytics Dashboard Section - Overview Tab

**Priority**: P1
**Effort**: 8 story points
**Dependencies**: P2-004
**Agent Type**: Developer (UI focus)

**Description**:
Replace placeholder Analytics section with full Insights dashboard starting with Overview tab.

**Acceptance Criteria**:
- [ ] Update `app/dashboard/sections/analytics.tsx` (rename to `insights.tsx`)
- [ ] Fetch insights from `/api/insights`
- [ ] Implement progress trend line chart (Recharts)
- [ ] Add competency breakdown (radar or bars)
- [ ] Display key stats cards (total sessions, avg score, streak)
- [ ] Show empty state for users with <3 sessions
- [ ] Add loading skeleton states
- [ ] Make responsive (mobile-first)

**Component Structure**:
```tsx
// app/dashboard/sections/insights.tsx
"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function InsightsSection() {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/insights")
      .then((res) => res.json())
      .then(setInsights)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <InsightsSkeleton />;

  if (!insights || insights.overall.total_sessions < 3) {
    return <InsightsEmptyState sessionCount={insights?.overall.total_sessions || 0} />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Total Sessions"
          value={insights.overall.total_sessions}
          change={insights.trends.improvement_trend}
        />
        <StatCard
          label="Average Score"
          value={insights.overall.avg_score.toFixed(1)}
          suffix="/10"
        />
        <StatCard
          label="Total Practice Time"
          value={insights.overall.total_minutes}
          suffix=" min"
        />
      </div>

      {/* Progress Trend Chart */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-display mb-4">Performance Trends</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={insights.chartData}>
            <XAxis dataKey="date" />
            <YAxis domain={[0, 10]} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="score"
              stroke="oklch(0.70 0.22 285)"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Competency Breakdown */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-display mb-4">Competency Breakdown</h3>
        <div className="space-y-3">
          {Object.entries(insights.competencies).map(([key, value]) => (
            <CompetencyBar key={key} label={key} score={value} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Testing**:
- Test with 0 sessions (empty state)
- Test with 1-2 sessions (unlock message)
- Test with 10+ sessions (full dashboard)
- Test responsive layout
- Verify chart animations

**Files to Modify**:
- `app/dashboard/sections/analytics.tsx` → `insights.tsx`
- Update `app/dashboard/page.tsx` to use new section

---

(Continuing with remaining tickets in next response due to length...)

Would you like me to:
1. Continue with Phase 3 & 4 tickets?
2. Start implementing any of these tickets right now?
3. Create a visual dependency graph showing which tickets can be worked on in parallel?
## **Phase 3: Smart Recommendations (Weeks 5-6)**

### Ticket P3-001: Recommendation Engine Core Logic

**Priority**: P2
**Effort**: 5 story points
**Dependencies**: P2-002
**Agent Type**: Developer

**Description**:
Build recommendation engine that analyzes user insights and generates personalized practice suggestions.

**Acceptance Criteria**:
- [ ] Create `lib/evaluation/recommendation-engine.ts`
- [ ] Implement focus area detection (lowest competency score)
- [ ] Implement improvement trend analysis (plateau, improving, declining)
- [ ] Generate interview type recommendations based on weakness
- [ ] Generate difficulty recommendations (level up vs consolidate)
- [ ] Create recommendation priority scoring
- [ ] Write unit tests with various user profiles

**Recommendation Rules**:
```typescript
// lib/evaluation/recommendation-engine.ts
export interface Recommendation {
  id: string;
  type: "focus_area" | "level_up" | "diversify" | "consolidate";
  title: string;
  description: string;
  action: {
    label: string;
    interview_type?: string;
    difficulty?: string;
    mode?: string;
  };
  priority: number; // 1-10
  reason: string;
}

export function generateRecommendations(insights: UserInsightsData): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Rule 1: Focus Area (lowest competency)
  const focusArea = findLowestCompetency(insights.competencies);
  if (focusArea.score < 7.0) {
    recommendations.push({
      id: "focus-area",
      type: "focus_area",
      title: `Improve ${focusArea.name}`,
      description: `Your ${focusArea.name} score is ${focusArea.score}/10. Practice ${getInterviewTypeForCompetency(focusArea.name)} to strengthen this area.`,
      action: {
        label: "Start Focused Practice",
        interview_type: getInterviewTypeForCompetency(focusArea.name),
        mode: "practice",
      },
      priority: 10,
      reason: "Lowest scoring competency",
    });
  }

  // Rule 2: Level Up (consistently scoring >8.0 at current difficulty)
  const currentDifficulty = getMostRecentDifficulty(insights);
  const currentScore = insights.by_difficulty[currentDifficulty]?.avg_score || 0;
  if (currentScore >= 8.0 && currentDifficulty !== "senior") {
    recommendations.push({
      id: "level-up",
      type: "level_up",
      title: `Ready for ${getNextDifficulty(currentDifficulty)} level`,
      description: `You're scoring ${currentScore}/10 at ${currentDifficulty} level. Time to challenge yourself!`,
      action: {
        label: "Try Harder Questions",
        difficulty: getNextDifficulty(currentDifficulty),
      },
      priority: 8,
      reason: "Consistent high performance at current level",
    });
  }

  // Rule 3: Diversify (one interview type dominates)
  const typeDistribution = calculateTypeDistribution(insights.by_interview_type);
  if (typeDistribution.maxPercent > 60) {
    const underrepresented = typeDistribution.types.filter((t) => t.percent < 20);
    if (underrepresented.length > 0) {
      recommendations.push({
        id: "diversify",
        type: "diversify",
        title: `Try ${underrepresented[0].name} interviews`,
        description: `You've mostly practiced ${typeDistribution.maxType}. Broaden your skills with ${underrepresented[0].name}.`,
        action: {
          label: "Explore New Type",
          interview_type: underrepresented[0].name,
        },
        priority: 6,
        reason: "Interview type imbalance",
      });
    }
  }

  // Rule 4: Consolidate (plateau or declining trend)
  if (insights.trends.improvement_trend === "declining") {
    recommendations.push({
      id: "consolidate",
      type: "consolidate",
      title: "Take a break or review fundamentals",
      description: `Your recent scores (${insights.trends.last_5_avg}) are lower than your all-time average (${insights.trends.all_time_avg}). Consider reviewing core frameworks.`,
      action: {
        label: "Review Frameworks",
        mode: "learning",
      },
      priority: 9,
      reason: "Declining performance trend",
    });
  }

  return recommendations.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

function getInterviewTypeForCompetency(competency: string): string {
  const mapping = {
    structure: "product_sense",
    clarity: "analytical",
    insight: "analytical",
    communication: "leadership",
    leadership: "leadership",
  };
  return mapping[competency.toLowerCase()] || "product_sense";
}
```

**Testing**:
- Test with user needing focus area practice
- Test with user ready to level up
- Test with user needing diversification
- Test with user showing declining trend
- Verify priority sorting

**Files to Create**:
- `lib/evaluation/recommendation-engine.ts`
- `lib/evaluation/__tests__/recommendation-engine.test.ts`

---

### Ticket P3-002: Action Plan Component

**Priority**: P2
**Effort**: 3 story points
**Dependencies**: P3-001
**Agent Type**: Developer (UI focus)

**Description**:
Create UI component to display personalized recommendations and action plans on insights dashboard.

**Acceptance Criteria**:
- [ ] Create `components/insights/action-plan.tsx`
- [ ] Display top 3 recommendations
- [ ] Each recommendation card includes title, description, reason, CTA
- [ ] CTA buttons pre-fill setup modal with recommended config
- [ ] Add animations for card reveals
- [ ] Make responsive

**Component**:
```tsx
// components/insights/action-plan.tsx
"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function ActionPlan({ recommendations }: { recommendations: Recommendation[] }) {
  const router = useRouter();

  const handleStartPractice = (action: Recommendation["action"]) => {
    const params = new URLSearchParams();
    if (action.interview_type) params.set("type", action.interview_type);
    if (action.difficulty) params.set("difficulty", action.difficulty);
    if (action.mode) params.set("mode", action.mode);

    router.push(`/setup?${params.toString()}`);
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-lg font-display mb-4">Your Action Plan</h3>
      <div className="space-y-4">
        {recommendations.map((rec, index) => (
          <motion.div
            key={rec.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-background border border-border rounded-lg p-4 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-medium">{`${index + 1}. ${rec.title}`}</h4>
                <p className="text-sm text-muted-foreground mt-1">{rec.description}</p>
                <p className="text-xs text-muted-foreground mt-2 italic">
                  Why: {rec.reason}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => handleStartPractice(rec.action)}
                className="ml-4"
              >
                {rec.action.label} →
              </Button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
```

**Testing**:
- Test with different recommendation types
- Test CTA navigation with pre-filled params
- Verify animations

**Files to Create**:
- `components/insights/action-plan.tsx`

---

### Ticket P3-003: Streak Tracking System

**Priority**: P2
**Effort**: 5 story points
**Dependencies**: P2-001
**Agent Type**: Developer

**Description**:
Implement streak tracking to gamify consistent practice and display in insights.

**Acceptance Criteria**:
- [ ] Add streak calculation to insights aggregation engine
- [ ] Track current streak (consecutive days with sessions)
- [ ] Track longest streak (all-time best)
- [ ] Add streak data to `user_insights` table
- [ ] Create `components/insights/streak-tracker.tsx` UI component
- [ ] Display streak badges (3-day, 5-day, 7-day)
- [ ] Add streak to overview stats

**Streak Calculation Logic**:
```typescript
// lib/evaluation/streak-calculator.ts
export function calculateStreak(sessions: InterviewSession[]): StreakData {
  if (sessions.length === 0) return { current: 0, longest: 0 };

  // Sort by date (newest first)
  const sorted = sessions
    .filter((s) => s.ended_at)
    .sort((a, b) => b.ended_at!.getTime() - a.ended_at!.getTime());

  // Extract unique dates (YYYY-MM-DD)
  const dates = Array.from(
    new Set(sorted.map((s) => s.ended_at!.toISOString().split("T")[0]))
  );

  // Calculate current streak
  let currentStreak = 0;
  const today = new Date().toISOString().split("T")[0];
  let checkDate = new Date(today);

  for (const date of dates) {
    const dateStr = checkDate.toISOString().split("T")[0];
    if (dates.includes(dateStr)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1); // go back one day
    } else {
      break;
    }
  }

  // Calculate longest streak
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate = new Date(dates[0]);

  for (const dateStr of dates) {
    const date = new Date(dateStr);
    const diffDays = Math.floor(
      (prevDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays <= 1) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 1;
    }
    prevDate = date;
  }

  return { current: currentStreak, longest: longestStreak };
}
```

**Streak Badges**:
```tsx
// components/insights/streak-tracker.tsx
export function StreakTracker({ streak }: { streak: StreakData }) {
  const badges = [
    { days: 3, emoji: "🔥", label: "Hot Streak" },
    { days: 5, emoji: "🚀", label: "On Fire" },
    { days: 7, emoji: "⭐", label: "Superstar" },
  ];

  const currentBadge = badges.reverse().find((b) => streak.current >= b.days);

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h4 className="text-sm font-medium mb-2">Practice Streak</h4>
      <div className="flex items-center gap-4">
        <div className="text-4xl">{currentBadge?.emoji || "📅"}</div>
        <div>
          <p className="text-2xl font-display">{streak.current} days</p>
          <p className="text-xs text-muted-foreground">
            Best: {streak.longest} days
          </p>
        </div>
      </div>
    </div>
  );
}
```

**Testing**:
- Test with consecutive daily sessions
- Test with gaps in sessions
- Test edge cases (sessions on same day, midnight boundary)

**Files to Create**:
- `lib/evaluation/streak-calculator.ts`
- `components/insights/streak-tracker.tsx`

---

### Ticket P3-004: Integrate Recommendations into Insights Dashboard

**Priority**: P2
**Effort**: 3 story points
**Dependencies**: P3-001, P3-002, P3-003
**Agent Type**: Developer (UI focus)

**Description**:
Integrate action plan and streak tracker into insights overview section.

**Acceptance Criteria**:
- [ ] Update `app/dashboard/sections/insights.tsx` to include action plan
- [ ] Add streak tracker to stats row
- [ ] Generate recommendations from insights data
- [ ] Display "What to Practice Next" section
- [ ] Add empty state if no recommendations
- [ ] Test with different user profiles

**Implementation**:
```tsx
// app/dashboard/sections/insights.tsx (updated)
import { ActionPlan } from "@/components/insights/action-plan";
import { StreakTracker } from "@/components/insights/streak-tracker";
import { generateRecommendations } from "@/lib/evaluation/recommendation-engine";

export function InsightsSection() {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/insights").then((r) => r.json()),
      fetch("/api/sessions").then((r) => r.json()),
    ]).then(([insightsData, sessionsData]) => {
      setInsights(insightsData);
      setSessions(sessionsData);
    });
  }, []);

  if (!insights) return <InsightsSkeleton />;

  const recommendations = generateRecommendations(insights);
  const streak = calculateStreak(sessions);

  return (
    <div className="p-6 space-y-6">
      {/* Stats Row with Streak */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total Sessions" value={insights.overall.total_sessions} />
        <StatCard label="Average Score" value={insights.overall.avg_score.toFixed(1)} />
        <StatCard label="Total Time" value={`${insights.overall.total_minutes} min`} />
        <StreakTracker streak={streak} />
      </div>

      {/* Charts */}
      {/* ... existing charts ... */}

      {/* Action Plan */}
      <ActionPlan recommendations={recommendations} />
    </div>
  );
}
```

**Testing**:
- Test with users needing different recommendations
- Test with users on streaks
- Verify layout is responsive

**Files to Modify**:
- `app/dashboard/sections/insights.tsx`

---

## **Phase 4: Advanced Features (Weeks 7-8)**

### Ticket P4-001: Advanced Insights Tab (10+ Sessions)

**Priority**: P3 (Nice to have)
**Effort**: 8 story points
**Dependencies**: P2-005
**Agent Type**: Developer (UI focus)

**Description**:
Create advanced insights tab that unlocks after 10 sessions with deeper analytics.

**Acceptance Criteria**:
- [ ] Add "Advanced" tab to insights section (appears at 10+ sessions)
- [ ] Implement question type performance breakdown
- [ ] Add session length vs score scatter plot
- [ ] Add time-of-day pattern analysis (if data available)
- [ ] Display correlation matrix (which competencies improve together)
- [ ] Add progressive unlock messaging for users <10 sessions

**Advanced Features**:
```tsx
// components/insights/advanced-analytics.tsx
export function AdvancedAnalytics({ insights, sessions }: AdvancedAnalyticsProps) {
  return (
    <div className="p-6 space-y-6">
      {/* Question Type Performance */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-display mb-4">Performance by Question Type</h3>
        <BarChart data={questionTypeData}>
          {/* Bar chart showing avg score by question category */}
        </BarChart>
      </div>

      {/* Session Length vs Score */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-display mb-4">Session Length Impact</h3>
        <ScatterChart data={durationVsScoreData}>
          {/* Scatter plot to find optimal session length */}
        </ScatterChart>
        <p className="text-sm text-muted-foreground mt-2">
          {getSessionLengthInsight(durationVsScoreData)}
        </p>
      </div>

      {/* Competency Correlation */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-display mb-4">Skill Relationships</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Which competencies improve together?
        </p>
        {/* Heatmap or correlation matrix */}
      </div>
    </div>
  );
}
```

**Unlock Messaging**:
```tsx
// For users with <10 sessions
<div className="bg-card border border-border rounded-lg p-12 text-center">
  <div className="text-4xl mb-4">🔒</div>
  <h3 className="text-lg font-display mb-2">Advanced Analytics Locked</h3>
  <p className="text-muted-foreground mb-4">
    Complete {10 - sessionCount} more sessions to unlock advanced insights.
  </p>
  <Progress value={(sessionCount / 10) * 100} className="max-w-xs mx-auto" />
</div>
```

**Testing**:
- Test unlock at exactly 10 sessions
- Test with 20+ sessions (full data)
- Test insights accuracy

**Files to Create**:
- `components/insights/advanced-analytics.tsx`

---

### Ticket P4-002: Export & Share Functionality

**Priority**: P3
**Effort**: 5 story points
**Dependencies**: P2-005
**Agent Type**: Developer

**Description**:
Add export to CSV and shareable progress image generation.

**Acceptance Criteria**:
- [ ] Create CSV export endpoint: `GET /api/insights/export`
- [ ] Export includes all sessions with scores, timestamps, types
- [ ] Create shareable PNG image with progress chart
- [ ] Add "Export Data" button to insights dashboard
- [ ] Add "Share Progress" button (generates PNG)
- [ ] Use canvas or server-side image generation (e.g., Puppeteer)

**CSV Export**:
```typescript
// app/api/insights/export/route.ts
import { stringify } from "csv-stringify/sync";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await db.query.interviewSession.findMany({
    where: eq(interviewSession.user_id, user.id),
    with: { feedback: true },
    orderBy: [desc(interviewSession.started_at)],
  });

  const csvData = sessions
    .filter((s) => s.feedback && s.feedback.status === "completed")
    .map((s) => ({
      date: s.started_at.toISOString(),
      interview_type: s.round_type,
      difficulty: s.config?.difficulty || "intermediate",
      duration_min: Math.round((s.duration_seconds || 0) / 60),
      overall_score: s.feedback!.overall_score,
      structure_score: s.feedback!.structure_score,
      clarity_score: s.feedback!.clarity_score,
      insight_score: s.feedback!.insight_score,
      communication_score: s.feedback!.communication_score,
      leadership_score: s.feedback!.leadership_score,
    }));

  const csv = stringify(csvData, { header: true });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="meelni-progress-${Date.now()}.csv"`,
    },
  });
}
```

**Share Image Generation** (using `html-to-image`):
```tsx
// components/insights/share-button.tsx
"use client";

import { toPng } from "html-to-image";

export function ShareButton({ insights }: { insights: InsightsData }) {
  const handleShare = async () => {
    const element = document.getElementById("insights-chart");
    if (!element) return;

    const dataUrl = await toPng(element, {
      width: 1200,
      height: 630,
      backgroundColor: "#fff",
    });

    // Download or copy to clipboard
    const link = document.createElement("a");
    link.download = "meelni-progress.png";
    link.href = dataUrl;
    link.click();
  };

  return <Button onClick={handleShare}>Share Progress 📤</Button>;
}
```

**Testing**:
- Test CSV export with various session counts
- Test share image generation
- Verify image quality and branding

**Files to Create**:
- `app/api/insights/export/route.ts`
- `components/insights/share-button.tsx`

---

### Ticket P4-003: Performance Optimization - Query Tuning

**Priority**: P2
**Effort**: 3 story points
**Dependencies**: P2-001, P2-002
**Agent Type**: Developer

**Description**:
Optimize database queries and insights aggregation for <300ms response times.

**Acceptance Criteria**:
- [ ] Benchmark current API response times
- [ ] Add missing indexes based on query analysis
- [ ] Optimize insights aggregation query (reduce N+1 queries)
- [ ] Add query profiling logs
- [ ] Verify P95 response time <500ms for insights API
- [ ] Document optimization decisions

**Optimization Techniques**:
1. **Add Indexes**:
   ```sql
   CREATE INDEX idx_feedback_user_created ON feedback(user_id, created_at DESC);
   CREATE INDEX idx_session_user_ended ON interview_session(user_id, ended_at DESC);
   ```

2. **Batch Queries**:
   ```typescript
   // Instead of N queries
   const sessions = await db.query.interviewSession.findMany({
     where: eq(interviewSession.user_id, userId),
     with: { feedback: true }, // JOIN instead of N+1
   });
   ```

3. **Select Only Needed Columns**:
   ```typescript
   const sessions = await db.select({
     id: interviewSession.id,
     overall_score: feedback.overall_score,
     // ... only fields needed for aggregation
   })
   .from(interviewSession)
   .leftJoin(feedback, eq(feedback.session_id, interviewSession.id))
   .where(eq(interviewSession.user_id, userId));
   ```

**Benchmarking**:
- Use `console.time()` or APM tools (Vercel Analytics)
- Target: P50 <200ms, P95 <500ms for `/api/insights`

**Testing**:
- Benchmark with 10, 50, 100 sessions
- Compare before/after optimization
- Load test with 10 concurrent requests

**Files to Modify**:
- `lib/evaluation/insights-engine.ts`
- Database migration files (indexes)

---

### Ticket P4-004: Error Handling & Monitoring Setup

**Priority**: P1
**Effort**: 5 story points
**Dependencies**: All Phase 1-3 tickets
**Agent Type**: Developer

**Description**:
Add comprehensive error handling, logging, and monitoring for feedback/insights pipeline.

**Acceptance Criteria**:
- [ ] Add try-catch blocks to all API routes
- [ ] Log errors to structured logging system (e.g., Axiom, Datadog)
- [ ] Add error boundaries for React components
- [ ] Set up Inngest monitoring dashboard
- [ ] Configure alerts for high failure rates (>5%)
- [ ] Add performance monitoring (API response times)
- [ ] Document error codes and troubleshooting

**Error Handling Pattern**:
```typescript
// app/api/session/end/route.ts
export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();

    // ... validation logic ...

    return NextResponse.json({ status: "queued" });
  } catch (error) {
    // Log error
    console.error("[session/end] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      sessionId: req.nextUrl.searchParams.get("sessionId"),
      userId: (await getUser(req))?.id,
    });

    // Categorize error
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.message },
        { status: 422 }
      );
    }

    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Generic 500
    return NextResponse.json(
      { error: "Internal server error", ref: generateErrorRef() },
      { status: 500 }
    );
  }
}
```

**React Error Boundary**:
```tsx
// components/insights/insights-error-boundary.tsx
export class InsightsErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[InsightsErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center">
          <h3>Something went wrong loading insights</h3>
          <Button onClick={() => this.setState({ hasError: false })}>
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Monitoring Setup**:
- Inngest: Monitor job success rates, retry counts, duration
- API: Track P50/P95 response times, error rates
- Alerts: Email/Slack for >5% failure rate or P95 >2s

**Testing**:
- Test error scenarios (network failure, timeout, invalid data)
- Verify errors are logged correctly
- Test error boundary recovery

**Files to Create**:
- `components/insights/insights-error-boundary.tsx`
- `lib/monitoring/logger.ts` (structured logging)

---

## **Backfill & Migration Tasks**

### Ticket M-001: Data Backfill for Existing Users

**Priority**: P0 (Required before Phase 2 launch)
**Effort**: 3 story points
**Dependencies**: P2-001, P2-002
**Agent Type**: Developer

**Description**:
Backfill `user_insights` table for existing users who have completed sessions.

**Acceptance Criteria**:
- [ ] Create one-time script to generate insights for all users
- [ ] Calculate session stats for existing sessions (turns, words, duration)
- [ ] Run backfill in staging first
- [ ] Verify data accuracy (spot-check 10 users)
- [ ] Run backfill in production during low-traffic period
- [ ] Log progress and errors

**Backfill Script**:
```typescript
// scripts/backfill-insights.ts
import { db } from "@/lib/db";
import { calculateUserInsights } from "@/lib/evaluation/insights-engine";
import { calculateSessionStats } from "@/lib/evaluation/session-validator";

async function backfillInsights() {
  console.log("Starting insights backfill...");

  const users = await db.query.appUser.findMany();

  for (const user of users) {
    try {
      console.log(`Processing user ${user.id}...`);

      // 1. Backfill session stats
      const sessions = await db.query.interviewSession.findMany({
        where: eq(interviewSession.user_id, user.id),
      });

      for (const session of sessions) {
        if (!session.total_turns) {
          const stats = await calculateSessionStats(session.id);
          await db.update(interviewSession)
            .set({
              total_turns: stats.totalTurns,
              total_words: stats.totalWords,
              duration_seconds: stats.durationSeconds,
            })
            .where(eq(interviewSession.id, session.id));
        }
      }

      // 2. Generate insights
      const insights = await calculateUserInsights(user.id);

      // 3. Upsert
      await db.insert(userInsights)
        .values({
          user_id: user.id,
          ...insights,
        })
        .onConflictDoUpdate({
          target: userInsights.user_id,
          set: insights,
        });

      console.log(`✓ User ${user.id} backfilled`);
    } catch (error) {
      console.error(`✗ Error backfilling user ${user.id}:`, error);
    }
  }

  console.log("Backfill complete!");
}

backfillInsights().catch(console.error);
```

**Execution**:
```bash
# Staging
DATABASE_URL=$STAGING_DB_URL npm run backfill:insights

# Production (during off-peak hours)
DATABASE_URL=$PROD_DB_URL npm run backfill:insights
```

**Testing**:
- Test on dev database first
- Verify insights match manual calculations
- Check for users with edge cases (0 sessions, partial data)

**Files to Create**:
- `scripts/backfill-insights.ts`
- `package.json` script: `"backfill:insights": "tsx scripts/backfill-insights.ts"`

---

## **Testing & QA Tasks**

### Ticket Q-001: End-to-End Testing Suite

**Priority**: P1
**Effort**: 8 story points
**Dependencies**: All Phase 1-2 tickets
**Agent Type**: Developer (QA focus)

**Description**:
Create comprehensive E2E test suite covering critical user flows.

**Acceptance Criteria**:
- [ ] Set up Playwright test environment
- [ ] Write E2E test for full session → feedback → insights flow
- [ ] Test edge cases (short session, failed session, etc.)
- [ ] Test polling mechanism (feedback generation)
- [ ] Test insights dashboard loading with different session counts
- [ ] Run tests in CI/CD pipeline
- [ ] Achieve >80% critical path coverage

**E2E Test Example**:
```typescript
// e2e/feedback-flow.spec.ts
import { test, expect } from "@playwright/test";

test("complete interview and receive feedback", async ({ page }) => {
  // 1. Sign in
  await page.goto("/auth/signin");
  await page.click('button:has-text("Continue with Google")');
  // ... OAuth flow ...

  // 2. Start interview
  await page.goto("/setup");
  await page.click('button:has-text("Product Sense")');
  await page.click('button:has-text("Start Interview")');

  // 3. Wait for agent to join
  await expect(page.locator("text=Connected to Meelni")).toBeVisible();

  // 4. Conduct interview (simulate 25 minutes)
  // ... interact with voice agent ...

  // 5. End session
  await page.click('button:has-text("End Session")');

  // 6. Check feedback loading
  await expect(page.locator("text=Analyzing Your Performance")).toBeVisible();

  // 7. Wait for feedback (max 2 min)
  await expect(page.locator("text=Your feedback is ready")).toBeVisible({
    timeout: 120000,
  });

  // 8. Verify feedback content
  const overallScore = await page.locator('[data-testid="overall-score"]').textContent();
  expect(parseFloat(overallScore!)).toBeGreaterThan(0);

  // 9. Check insights dashboard
  await page.goto("/dashboard?tab=insights");
  await expect(page.locator("text=Performance Trends")).toBeVisible();
});

test("handle too-short session", async ({ page }) => {
  // ... sign in ...

  // Start and immediately end session
  await page.goto("/setup");
  await page.click('button:has-text("Start Interview")');

  // Wait 1 minute, then end
  await page.waitForTimeout(60000);
  await page.click('button:has-text("End Session")');

  // Should see insufficient data message
  await expect(page.locator("text=Session Too Short")).toBeVisible();
  await expect(page.locator("text=Session Duration: 1m")).toBeVisible();
});
```

**Testing**:
- Run locally with `npx playwright test`
- Run in CI on every PR
- Generate HTML report for failures

**Files to Create**:
- `e2e/feedback-flow.spec.ts`
- `e2e/insights-dashboard.spec.ts`
- `playwright.config.ts`

---

## **Documentation Tasks**

### Ticket D-001: Update CLAUDE.md with New Features

**Priority**: P2
**Effort**: 2 story points
**Dependencies**: All Phase 1-2 tickets
**Agent Type**: Technical Writer

**Description**:
Update project documentation with new feedback/insights architecture.

**Acceptance Criteria**:
- [ ] Add ADRs 26-30 to CLAUDE.md
- [ ] Document new API endpoints (session/end, feedback polling, insights)
- [ ] Update database schema section
- [ ] Add new file boundaries (insights-engine, recommendation-engine, etc.)
- [ ] Document Inngest integration
- [ ] Update iteration log

**Files to Modify**:
- `.claude/CLAUDE.md`

---

### Ticket D-002: API Documentation

**Priority**: P2
**Effort**: 3 story points
**Dependencies**: All API tickets
**Agent Type**: Technical Writer

**Description**:
Create comprehensive API documentation for feedback/insights endpoints.

**Acceptance Criteria**:
- [ ] Create `docs/api/feedback-insights.md`
- [ ] Document all endpoints with request/response examples
- [ ] Add error code reference
- [ ] Document rate limits
- [ ] Add curl examples
- [ ] Include sequence diagrams for flows

**Files to Create**:
- `docs/api/feedback-insights.md`

---

