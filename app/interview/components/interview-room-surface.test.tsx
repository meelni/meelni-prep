import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { InterviewRoomSurface } from "./interview-room-surface";
import { InterviewControls } from "./interview-controls";

function renderSurface({
  connectionStatus = "connected" as const,
  deadlineReached = false,
  recoveringConnection = false,
} = {}) {
  return renderToStaticMarkup(
    <InterviewRoomSurface
      agentState="listening"
      company="Fixture Company"
      connectionIndicator={<span>Fixture connection</span>}
      connectionStatus={connectionStatus}
      controls={<button aria-label="End interview">End</button>}
      deadlineReached={deadlineReached}
      mediaVisualizer={<div>Fixture media</div>}
      question="Design a product for a synthetic PM interview fixture."
      recoveringConnection={recoveringConnection}
      roundType="product_sense"
      timer={<span>30:00 remaining</span>}
      transcriptIntegrity="healthy"
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
  assert.match(html, /Real interview/);
  assert.doesNotMatch(html, /Gentle hints on/);
  assert.match(html, /aria-label="End interview"/);
});

test("keeps interview controls unavailable while connection recovery owns the room", () => {
  const html = renderSurface({ recoveringConnection: true });

  assert.doesNotMatch(html, /aria-label="End interview"/);
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
