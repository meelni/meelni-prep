import assert from "node:assert/strict";
import test from "node:test";
import { AccessToken } from "livekit-server-sdk";

import { createLiveKitStartFixture } from "@meelni/test-fixtures";

import {
  buildInterviewRoomName,
  createLiveKitInterviewProvider,
  findMissingRequiredEnv,
  getLiveKitAgentName,
  getLiveKitEnvironment,
  getProviderEnvContract,
  INTEGRATION_PROVIDERS,
  isProviderFailure,
  issueInterviewParticipantToken,
  receiveLiveKitParticipantWebhook,
  listProviderEnvVars,
  providerFailure,
  providerSuccess,
  terminateInterviewRoom,
  type LiveKitInterviewProvider,
} from "./index";

test("declares the provider set used by the current app", () => {
  assert.deepEqual(INTEGRATION_PROVIDERS, [
    "supabase",
    "livekit",
    "stripe",
    "posthog",
    "google_sheets",
    "inngest",
  ]);
});

test("livekit env contract captures server keys and websocket URL alternatives", () => {
  const contract = getProviderEnvContract("livekit");

  assert.equal(contract.provider, "livekit");
  assert.deepEqual(listProviderEnvVars("livekit"), [
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "LIVEKIT_INTERVIEW_AGENT_NAME",
    "LIVEKIT_DEMO_AGENT_NAME",
    "NEXT_PUBLIC_LIVEKIT_URL",
    "LIVEKIT_URL",
  ]);
});

test("Supabase env contract includes the non-secret Production identity guard", () => {
  assert.deepEqual(listProviderEnvVars("supabase"), [
    "DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "MEELNI_PRODUCTION_SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
  assert.deepEqual(findMissingRequiredEnv("supabase", {}), [
    "DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]);
});

test("missing env detection supports required vars and at-least-one groups", () => {
  const missing = findMissingRequiredEnv("livekit", {
    LIVEKIT_API_KEY: "key",
    LIVEKIT_API_SECRET: "",
    NEXT_PUBLIC_LIVEKIT_URL: "",
    LIVEKIT_URL: "",
  });

  assert.deepEqual(missing, [
    "LIVEKIT_API_SECRET",
    "NEXT_PUBLIC_LIVEKIT_URL or LIVEKIT_URL",
  ]);
});

test("google sheets contract exposes supported credential alternatives", () => {
  assert.deepEqual(findMissingRequiredEnv("google_sheets", {}), [
    "GOOGLE_SHEET_CSV_URL or GOOGLE_SHEETS_API_KEY or GOOGLE_SHEETS_CREDENTIALS_BASE64 or GOOGLE_SHEETS_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  ]);
});

test("stripe env contract matches the credit billing catalog", () => {
  assert.deepEqual(listProviderEnvVars("stripe"), [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_INTERVIEW_PASS_PRICE_ID",
    "STRIPE_STARTER_MONTHLY_PRICE_ID",
    "STRIPE_PRO_MONTHLY_PRICE_ID",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  ]);

  assert.deepEqual(findMissingRequiredEnv("stripe", {}), [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_INTERVIEW_PASS_PRICE_ID",
    "STRIPE_STARTER_MONTHLY_PRICE_ID",
    "STRIPE_PRO_MONTHLY_PRICE_ID",
  ]);
});

test("provider results normalize success and retryable failures", () => {
  const success = providerSuccess("stripe", { checkoutSessionId: "cs_test_1" });

  assert.equal(success.ok, true);
  assert.equal(success.provider, "stripe");
  assert.deepEqual(success.data, { checkoutSessionId: "cs_test_1" });

  const failure = providerFailure("supabase", {
    code: "auth_unavailable",
    message: "Could not reach Supabase Auth.",
    retryable: true,
  });

  assert.equal(isProviderFailure(failure), true);
  assert.equal(failure.ok, false);
  assert.equal(failure.error.retryable, true);
});

test("getLiveKitEnvironment reports missing required LiveKit config", () => {
  const result = getLiveKitEnvironment({});

  assert.equal(result.ok, false);
  assert.equal(result.provider, "livekit");
  assert.equal(result.error.code, "livekit_env_missing");
  assert.equal(result.error.retryable, false);
});

test("getLiveKitEnvironment accepts public or server websocket URL", () => {
  const result = getLiveKitEnvironment({
    LIVEKIT_API_KEY: "key",
    LIVEKIT_API_SECRET: "secret",
    LIVEKIT_URL: "wss://server.livekit.cloud",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data, {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://server.livekit.cloud",
    });
  }
});

test("getLiveKitAgentName reads per-account dispatch names", () => {
  const result = getLiveKitAgentName("interview", {
    LIVEKIT_INTERVIEW_AGENT_NAME: "interview-agent-prod",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data, "interview-agent-prod");
  }
});

test("getLiveKitAgentName reports missing dispatch names", () => {
  const result = getLiveKitAgentName("demo", {});

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_agent_name_missing");
    assert.equal(result.error.retryable, false);
  }
});

test("buildInterviewRoomName creates deterministic interview room names for tests", () => {
  const name = buildInterviewRoomName({
    now: 1782600000000,
    random: () => 0.5,
  });

  assert.match(name, /^interview-1782600000000-/);
});

test("LiveKit provider creates room, dispatches agent, and mints token", async () => {
  const fixture = createLiveKitStartFixture();
  const calls: string[] = [];
  const constructorCalls: unknown[] = [];
  const grants: unknown[] = [];
  const roomInputs: unknown[] = [];
  const provider: LiveKitInterviewProvider = createLiveKitInterviewProvider({
    accessTokenFactory: class {
      constructor(...args: unknown[]) {
        constructorCalls.push(args);
      }

      addGrant(grant: unknown) {
        grants.push(grant);
        calls.push("grant");
      }

      async toJwt() {
        calls.push("jwt");
        return "token-1";
      }
    },
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        calls.push("dispatch");
      },
    }),
    roomServiceClientFactory: () => ({
      createRoom: async (input) => {
        roomInputs.push(input);
        calls.push("room");
      },
    }),
  });

  const result = await provider.startInterviewRoom(fixture.input);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data, {
      roomName: fixture.input.roomName,
      token: "token-1",
      url: fixture.input.env.url,
    });
  }
  assert.deepEqual(calls, ["room", "dispatch", "grant", "jwt"]);
  assert.deepEqual(roomInputs, [
    {
      name: fixture.input.roomName,
      metadata: JSON.stringify(fixture.input.metadata),
      emptyTimeout: 3600,
      maxParticipants: 2,
      departureTimeout: 60,
    },
  ]);
  assert.deepEqual(constructorCalls, [
    [
      fixture.input.env.apiKey,
      fixture.input.env.apiSecret,
      {
        identity: fixture.input.identity,
        name: fixture.input.participantName,
        ttl: 300,
      },
    ],
  ]);
  assert.deepEqual(grants, [
    {
      room: fixture.input.roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: false,
      canPublishSources: [2],
      canSubscribe: true,
    },
  ]);
});

