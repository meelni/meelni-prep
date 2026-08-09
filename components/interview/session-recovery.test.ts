import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyInterviewSessionBootstrapResponse,
  getCanonicalInterviewHref,
  getCredentialRetryDelayMs,
  getInterviewRetryDelayMs,
  hasVerifiedInterviewerLiveness,
  isInterviewConversationReady,
  parseInterviewRoomCredentials,
  reconcileInterviewCustomerConnectionStatus,
  reduceInterviewConnectionState,
  shouldDiscardInterviewRoomCredentials,
  waitForInterviewRecoveryDelay,
  type InterviewConnectionTracker,
} from "./session-recovery";

test("verified conversational agent activity makes canonical lag non-blocking", () => {
  for (const agentState of ["listening", "thinking", "speaking"]) {
    assert.equal(
      hasVerifiedInterviewerLiveness({ agentActive: true, agentState }),
      true
    );
  }
  for (const agentState of ["connecting", "initializing", "disconnected"]) {
    assert.equal(
      hasVerifiedInterviewerLiveness({ agentActive: true, agentState }),
      false
    );
  }
  assert.equal(
    hasVerifiedInterviewerLiveness({
      agentActive: false,
      agentState: "speaking",
    }),
    false
  );

  assert.equal(
    reconcileInterviewCustomerConnectionStatus("delayed", true),
    "syncing"
  );
  assert.equal(
    reconcileInterviewCustomerConnectionStatus("connecting", true),
    "syncing"
  );
  assert.equal(
    reconcileInterviewCustomerConnectionStatus("reconnecting", true),
    "reconnecting"
  );
  assert.equal(
    reconcileInterviewCustomerConnectionStatus("delayed", false),
    "delayed"
  );
  assert.equal(isInterviewConversationReady("syncing"), true);
  assert.equal(isInterviewConversationReady("delayed"), false);
});

test("canonical interview links persist only the encoded session ID", () => {
  assert.equal(
    getCanonicalInterviewHref("session/id?token=secret"),
    "/interview?sessionId=session%2Fid%3Ftoken%3Dsecret"
  );
});

test("room credentials must be complete and correlated to the persisted room", () => {
  assert.deepEqual(
    parseInterviewRoomCredentials(
      {
        token: "short-lived-token",
        url: "wss://preview.livekit.cloud",
        roomName: "interview-owned-room",
      },
      "interview-owned-room"
    ),
    {
      token: "short-lived-token",
      url: "wss://preview.livekit.cloud",
      roomName: "interview-owned-room",
    }
  );

  assert.equal(
    parseInterviewRoomCredentials(
      {
        token: "short-lived-token",
        url: "wss://preview.livekit.cloud",
        roomName: "interview-other-room",
      },
      "interview-owned-room"
    ),
    null
  );
  assert.equal(
    parseInterviewRoomCredentials(
      { token: "short-lived-token", url: "https://not-websocket.example" },
      "interview-owned-room"
    ),
    null
  );
});

test("reconnect credentials require a live authorization generation", () => {
  const now = new Date("2026-07-10T08:00:00.000Z");
  assert.deepEqual(
    parseInterviewRoomCredentials(
      {
        token: "short-lived-token",
        url: "wss://preview.livekit.cloud",
        roomName: "interview-owned-room",
        authorizationVersion: 4,
        expiresAt: "2026-07-10T08:00:30.000Z",
      },
      "interview-owned-room",
      now
    ),
    {
      token: "short-lived-token",
      url: "wss://preview.livekit.cloud",
      roomName: "interview-owned-room",
      authorizationVersion: 4,
      expiresAt: "2026-07-10T08:00:30.000Z",
    }
  );
  assert.equal(
    parseInterviewRoomCredentials(
      {
        token: "late-token",
        url: "wss://preview.livekit.cloud",
        roomName: "interview-owned-room",
        authorizationVersion: 4,
        expiresAt: now.toISOString(),
      },
      "interview-owned-room",
      now
    ),
    null
  );
});

test("credential retries are bounded and limited to transient responses", () => {
  assert.equal(getCredentialRetryDelayMs(429, "3"), 3_000);
  assert.equal(getCredentialRetryDelayMs(429, "120"), 10_000);
  assert.equal(getCredentialRetryDelayMs(503, null), 2_000);
  assert.equal(getCredentialRetryDelayMs(409, null), null);
  assert.equal(
    getInterviewRetryDelayMs(
      "Fri, 10 Jul 2026 08:00:03 GMT",
      Date.parse("2026-07-10T08:00:00.000Z")
    ),
    3_000
  );
});

test("session bootstrap retries only advertised transient reads", () => {
  assert.equal(
    classifyInterviewSessionBootstrapResponse(503, { retryable: true }),
    "retryable"
  );
  assert.equal(
    classifyInterviewSessionBootstrapResponse(401, { retryable: true }),
    "authorization_lost"
  );
  assert.equal(
    classifyInterviewSessionBootstrapResponse(409, { retryable: false }),
    "terminal"
  );
  assert.equal(classifyInterviewSessionBootstrapResponse(200, {}), "ready");
});

test("interview recovery sleeps are cancellable", async () => {
  const controller = new AbortController();
  const waiting = waitForInterviewRecoveryDelay(60_000, controller.signal);
  controller.abort("test_cancelled");
  await assert.rejects(waiting, { name: "AbortError" });
});

test("terminal credential denial discards the mounted room connection", () => {
  assert.equal(shouldDiscardInterviewRoomCredentials(409), true);
  assert.equal(shouldDiscardInterviewRoomCredentials(401), true);
  assert.equal(shouldDiscardInterviewRoomCredentials(403), true);
  assert.equal(shouldDiscardInterviewRoomCredentials(404), true);
  assert.equal(shouldDiscardInterviewRoomCredentials(429), false);
  assert.equal(shouldDiscardInterviewRoomCredentials(503), false);
});

test("repeated short and final drops recover the same connection flow", () => {
  let tracker: InterviewConnectionTracker = {
    attemptObserved: false,
    recoveryObserved: false,
  };
  const observe = (
    state:
      | "disconnected"
      | "connecting"
      | "connected"
      | "reconnecting"
      | "signalReconnecting"
  ) => {
    const transition = reduceInterviewConnectionState(tracker, state);
    tracker = transition.tracker;
    return transition.status;
  };

  assert.equal(observe("disconnected"), null);
  assert.equal(observe("connecting"), "connecting");
  assert.equal(observe("connected"), "connected");
  assert.equal(observe("reconnecting"), "reconnecting");
  assert.equal(observe("connected"), "recovered");
  assert.equal(observe("disconnected"), "disconnected");
  assert.equal(observe("connecting"), "connecting");
  assert.equal(observe("connected"), "recovered");
  assert.equal(observe("reconnecting"), "reconnecting");
  assert.equal(observe("connected"), "recovered");
});
