import assert from "node:assert/strict";
import test from "node:test";

import {
  interpretPublicDemoStartFailure,
  requestPublicDemoStart,
} from "./public-demo-client";

test("public demo client establishes cookies before the one cost-bearing request", async () => {
  const calls: string[] = [];
  const responses = [
    new Response(JSON.stringify({ error: "demo_identity_initialized" }), {
      status: 409,
      headers: { "content-type": "application/json" },
    }),
    new Response(
      JSON.stringify({
        token: "signed-token",
        url: "wss://test.livekit.cloud",
        durationSeconds: 120,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    ),
  ];
  const result = await requestPublicDemoStart({
    signal: new AbortController().signal,
    fetcher: (async (_input, init) => {
      calls.push(String(init?.body));
      return responses.shift()!;
    }) as typeof fetch,
  });

  assert.deepEqual(calls, ["{}", "{}"]);
  assert.deepEqual(result, {
    ok: true,
    data: {
      token: "signed-token",
      url: "wss://test.livekit.cloud",
      durationSeconds: 120,
    },
  });
});

test("public demo client never loops a failed identity handshake", async () => {
  let calls = 0;
  const result = await requestPublicDemoStart({
    signal: new AbortController().signal,
    fetcher: (async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ error: "demo_identity_initialized" }),
        { status: 409, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch,
  });

  assert.equal(calls, 2);
  assert.equal(result.ok, false);
});

test("public demo client maps 429 to an explicit non-immediate cooldown", () => {
  assert.deepEqual(
    interpretPublicDemoStartFailure({
      status: 429,
      body: { error: "demo_rate_limited", retryAfterSeconds: 42 },
      retryAfterHeader: "5",
      now: 1_000,
    }),
    {
      title: "The voice preview is on cooldown",
      message: "You can try again when the cooldown ends.",
      retryAt: 43_000,
    }
  );
});

test("public demo client distinguishes paused, provisioning, and unavailable states", () => {
  assert.deepEqual(
    interpretPublicDemoStartFailure({
      status: 503,
      body: { error: "voice_unavailable_in_preview" },
      retryAfterHeader: null,
    }),
    {
      title: "Voice is off in this web Preview",
      message:
        "Use the trusted staging environment for LiveKit rehearsal. Non-voice Preview pages remain available.",
      paused: true,
    }
  );
  assert.equal(
    interpretPublicDemoStartFailure({
      status: 404,
      body: { error: "demo_unavailable" },
      retryAfterHeader: null,
    }).paused,
    true
  );
  assert.equal(
    interpretPublicDemoStartFailure({
      status: 409,
      body: { error: "demo_start_in_progress" },
      retryAfterHeader: "3",
      now: 1_000,
    }).retryAt,
    4_000
  );
  assert.match(
    interpretPublicDemoStartFailure({
      status: 503,
      body: { error: "demo_temporarily_unavailable" },
      retryAfterHeader: null,
    }).title,
    /temporarily unavailable/
  );
});
