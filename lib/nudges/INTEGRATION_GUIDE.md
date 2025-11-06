# Framework Tracker Integration Guide

## Overview
This guide shows how to integrate the Framework Tracker into MockMate's real-time interview system.

## Architecture Flow

```
User speaks → LiveKit ASR (Deepgram) → Transcript Turn
    ↓
Framework Tracker analyzes turn
    ↓
Coverage updated + Nudge decision made
    ↓
If nudge needed → Inject into Agent LLM context
    ↓
Agent responds with nudge (seamlessly woven into conversation)
    ↓
Update UI with coverage visualization
```

## Step 1: Initialize Tracker on Session Start

### In `/app/interview/page.tsx` or LiveKit room component

```typescript
"use client";

import { useEffect, useState } from "react";
import { createFrameworkTracker } from "@/lib/nudges/framework-tracker";
import { FrameworkTracker } from "@/lib/nudges/framework-tracker";
import { FrameworkCoverage } from "@/lib/types/nudges";

export default function InterviewPage() {
  const [tracker, setTracker] = useState<FrameworkTracker | null>(null);
  const [coverage, setCoverage] = useState<FrameworkCoverage | null>(null);

  // Initialize tracker when session starts
  useEffect(() => {
    const interviewType = new URLSearchParams(window.location.search).get("interview_type") || "product_sense";
    const newTracker = createFrameworkTracker(interviewType as any, Date.now());
    setTracker(newTracker);
  }, []);

  return (
    <div>
      {/* LiveKit room UI */}
      {/* Coverage visualization */}
      {coverage && <FrameworkCoverageBar coverage={coverage} />}
    </div>
  );
}
```

## Step 2: Hook Into LiveKit Transcript Events

### Create a custom hook for transcript tracking

```typescript
// /hooks/use-framework-tracking.ts
import { useEffect } from "react";
import { useTranscription } from "@livekit/components-react";
import { FrameworkTracker } from "@/lib/nudges/framework-tracker";
import { TranscriptTurn } from "@/lib/types/nudges";

export function useFrameworkTracking(
  tracker: FrameworkTracker | null,
  onNudge: (message: string, priority: string) => void
) {
  const { transcripts } = useTranscription();

  useEffect(() => {
    if (!tracker || !transcripts.length) return;

    const lastTranscript = transcripts[transcripts.length - 1];

    // Convert LiveKit transcript to our format
    const turn: TranscriptTurn = {
      id: lastTranscript.id || String(Date.now()),
      speaker: lastTranscript.participantName === "Agent" ? "interviewer" : "user",
      text: lastTranscript.text,
      timestamp: Date.now(),
    };

    // Analyze turn
    const coverage = tracker.analyzeTurn(turn);

    // Check if nudge needed
    const nudge = tracker.shouldNudge();
    if (nudge.shouldNudge && nudge.message) {
      onNudge(nudge.message, nudge.priority);
    }

    return coverage;
  }, [transcripts, tracker, onNudge]);
}
```

## Step 3: Send Nudges to Agent

### Option A: Via Agent Context Update (Recommended)

Update the agent's system prompt dynamically:

```typescript
// In interview page
const handleNudge = async (message: string, priority: string) => {
  console.log(`[NUDGE - ${priority}]: ${message}`);

  // Send to backend API that updates agent context
  await fetch("/api/interview/nudge", {
    method: "POST",
    body: JSON.stringify({
      sessionId: roomName,
      nudge: message,
      priority,
    }),
  });
};

// Use in component
useFrameworkTracking(tracker, handleNudge);
```

### Backend API: `/app/api/interview/nudge/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";

const roomClient = new RoomServiceClient(
  process.env.NEXT_PUBLIC_LIVEKIT_URL!,
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!
);

export async function POST(req: NextRequest) {
  const { sessionId, nudge, priority } = await req.json();

  // Send data message to agent participant
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify({
    type: "nudge",
    message: nudge,
    priority,
  }));

  await roomClient.sendData(data, {
    destinationNames: ["Agent"], // Send only to agent
    room: sessionId,
  });

  return NextResponse.json({ success: true });
}
```

### Python Agent: Handle Nudges

```python
# In /agent/agent.py

