import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { InterviewRoomSurface } from "./interview-room-surface";
import { InterviewControls } from "./interview-controls";
import type { InterviewConnectionStatus } from "@/components/interview/session-recovery";
import { mapTrackVolumeToVisualIntensity } from "./audio-level";
import { groupTranscriptTurns } from "./transcript-display";
import { TranscriptPanel } from "./transcript-panel";

function renderSurface({
  connectionStatus = "connected",
  deadlineReached = false,
}: {
  connectionStatus?: InterviewConnectionStatus;
  deadlineReached?: boolean;
} = {}) {
  return renderToStaticMarkup(
    <InterviewRoomSurface
      company="Fixture Company"
      connectionIndicator={<span>Fixture connection</span>}
      connectionStatus={connectionStatus}
      controls={<button aria-label="End interview">End</button>}
      deadlineReached={deadlineReached}
      mediaVisualizer={<div>Fixture media</div>}
      question="Design a product for a synthetic PM interview fixture."
      roundType="product_sense"
      timer={<span>30:00 remaining</span>}
      transcriptIntegrity="healthy"
      transcriptHydrationState="ready"
      transcriptPanel={<div>This is synthetic interview content.</div>}
    />
  );
}

test("renders the interview room through provider-free injected visual slots", () => {
  const html = renderSurface();

  assert.match(html, /Product Sense/);
  assert.match(html, /Fixture connection/);
  assert.match(html, /Fixture media/);
  assert.match(html, /Design a product for a synthetic PM interview fixture/);
  assert.match(html, /This is synthetic interview content/);
  assert.doesNotMatch(html, /Practice interview/);
  assert.doesNotMatch(html, /Interviewer is listening/);
  assert.doesNotMatch(html, /Conversation turns are saved/);
  assert.doesNotMatch(html, /Gentle hints on/);
  assert.match(html, /aria-label="End interview"/);
});

test("keeps the stage free of redundant ready copy when no question is available", () => {
  const html = renderToStaticMarkup(
    <InterviewRoomSurface
      connectionStatus="connected"
      deadlineReached={false}
      mediaVisualizer={<div>Fixture media</div>}
      transcriptIntegrity="healthy"
      transcriptHydrationState="ready"
    />
  );

  assert.doesNotMatch(html, /Your interviewer is ready/);
  assert.match(html, /Live PM interview/);
});

test("groups consecutive transcript fragments into speaker turns", () => {
  const timestamp = new Date("2026-07-27T20:00:00.000Z");
  const grouped = groupTranscriptTurns([
    { eventId: "1", speaker: "user", text: "I would start", timestamp },
    { eventId: "2", speaker: "user", text: "with the user.", timestamp },
    { eventId: "3", speaker: "interviewer", text: "Why?", timestamp },
    { eventId: "4", speaker: "user", text: "To reduce risk.", timestamp },
  ]);

  assert.deepEqual(grouped, [
    {
      id: "1",
      speaker: "user",
      text: "I would start with the user.",
    },
    { id: "3", speaker: "interviewer", text: "Why?" },
    { id: "4", speaker: "user", text: "To reduce risk." },
  ]);
});

test("renders a grouped live transcript without per-message timestamps", () => {
  const timestamp = new Date("2026-07-27T20:00:00.000Z");
  const html = renderToStaticMarkup(
    <TranscriptPanel
      turns={[
        { eventId: "1", speaker: "user", text: "I would start", timestamp },
        { eventId: "2", speaker: "user", text: "with the user.", timestamp },
      ]}
    />
  );

  assert.match(html, /I would start with the user\./);
  assert.doesNotMatch(html, /ago/);
  assert.doesNotMatch(html, /2026/);
});