test("LiveKit participant webhooks normalize signed provider correlation", async () => {
  const result = await receiveLiveKitParticipantWebhook(
    {
      body: "signed-body",
      authorization: "Bearer signed",
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    },
    {
      receive: async (body, authorization) => {
        assert.equal(body, "signed-body");
        assert.equal(authorization, "Bearer signed");
        return {
          id: "event-1",
          event: "participant_joined",
          createdAt: BigInt(1783670400),
          room: { name: "interview-room" },
          participant: {
            identity: "candidate-id",
            joinedAtMs: BigInt(1783670400123),
            kind: 0,
          },
        };
      },
    }
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data, {
      eventId: "event-1",
      eventName: "participant_joined",
      roomName: "interview-room",
      participantIdentity: "candidate-id",
      participantKind: 0,
      occurredAt: new Date(1783670400123),
    });
  }
});

test("LiveKit participant webhook signature failures are rejected", async () => {
  const result = await receiveLiveKitParticipantWebhook(
    {
      body: "tampered",
      authorization: null,
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    },
    {
      receive: async () => {
        throw new Error("invalid signature");
      },
    }
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_webhook_signature_invalid");
  }
});

test("LiveKit leave ordering stays after the participant join within one provider second", async () => {
  const result = await receiveLiveKitParticipantWebhook(
    {
      body: "signed-body",
      authorization: "Bearer signed",
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    },
    {
      receive: async () => ({
        id: "event-left",
        event: "participant_left",
        createdAt: BigInt(1783670400),
        room: { name: "interview-room" },
        participant: {
          identity: "candidate-id",
          joinedAtMs: BigInt(1783670400500),
          kind: 0,
        },
      }),
    }
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data?.occurredAt.getTime(), 1783670400501);
  }
});

