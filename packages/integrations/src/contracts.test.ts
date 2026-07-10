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
  inspectInterviewParticipantPresence,
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

test("LiveKit provider creates and reconciles one interview room and dispatch", async () => {
  const fixture = createLiveKitStartFixture();
  const calls: string[] = [];
  const roomInputs: unknown[] = [];
  const dispatches: Array<{ id: string; room: string; agentName: string }> = [];
  const provider: LiveKitInterviewProvider = createLiveKitInterviewProvider({
    agentDispatchClientFactory: () => ({
      listDispatch: async () => {
        calls.push("list-dispatch");
        return dispatches;
      },
      createDispatch: async (roomName, agentName) => {
        calls.push("dispatch");
        const dispatch = { id: "dispatch-1", room: roomName, agentName };
        dispatches.push(dispatch);
        return dispatch;
      },
    }),
    roomServiceClientFactory: () => ({
      createRoom: async (input) => {
        roomInputs.push(input);
        calls.push("room");
      },
      listRooms: async () => [
        {
          name: fixture.input.roomName,
          metadata: JSON.stringify(fixture.input.metadata),
        },
      ],
    }),
  });

  const result = await provider.startInterviewRoom(fixture.input);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data, {
      roomName: fixture.input.roomName,
    });
  }
  assert.deepEqual(calls, ["grant", "jwt", "room", "dispatch"]);
  assert.deepEqual(calls, [
    "room",
    "list-dispatch",
    "dispatch",
    "list-dispatch",
  ]);
  assert.deepEqual(roomInputs, [
    {
      name: fixture.input.roomName,
      metadata: JSON.stringify(fixture.input.metadata),
      emptyTimeout: 3600,
      maxParticipants: 2,
      departureTimeout: 60,
    },
  ]);
});

test("LiveKit provider reuses the one matching room dispatch", async () => {
  const fixture = createLiveKitStartFixture();
  let createDispatchCalls = 0;
  const provider = createLiveKitInterviewProvider({
    agentDispatchClientFactory: () => ({
      listDispatch: async () => [
        {
          id: "dispatch-existing",
          agentName: fixture.input.agentName,
          room: fixture.input.roomName,
        },
      ],
      createDispatch: async (room, agentName) => {
        createDispatchCalls += 1;
        return { id: "dispatch-new", room, agentName };
      },
    }),
    roomServiceClientFactory: () => ({
      createRoom: async () => {
        throw new Error("room already exists");
      },
      listRooms: async () => [
        {
          name: fixture.input.roomName,
          metadata: JSON.stringify(fixture.input.metadata),
        },
      ],
    }),
  });

  const result = await provider.startInterviewRoom(fixture.input);

  assert.equal(result.ok, true);
  assert.equal(createDispatchCalls, 0);
});

test("LiveKit provider fails closed for duplicate or mismatched dispatches", async () => {
  const fixture = createLiveKitStartFixture();
  const dispatchCases = [
    [
      {
        id: "dispatch-1",
        agentName: fixture.input.agentName,
        room: fixture.input.roomName,
      },
      {
        id: "dispatch-2",
        agentName: fixture.input.agentName,
        room: fixture.input.roomName,
      },
    ],
    [
      {
        id: "dispatch-1",
        agentName: "another-agent",
        room: fixture.input.roomName,
      },
    ],
  ];

  for (const dispatches of dispatchCases) {
    const provider = createLiveKitInterviewProvider({
      agentDispatchClientFactory: () => ({
        listDispatch: async () => dispatches,
        createDispatch: async (room, agentName) => ({
          id: "unexpected",
          room,
          agentName,
        }),
      }),
      roomServiceClientFactory: () => ({
        createRoom: async () => undefined,
        listRooms: async () => [
          {
            name: fixture.input.roomName,
            metadata: JSON.stringify(fixture.input.metadata),
          },
        ],
      }),
    });

    const result = await provider.startInterviewRoom(fixture.input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "livekit_agent_dispatch_conflict");
      assert.equal(result.error.retryable, false);
    }
  }
});