async def entrypoint(ctx: JobContext):
    # ... existing setup ...

    # Listen for nudge data messages
    @ctx.room.on("data_received")
    async def on_data_received(data: rtc.DataPacket):
        payload = json.loads(data.data.decode())
        if payload.get("type") == "nudge":
            nudge_message = payload.get("message")
            priority = payload.get("priority")

            # Inject into agent's context for next response
            session.llm_context.append({
                "role": "system",
                "content": f"[COACH NUDGE - {priority}]: Gently weave this into your next response: {nudge_message}"
            })
```

### Option B: Direct Agent Prompt Injection (Simpler)

If agent doesn't support context updates, include nudge in next user message:

```typescript
// Frontend component
const handleNudge = (message: string, priority: string) => {
  // Store nudge in state
  setCurrentNudge({ message, priority });
};

// When agent responds, include nudge as context
// (This requires modifying LiveKit pipeline - more complex)
```

## Step 4: Visualize Coverage in UI

### Create coverage visualization component

```typescript
// /components/interview/framework-coverage-bar.tsx
"use client";

import { FrameworkCoverage } from "@/lib/types/nudges";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function FrameworkCoverageBar({ coverage }: { coverage: FrameworkCoverage }) {
  return (
    <div className="space-y-3 p-4 bg-card rounded-lg border border-border">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          Framework Coverage
        </h3>
        <span className="text-2xl font-bold text-primary">
          {coverage.coveragePercentage}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${coverage.coveragePercentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* Elements Grid */}
      <div className="grid grid-cols-5 gap-2">
        {coverage.elements.map((element, idx) => (
          <motion.div
            key={element.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={cn(
              "p-3 rounded-md text-center transition-all",
              element.detected
                ? "bg-primary/20 text-primary border-2 border-primary"
                : "bg-muted text-muted-foreground border-2 border-transparent"
            )}
          >
            {/* Checkmark if detected */}
            {element.detected && (
              <div className="flex justify-center mb-1">
                <Check className="w-4 h-4" />
              </div>
            )}

            {/* Element name */}
            <div className="text-xs font-medium">{element.name}</div>

            {/* Time mentioned */}
            {element.detected && element.firstMentionAt !== undefined && (
              <div className="text-[10px] text-muted-foreground mt-1">
                {Math.floor(element.firstMentionAt / 60)}:{String(element.firstMentionAt % 60).padStart(2, "0")}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Missing elements hint */}
      {coverage.coveragePercentage < 100 && (
        <div className="text-xs text-muted-foreground">
          Missing: {coverage.elements.filter(e => !e.detected).map(e => e.name).join(", ")}
        </div>
      )}
    </div>
  );
}
```

## Step 5: Save Coverage to Database (Post-Session)

### When interview ends

```typescript
// In interview end handler
const handleInterviewEnd = async () => {
  if (!tracker) return;

  const finalCoverage = tracker.getCoverage();
  const debugSummary = tracker.getDebugSummary();

  // Save to database
  await fetch("/api/interview/save-coverage", {
    method: "POST",
    body: JSON.stringify({
      sessionId: roomName,
      coverage: finalCoverage,
      summary: debugSummary,
    }),
  });
};
```

### Backend API: `/app/api/interview/save-coverage/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessionMetrics } from "@/lib/db/schema";

export async function POST(req: NextRequest) {
  const { sessionId, coverage, summary } = await req.json();

  // Save to database (you'll need to add this table)
  await db.insert(sessionMetrics).values({
    sessionId,
    interviewType: coverage.interviewType,
    coveragePercentage: coverage.coveragePercentage,
    detectedElements: summary.detectedElements,
    missingElements: summary.missingElements,
    sessionDuration: summary.sessionDuration,
    createdAt: new Date(),
  });

  return NextResponse.json({ success: true });
}
```

## Step 6: Complete Integration Example

### Full interview page with framework tracking

```typescript
// /app/interview/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { LiveKitRoom } from "@livekit/components-react";
import { createFrameworkTracker } from "@/lib/nudges/framework-tracker";
import { FrameworkTracker } from "@/lib/nudges/framework-tracker";
import { FrameworkCoverage } from "@/lib/types/nudges";
import { FrameworkCoverageBar } from "@/components/interview/framework-coverage-bar";
import { useFrameworkTracking } from "@/hooks/use-framework-tracking";

export default function InterviewPage() {
  const [tracker, setTracker] = useState<FrameworkTracker | null>(null);
  const [coverage, setCoverage] = useState<FrameworkCoverage | null>(null);
  const [token, setToken] = useState("");
  const [roomName, setRoomName] = useState("");

  // Initialize tracker
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const interviewType = params.get("interview_type") || "product_sense";
    const newTracker = createFrameworkTracker(interviewType as any);
    setTracker(newTracker);
  }, []);

  // Handle nudges
  const handleNudge = useCallback(async (message: string, priority: string) => {
    console.log(`[NUDGE - ${priority}]: ${message}`);

    // Send to agent
    await fetch("/api/interview/nudge", {
      method: "POST",
      body: JSON.stringify({ sessionId: roomName, nudge: message, priority }),
    });
  }, [roomName]);

  // Track coverage
  const currentCoverage = useFrameworkTracking(tracker, handleNudge);

  useEffect(() => {
    if (currentCoverage) {
      setCoverage(currentCoverage);
    }
  }, [currentCoverage]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto grid grid-cols-3 gap-6">
        {/* Main interview area */}
        <div className="col-span-2">
          <LiveKitRoom
            token={token}
            serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
            connect={true}
            audio={true}
          >
            {/* LiveKit UI components */}
          </LiveKitRoom>
        </div>

        {/* Sidebar with coverage */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Live Feedback</h2>
          {coverage && <FrameworkCoverageBar coverage={coverage} />}
        </div>
      </div>
    </div>
  );
}
```

## Testing Integration

### Manual Testing Checklist

1. ✅ Start interview session
2. ✅ Verify tracker initializes with correct interview type
3. ✅ Speak and mention framework keywords
4. ✅ Check coverage bar updates in real-time
5. ✅ Trigger nudge conditions (e.g., wait 90s without metrics)
6. ✅ Verify nudge appears in agent's response
7. ✅ Complete interview and check database has coverage data

### Example Test Transcript

```typescript
// Test Product Sense coverage
const testTranscript = [
  "Let me clarify - who is the target user?", // Clarify detected
  "The users are college students", // User detected
  "Their pain point is time management", // Pain detected
  // Wait 90 seconds without metrics → Should trigger nudge
  "We could build a calendar app", // Solution detected
  "We'd measure success with daily active users", // Metrics detected
];
```

## Performance Considerations

- **Turn Analysis**: <5ms per turn (fast keyword matching)
- **UI Updates**: Debounce coverage updates to max 1/second
- **Nudge Frequency**: Minimum 30 seconds between nudges
- **Memory**: ~50KB per tracker instance (lightweight)

## Troubleshooting

### Nudges not appearing?
- Check: Is tracker initialized?
- Check: Are transcript events firing?
- Check: Is agent receiving data messages?
- Check: Agent logs for nudge processing

### Coverage not updating?
- Check: Are transcripts being processed?
- Check: Are keywords matching (case-insensitive)?
- Check: Is speaker correctly identified (user vs interviewer)?

### False positives?
- Adjust keywords in framework definitions
- Add negative keyword filtering (future enhancement)
- Use LLM for semantic analysis (post-MVP)

---

**Integration Status**: Ready for implementation
**Next Steps**:
1. Create `/app/api/interview/nudge/route.ts`
2. Update Python agent to handle nudge data messages
3. Create `FrameworkCoverageBar` component
4. Add session metrics table to database schema
