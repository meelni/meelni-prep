import assert from "node:assert/strict";
import test from "node:test";

import {
  getCanonicalInterviewHref,
  getCredentialRetryDelayMs,
  hasVerifiedInterviewerLiveness,
  isInterviewConversationReady,
  isInterviewRoomCredentialAuthorizationCurrent,
  parseInterviewRoomCredentials,
  reconcileInterviewCustomerConnectionStatus,
  reduceInterviewConnectionState,
  shouldDiscardInterviewRoomCredentials,
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

test("reconnect credential generation must still match current lifecycle truth", () => {
  const credentials = {
    token: "short-lived-token",
    url: "wss://preview.livekit.cloud",
    roomName: "interview-owned-room",
    authorizationVersion: 4,
    expiresAt: "2026-07-10T08:00:30.000Z",
  };
  const now = new Date("2026-07-10T08:00:00.000Z");
  assert.equal(
    isInterviewRoomCredentialAuthorizationCurrent(
      credentials,
      {
        lifecycleState: "reconnecting",
        lifecycleVersion: 4,
        reconnectDeadlineAt: "2026-07-10T08:00:30.000Z",
        endedAt: null,
      },
      now
    ),
    true
  );
  for (const lifecycle of [
    {
      lifecycleState: "reconnecting",
      lifecycleVersion: 5,
      reconnectDeadlineAt: "2026-07-10T08:00:30.000Z",
      endedAt: null,
    },
    {
      lifecycleState: "ending",
      lifecycleVersion: 4,
      reconnectDeadlineAt: "2026-07-10T08:00:30.000Z",
      endedAt: null,
    },
    {
      lifecycleState: "failed",
      lifecycleVersion: 5,
      reconnectDeadlineAt: null,
      endedAt: "2026-07-10T08:00:01.000Z",
    },
  ]) {
    assert.equal(
      isInterviewRoomCredentialAuthorizationCurrent(
        credentials,
        lifecycle,
        now
      ),
      false
    );
  }
});

test("credential retries are bounded and limited to transient responses", () => {
  assert.equal(getCredentialRetryDelayMs(429, "3"), 3_000);
  assert.equal(getCredentialRetryDelayMs(429, "120"), 10_000);
  assert.equal(getCredentialRetryDelayMs(503, null), 2_000);
  assert.equal(getCredentialRetryDelayMs(409, null), null);
});

test("terminal credential denial discards the mounted room connection", () => {
  assert.equal(shouldDiscardInterviewRoomCredentials(409), true);
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