test("LiveKit reconnect tokens use a short TTL and the authorized room grant", async () => {
  const constructorCalls: unknown[] = [];
  const grants: unknown[] = [];
  const signingAt = new Date("2026-07-10T08:00:00.000Z");
  const expiresAt = new Date("2026-07-10T08:05:00.000Z");
  const result = await issueInterviewParticipantToken(
    {
      identity: "authenticated-user-id",
      participantName: "owner@example.com",
      roomName: "interview-server-owned-room",
      ttlSeconds: 300,
      expiresAt,
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    },
    {
      accessTokenFactory: class {
        constructor(...args: unknown[]) {
          constructorCalls.push(args);
        }

        addGrant(grant: unknown) {
          grants.push(grant);
        }

        async toJwt() {
          return jwtWithExpiration(Math.floor(expiresAt.getTime() / 1_000));
        }
      },
      now: () => signingAt,
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(constructorCalls, [
    [
      "key",
      "secret",
      {
        identity: "authenticated-user-id",
        name: "owner@example.com",
        ttl: 300,
      },
    ],
  ]);
  assert.deepEqual(grants, [
    {
      room: "interview-server-owned-room",
      roomJoin: true,
      canPublish: true,
      canPublishData: false,
      canPublishSources: [2],
      canSubscribe: true,
    },
  ]);
});

test("a delayed real LiveKit token is withheld when its actual exp crosses the authorization deadline", async () => {
  let signedToken = "";
  class DelayedAccessToken extends AccessToken {
    override async toJwt() {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      signedToken = await super.toJwt();
      return signedToken;
    }
  }

  const expiresAt = new Date(Date.now() + 2_500);
  const result = await issueInterviewParticipantToken(
    {
      identity: "authenticated-user-id",
      participantName: "Candidate",
      roomName: "interview-server-owned-room",
      ttlSeconds: 300,
      expiresAt,
      env: {
        apiKey: "key",
        apiSecret: "test-secret-with-enough-entropy-for-hs256",
        url: "wss://test.livekit.cloud",
      },
    },
    { accessTokenFactory: DelayedAccessToken }
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_token_expiry_invalid");
  }
  assert.ok(signedToken);
  assert.ok(
    decodeJwtExpiration(signedToken) > Math.floor(expiresAt.getTime() / 1_000)
  );
});

test("a real LiveKit token is bounded by the absolute authorization deadline", async () => {
  const issuedAtSeconds = Math.floor(Date.now() / 1_000);
  const expiresAt = new Date((issuedAtSeconds + 90) * 1_000);
  const result = await issueInterviewParticipantToken({
    identity: "authenticated-user-id",
    participantName: "Candidate",
    roomName: "interview-server-owned-room",
    ttlSeconds: 300,
    expiresAt,
    env: {
      apiKey: "key",
      apiSecret: "test-secret-with-enough-entropy-for-hs256",
      url: "wss://test.livekit.cloud",
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const actualExpiration = decodeJwtExpiration(result.data.token);
    assert.ok(actualExpiration <= Math.floor(expiresAt.getTime() / 1_000));
    assert.ok(actualExpiration <= issuedAtSeconds + 300);
  }
});

test("LiveKit room termination deletes once and treats missing rooms as success", async () => {
  const deleted: string[] = [];
  const env = {
    apiKey: "key",
    apiSecret: "secret",
    url: "wss://test.livekit.cloud",
  };
  const deletedResult = await terminateInterviewRoom(
    { roomName: "interview-deadline-room", env },
    {
      roomServiceClientFactory: () => ({
        createRoom: async () => undefined,
        deleteRoom: async (roomName) => {
          deleted.push(roomName);
        },
      }),
    }
  );
  const absentResult = await terminateInterviewRoom(
    { roomName: "interview-deadline-room", env },
    {
      roomServiceClientFactory: () => ({
        createRoom: async () => undefined,
        deleteRoom: async () => {
          throw Object.assign(new Error("room not found"), {
            code: "not_found",
            status: 404,
          });
        },
      }),
    }
  );

  assert.deepEqual(deleted, ["interview-deadline-room"]);
  assert.deepEqual(deletedResult, {
    ok: true,
    provider: "livekit",
    data: {
      roomName: "interview-deadline-room",
      disposition: "deleted",
    },
  });
  assert.deepEqual(absentResult, {
    ok: true,
    provider: "livekit",
    data: {
      roomName: "interview-deadline-room",
      disposition: "already_absent",
    },
  });
});

test("LiveKit room termination normalizes retryable provider failures", async () => {
  const result = await terminateInterviewRoom(
    {
      roomName: "interview-deadline-room",
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    },
    {
      roomServiceClientFactory: () => ({
        createRoom: async () => undefined,
        deleteRoom: async () => {
          throw new Error("provider unavailable");
        },
      }),
    }
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_room_delete_failed");
    assert.equal(result.error.retryable, true);
  }
});

function jwtWithExpiration(exp: number): string {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url"
    ),
    Buffer.from(JSON.stringify({ exp })).toString("base64url"),
    "signature",
  ].join(".");
}

function decodeJwtExpiration(token: string): number {
  const payload = token.split(".")[1];
  assert.ok(payload);
  const parsed = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8")
  ) as { exp?: unknown };
  assert.equal(typeof parsed.exp, "number");
  return parsed.exp as number;
}