test("distinguishes an empty saved transcript from a degraded transcript read", () => {
  const emptyHtml = renderToStaticMarkup(
    <InterviewRoomSurface
      connectionStatus="connected"
      deadlineReached={false}
      transcriptIntegrity="healthy"
      transcriptHydrationState="empty"
    />
  );
  const degradedHtml = renderToStaticMarkup(
    <InterviewRoomSurface
      connectionStatus="connected"
      deadlineReached={false}
      transcriptIntegrity="healthy"
      transcriptHydrationState="degraded"
      onRetryTranscriptHydration={() => undefined}
    />
  );

  assert.match(emptyHtml, /No saved transcript turns yet/);
  assert.doesNotMatch(emptyHtml, /Retry transcript/);
  assert.match(degradedHtml, /Saved transcript couldn’t be loaded/);
  assert.match(degradedHtml, /New turns will still appear here/);
  assert.match(degradedHtml, /role="status"/);
  assert.match(degradedHtml, /aria-live="polite"/);
  assert.match(degradedHtml, /Retry transcript/);
  assert.match(degradedHtml, /type="button"/);
});

test("maps normalized LiveKit volume into a responsive visual range", () => {
  assert.equal(mapTrackVolumeToVisualIntensity(0), 0);
  assert.equal(mapTrackVolumeToVisualIntensity(0.015), 0);
  assert.ok(mapTrackVolumeToVisualIntensity(0.1) > 0.35);
  assert.equal(mapTrackVolumeToVisualIntensity(1), 1);
});

test("keeps End Interview available before the room reconnects", () => {
  const html = renderSurface({ connectionStatus: "reconnecting" });

  assert.match(html, /aria-label="End interview"/);
});

test("renders delayed canonical readiness without removing the end escape hatch", () => {
  const html = renderSurface({ connectionStatus: "delayed" });

  assert.match(html, /The interviewer is still joining/);
  assert.match(html, /End remains available/);
  assert.match(html, /aria-label="End interview"/);
});

test("renders a delayed room transport without removing the end escape hatch", () => {
  const html = renderSurface({ connectionStatus: "transport_delayed" });

  assert.match(html, /Room connection is taking longer than expected/);
  assert.match(html, /End remains available/);
  assert.match(html, /aria-label="End interview"/);
});

test("renders active conversation while durable readiness syncs without joining copy", () => {
  const html = renderSurface({ connectionStatus: "syncing" });

  assert.match(html, /Interview active\. Syncing status in the background/);
  assert.doesNotMatch(html, /interviewer is still joining/);
  assert.match(html, /aria-label="End interview"/);
});

test("disables only mute during reconnect and preserves the end escape hatch", () => {
  const html = renderToStaticMarkup(
    <InterviewControls
      isMuted={true}
      muteDisabled={true}
      onToggleMute={() => undefined}
      onEndSession={() => undefined}
    />
  );

  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*aria-label="Microphone controls unavailable while the interviewer joins or the connection recovers"/
  );
  assert.match(html, /aria-label="End interview"/);
  assert.doesNotMatch(html, /aria-label="End interview"[^>]*disabled=""/);
});

test("shows a recoverable microphone failure without hiding End", () => {
  const html = renderToStaticMarkup(
    <InterviewControls
      isMuted={true}
      microphoneError="Microphone unavailable. Check your browser permission or device, then try again."
      onToggleMute={() => undefined}
      onEndSession={() => undefined}
    />
  );

  assert.match(html, /role="alert"/);
  assert.match(html, /Microphone unavailable/);
  assert.match(html, /aria-label="Try microphone again"/);
  assert.match(html, /Mic off/);
  assert.match(html, /aria-label="End interview"/);
});

test("full mock interview controls do not expose the unsupported hints toggle", () => {
  const html = renderToStaticMarkup(
    <InterviewControls
      isMuted={false}
      onToggleMute={() => undefined}
      onEndSession={() => undefined}
    />
  );

  assert.match(html, /aria-label="Mute microphone"/);
  assert.match(html, /aria-label="End interview"/);
  assert.doesNotMatch(html, /hint/i);
  assert.doesNotMatch(html, /lightbulb/i);
});