test("LiveKit provider verifies dispatch uniqueness after creation", async () => {
  const fixture = createLiveKitStartFixture();
  let listCalls = 0;
  const provider = createLiveKitInterviewProvider({
    agentDispatchClientFactory: () => ({
      listDispatch: async () => {
        listCalls += 1;
        return listCalls === 1
          ? []
          : [
              {
                id: "dispatch-1",
                room: fixture.input.roomName,
                agentName: fixture.input.agentName,
              },
              {
                id: "dispatch-race",
                room: fixture.input.roomName,
                agentName: fixture.input.agentName,
              },
            ];
      },
      createDispatch: async (room, agentName) => ({
        id: "dispatch-1",
        room,
        agentName,
      }),
    }),
    roomServiceClientFactory: () => ({
      createRoom: async () => undefined,
      listRooms: async () => [
        {
          name: fixture.input.roomName,
          metadata: JSON.stringify(fixture.input.metadata),
        },
      ],
    }),
  });

  const result = await provider.startInterviewRoom(fixture.input);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_agent_dispatch_conflict");
  }
});

test("LiveKit token signing failure occurs before room or dispatch side effects", async () => {
  const fixture = createLiveKitStartFixture();
  const calls: string[] = [];
  const provider = createLiveKitInterviewProvider({
    accessTokenFactory: class {
      addGrant() {
        calls.push("grant");
      }

      async toJwt() {
        calls.push("jwt");
        throw new Error("signing unavailable");
      }
    } as never,
    roomServiceClientFactory: () => ({
      createRoom: async () => {
        calls.push("room");
      },
    }),
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        calls.push("dispatch");
      },
    }),
  });

  const result = await provider.startInterviewRoom(fixture.input);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "livekit_token_issue_failed");
  assert.deepEqual(calls, ["grant", "jwt"]);
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
      observedAt: signingAt,
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
  const observedAt = new Date();
  const result = await issueInterviewParticipantToken(
    {
      identity: "authenticated-user-id",
      participantName: "Candidate",
      roomName: "interview-server-owned-room",
      ttlSeconds: 300,
      observedAt,
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
  const observedAt = new Date(issuedAtSeconds * 1_000);
  const expiresAt = new Date((issuedAtSeconds + 90) * 1_000);
  const result = await issueInterviewParticipantToken({
    identity: "authenticated-user-id",
    participantName: "Candidate",
    roomName: "interview-server-owned-room",
    ttlSeconds: 300,
    observedAt,
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

test("LiveKit reconnect token TTL compensates for a slow signer clock", async () => {
  const databaseNow = new Date("2026-07-10T08:00:00.000Z");
  const signerNow = new Date("2026-07-10T07:50:00.000Z");
  const expiresAt = new Date("2026-07-10T08:00:30.000Z");
  let ttl = 0;
  const result = await issueInterviewParticipantToken(
    {
      identity: "authenticated-user-id",
      participantName: "Candidate",
      roomName: "interview-server-owned-room",
      ttlSeconds: 30,
      observedAt: databaseNow,
      expiresAt,
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    },
    {
      now: () => signerNow,
      accessTokenFactory: class {
        constructor(
          _apiKey: string,
          _apiSecret: string,
          options: { ttl?: number }
        ) {
          ttl = options.ttl ?? 0;
        }
        addGrant() {}
        async toJwt() {
          return jwtWithExpiration(Math.floor(expiresAt.getTime() / 1_000));
        }
      },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(ttl, 630);
  if (result.ok)
    assert.equal(result.data.expiresAt.getTime(), expiresAt.getTime());
});

test("LiveKit reconnect token issuance fails closed for a signer past the canonical cutoff", async () => {
  let constructed = false;
  const result = await issueInterviewParticipantToken(
    {
      identity: "authenticated-user-id",
      participantName: "Candidate",
      roomName: "interview-server-owned-room",
      ttlSeconds: 30,
      observedAt: new Date("2026-07-10T08:00:00.000Z"),
      expiresAt: new Date("2026-07-10T08:00:30.000Z"),
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    },
    {
      now: () => new Date("2026-07-10T08:10:00.000Z"),
      accessTokenFactory: class {
        constructor() {
          constructed = true;
        }
        addGrant() {}
        async toJwt() {
          return jwtWithExpiration(0);
        }
      },
    }
  );

  assert.equal(result.ok, false);
  assert.equal(constructed, false);
  if (!result.ok)
    assert.equal(result.error.code, "livekit_token_expiry_invalid");
});

test("LiveKit room termination revokes the candidate before deleting the room", async () => {
  const calls: string[] = [];
  const env = {
    apiKey: "key",
    apiSecret: "secret",
    url: "wss://test.livekit.cloud",
  };
  const deletedResult = await terminateInterviewRoom(
    {
      roomName: "interview-deadline-room",
      participantIdentity: "candidate-id",
      revokedAt: new Date("2026-07-10T08:00:30.900Z"),
      env,
    },
    {
      roomServiceClientFactory: () => ({
        createRoom: async () => undefined,
        removeParticipant: async (roomName, identity, options) => {
          calls.push(
            `revoke:${roomName}:${identity}:${options?.revokeTokenTs}`
          );
        },
        deleteRoom: async (roomName) => {
          calls.push(`delete:${roomName}`);
        },
      }),
    }
  );
  const absentResult = await terminateInterviewRoom(
    {
      roomName: "interview-deadline-room",
      participantIdentity: "candidate-id",
      revokedAt: new Date("2026-07-10T08:00:30.900Z"),
      env,
    },
    {
      roomServiceClientFactory: () => ({
        createRoom: async () => undefined,
        removeParticipant: async () => undefined,
        deleteRoom: async () => {
          throw Object.assign(new Error("room not found"), {
            code: "not_found",
            status: 404,
          });
        },
      }),
    }
  );

  assert.deepEqual(calls, [
    "revoke:interview-deadline-room:candidate-id:1783670431",
    "delete:interview-deadline-room",
  ]);
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
      participantIdentity: "candidate-id",
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    },
    {
      roomServiceClientFactory: () => ({
        createRoom: async () => undefined,
        removeParticipant: async () => undefined,
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

test("LiveKit room deletion never runs when token revocation fails", async () => {
  let deleted = false;
  const result = await terminateInterviewRoom(
    {
      roomName: "interview-deadline-room",
      participantIdentity: "candidate-id",
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    },
    {
      roomServiceClientFactory: () => ({
        createRoom: async () => undefined,
        removeParticipant: async () => {
          throw new Error("revocation unavailable");
        },
        deleteRoom: async () => {
          deleted = true;
        },
      }),
    }
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_participant_revoke_failed");
    assert.equal(result.error.retryable, true);
  }
  assert.equal(deleted, false);
});

test("LiveKit room termination remains idempotent after the room disappears", async () => {
  let deleteAttempts = 0;
  const result = await terminateInterviewRoom(
    {
      roomName: "interview-deadline-room",
      participantIdentity: "candidate-id",
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    },
    {
      roomServiceClientFactory: () => ({
        createRoom: async () => undefined,
        removeParticipant: async () => {
          throw Object.assign(new Error("participant not found"), {
            code: "not_found",
          });
        },
        deleteRoom: async () => {
          deleteAttempts += 1;
          throw Object.assign(new Error("room not found"), {
            code: "not_found",
          });
        },
      }),
    }
  );

  assert.deepEqual(result, {
    ok: true,
    provider: "livekit",
    data: {
      roomName: "interview-deadline-room",
      disposition: "already_absent",
    },
  });
  assert.equal(deleteAttempts, 1);
});

test("LiveKit room termination fails closed for invalid revocation input", async () => {
  let touchedProvider = false;
  const result = await terminateInterviewRoom(
    {
      roomName: "interview-deadline-room",
      participantIdentity: " ",
      revokedAt: new Date(Number.NaN),
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    },
    {
      roomServiceClientFactory: () => ({
        createRoom: async () => undefined,
        removeParticipant: async () => {
          touchedProvider = true;
        },
        deleteRoom: async () => {
          touchedProvider = true;
        },
      }),
    }
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_participant_revoke_invalid");
    assert.equal(result.error.retryable, false);
  }
  assert.equal(touchedProvider, false);
});

test("LiveKit presence normalizes candidate connection states", async () => {
  const env = {
    apiKey: "key",
    apiSecret: "secret",
    url: "wss://test.livekit.cloud",
  };
  for (const state of [0, 1, 2]) {
    const result = await inspectInterviewParticipantPresence(
      {
        roomName: "interview-presence-room",
        participantIdentity: "candidate-id",
        env,
      },
      {
        roomServiceClientFactory: () => ({
          createRoom: async () => undefined,
          listParticipants: async () => [
            {
              identity: "candidate-id",
              state,
              joinedAtMs: BigInt(1_783_670_430_000),
              kind: 0,
            },
          ],
        }),
      }
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.present, true);
      assert.equal(result.data.joined, state !== 0);
      assert.equal(
        result.data.joinedAt?.toISOString(),
        "2026-07-10T08:00:30.000Z"
      );
      assert.equal(result.data.agent, null);
    }
  }

  const disconnected = await inspectInterviewParticipantPresence(
    {
      roomName: "interview-presence-room",
      participantIdentity: "candidate-id",
      env,
    },
    {
      roomServiceClientFactory: () => ({
        createRoom: async () => undefined,
        listParticipants: async () => [
          {
            identity: "candidate-id",
            state: 3,
            joinedAtMs: BigInt(0),
            kind: 0,
          },
        ],
      }),
    }
  );
  assert.deepEqual(disconnected, {
    ok: true,
    provider: "livekit",
    data: { present: false, joined: false, joinedAt: null, agent: null },
  });
});

test("LiveKit presence requires the exact standard candidate and provider agent kind", async () => {
  const result = await inspectInterviewParticipantPresence(
    {
      roomName: "interview-presence-room",
      participantIdentity: "candidate-id",
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    },
    {
      roomServiceClientFactory: () => ({
        createRoom: async () => undefined,
        listParticipants: async () => [
          {
            identity: "candidate-id",
            state: 2,
            joinedAtMs: BigInt(1_783_670_430_000),
            kind: 4,
          },
          {
            identity: "random-standard-participant",
            state: 2,
            joinedAtMs: BigInt(1_783_670_430_001),
            kind: 0,
          },
          {
            identity: "agent-joining",
            state: 0,
            joinedAtMs: BigInt(1_783_670_430_001),
            kind: 4,
          },
          {
            identity: "agent-worker",
            state: 2,
            joinedAtMs: BigInt(1_783_670_430_002),
            kind: 4,
          },
        ],
      }),
    }
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.present, false);
    assert.equal(result.data.joined, false);
    assert.equal(result.data.joinedAt, null);
    assert.equal(result.data.agent?.identity, "agent-worker");
  }
});

test("LiveKit presence treats an absent room as absent and other failures as retryable", async () => {
  const input = {
    roomName: "interview-presence-room",
    participantIdentity: "candidate-id",
    env: {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://test.livekit.cloud",
    },
  };
  const absent = await inspectInterviewParticipantPresence(input, {
    roomServiceClientFactory: () => ({
      createRoom: async () => undefined,
      listParticipants: async () => {
        throw Object.assign(new Error("room not found"), { status: 404 });
      },
    }),
  });
  const failed = await inspectInterviewParticipantPresence(input, {
    roomServiceClientFactory: () => ({
      createRoom: async () => undefined,
      listParticipants: async () => {
        throw new Error("provider unavailable");
      },
    }),
  });

  assert.deepEqual(absent, {
    ok: true,
    provider: "livekit",
    data: { present: false, joined: false, joinedAt: null, agent: null },
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.code, "livekit_participant_presence_failed");
    assert.equal(failed.error.retryable, true);
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
