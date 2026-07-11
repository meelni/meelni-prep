import assert from "node:assert/strict";
import test from "node:test";

import {
  getCanonicalInterviewHref,
  getCredentialRetryDelayMs,
  parseInterviewRoomCredentials,
  reduceInterviewConnectionState,
  shouldDiscardInterviewRoomCredentials,
  type InterviewConnectionTracker,
} from "./session-recovery";

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
