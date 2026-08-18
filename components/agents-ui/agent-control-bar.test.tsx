import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AgentControlBar } from "./agent-control-bar";

function renderControlBar(
  props: Partial<React.ComponentProps<typeof AgentControlBar>> = {}
) {
  return renderToStaticMarkup(
    <AgentControlBar
      isMuted={false}
      onMicrophoneToggle={() => undefined}
      onDisconnect={() => undefined}
      disconnectLabel="End interview"
      {...props}
    />
  );
}

test("keeps the controlled microphone and end actions without unsupported controls", () => {
  const html = renderControlBar();

  assert.match(html, /aria-label="Mute microphone"/);
  assert.match(html, /aria-label="End interview"/);
  assert.doesNotMatch(html, /camera/i);
  assert.doesNotMatch(html, /screen share/i);
  assert.doesNotMatch(html, /chat/i);
});

test("disables only the microphone while preserving the end escape hatch", () => {
  const html = renderControlBar({
    isMuted: true,
    microphoneDisabled: true,
  });

  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*aria-label="Microphone controls are unavailable while the interviewer joins or the connection recovers"/
  );
  assert.match(html, /aria-label="End interview"/);
  assert.doesNotMatch(html, /aria-label="End interview"[^>]*disabled=""/);
});

test("announces pending and recoverable microphone states", () => {
  const pendingHtml = renderControlBar({
    microphonePending: true,
  });
  const errorHtml = renderControlBar({
    isMuted: true,
    microphoneError: "Microphone unavailable. Try again.",
  });

  assert.match(pendingHtml, /Waiting for microphone confirmation/);
  assert.match(pendingHtml, /<button[^>]*disabled=""/);
  assert.match(pendingHtml, /Turning microphone off/);
  assert.match(errorHtml, /role="alert"/);
  assert.match(errorHtml, /aria-label="Try microphone again"/);
  assert.match(errorHtml, /Microphone unavailable/);
});
