import assert from "node:assert/strict";
import test from "node:test";
import {
  AccessToken,
  AgentDispatch,
  ParticipantInfo,
  Room,
} from "livekit-server-sdk";
import {
  Job,
  JobState,
  JobStatus,
  JobType,
  ParticipantInfo_Kind,
  ParticipantInfo_State,
} from "@livekit/protocol";

import { createLiveKitStartFixture } from "@meelni/test-fixtures";

import {
  buildInterviewRoomName,
  createLiveKitInterviewProvider,
  createLiveKitPublicDemoProvider,
  findMissingRequiredEnv,
  getLiveKitAgentName,
  getLiveKitEnvironment,
  getProviderEnvContract,
  inferSupabaseDatabaseProjectRef,
  inferSupabaseProjectRef,
  INTEGRATION_PROVIDERS,
  isProviderFailure,
  isSupabaseProjectRef,
  issueInterviewParticipantToken,
  inspectInterviewParticipantPresence,
  receiveLiveKitParticipantWebhook,
  listProviderEnvVars,
  providerFailure,
  providerSuccess,
  sendReliableInterviewRoomData,
  terminateInterviewRoom,
  type LiveKitInterviewProvider,
} from "./index";

test("declares the provider set used by the current app", () => {
  assert.deepEqual(INTEGRATION_PROVIDERS, [
    "supabase",
    "livekit",
    "stripe",
    "posthog",
    "opik",
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
    "DEMO_ABUSE_HMAC_SECRET",
    "LIVEKIT_INTERVIEW_AGENT_NAME",
    "LIVEKIT_DEMO_AGENT_NAME",
    "NEXT_PUBLIC_LIVEKIT_URL",
    "LIVEKIT_URL",
  ]);
});

test("Opik env contract keeps tracing and content capture explicitly optional", () => {
  const contract = getProviderEnvContract("opik");

  assert.equal(contract.provider, "opik");
  assert.deepEqual(contract.required, []);
  assert.deepEqual(listProviderEnvVars("opik"), [
    "OPIK_TRACING_ENABLED",
    "OPIK_API_KEY",
    "OPIK_WORKSPACE",
    "OPIK_PROJECT_NAME",
    "OPIK_URL_OVERRIDE",
    "OPIK_CAPTURE_CONTENT",
  ]);
});

test("public demo provider uses bounded rooms, microphone-only grants, and cleanup", async () => {
  const calls: string[] = [];
  const grants: unknown[] = [];
  const tokenOptions: unknown[] = [];
  const provider = createLiveKitPublicDemoProvider({
    accessTokenFactory: class {
      constructor(_key: string, _secret: string, options: unknown) {
        tokenOptions.push(options);
      }
      addGrant(grant: unknown) {
        grants.push(grant);
      }
      async toJwt() {
        return demoJwtWithExpiration("2026-07-09T12:02:00.000Z");
      }
    },
    agentDispatchClientFactory: () => ({
      createDispatch: async (room, agentName) => {
        calls.push("unexpected-create-dispatch");
        return { id: "unexpected", room, agentName };
      },
      listDispatch: async (room) => {
        calls.push("reconcile");
        return [{ id: "dispatch-1", room, agentName: "demo-agent" }];
      },
    }),
    roomServiceClientFactory: () => ({
      createRoom: async (input) => {
        assert.equal(input.agents?.length, 1);
        assert.equal(input.agents?.[0]?.agentName, "demo-agent");
        calls.push(
          `room:${input.emptyTimeout}:${input.departureTimeout}:${input.maxParticipants}`
        );
      },
      deleteRoom: async () => {
        calls.push("delete");
      },
    }),
    now: () => new Date("2026-07-09T12:00:00.000Z"),
  });
  const input = {
    agentName: "demo-agent",
    identity: "demo-opaque",
    roomName: "demo-room",
    metadata: { duration_seconds: 120 },
    observedAt: new Date("2026-07-09T12:00:00.000Z"),
    expiresAt: new Date("2026-07-09T12:02:00.000Z"),
    env: {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://test.livekit.cloud",
    },
  };

  const started = await provider.startPublicDemoRoom(input);
  assert.equal(started.ok, true);
  assert.deepEqual(calls, ["room:30:5:2", "reconcile"]);
  assert.deepEqual(grants, [
    {
      room: "demo-room",
      roomJoin: true,
      canPublish: true,
      canPublishData: false,
      canPublishSources: [2],
      canSubscribe: true,
    },
  ]);
  assert.deepEqual(tokenOptions, [
    { identity: "demo-opaque", name: "Demo participant", ttl: 120 },
  ]);

  const cleanupCalls: string[] = [];
  const failing = createLiveKitPublicDemoProvider({
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        throw new Error("atomic dispatch must not call createDispatch");
      },
      listDispatch: async () => {
        throw new Error("dispatch unavailable");
      },
    }),
    roomServiceClientFactory: () => ({
      createRoom: async () => {
        cleanupCalls.push("room");
      },
      deleteRoom: async () => {
        cleanupCalls.push("delete");
      },
    }),
    now: () => new Date("2026-07-09T12:00:00.000Z"),
  });
  const failed = await failing.startPublicDemoRoom(input);
  assert.equal(failed.ok, false);
  assert.deepEqual(cleanupCalls, ["room", "delete"]);
});

test("public demo provider never creates a second dispatch after atomic room creation", async () => {
  const calls: string[] = [];
  const provider = createLiveKitPublicDemoProvider({
    accessTokenFactory: class {
      addGrant() {
        calls.push("grant");
      }
      async toJwt() {
        calls.push("token");
        return demoJwtWithExpiration("2026-07-09T12:02:00.000Z");
      }
    },
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        calls.push("dispatch");
        throw new Error("must not create a second dispatch");
      },
      listDispatch: async (room) => {
        calls.push("reconcile");
        return [{ id: "atomic-1", room, agentName: "demo-agent" }];
      },
    }),
    roomServiceClientFactory: () => ({
      createRoom: async (input) => {
        calls.push("room");
        assert.equal(input.agents?.length, 1);
        assert.equal(input.agents?.[0]?.agentName, "demo-agent");
      },
      deleteRoom: async () => {
        calls.push("delete");
      },
    }),
    now: () => new Date("2026-07-09T12:00:00.000Z"),
  });

  const result = await provider.startPublicDemoRoom({
    agentName: "demo-agent",
    identity: "demo-opaque",
    roomName: "demo-room",
    metadata: { duration_seconds: 120 },
    observedAt: new Date("2026-07-09T12:00:00.000Z"),
    expiresAt: new Date("2026-07-09T12:02:00.000Z"),
    env: {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://test.livekit.cloud",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["room", "reconcile", "grant", "token"]);
});

test("public demo provider cleans up when initial dispatch inspection fails", async () => {
  const calls: string[] = [];
  const provider = createLiveKitPublicDemoProvider({
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        calls.push("dispatch");
        throw new Error("must not dispatch");
      },
      listDispatch: async () => {
        calls.push("inspect");
        throw new Error("inspection unavailable");
      },
    }),
    roomServiceClientFactory: () => ({
      createRoom: async () => {
        calls.push("room");
      },
      deleteRoom: async () => {
        calls.push("delete");
      },
    }),
  });

  const result = await provider.startPublicDemoRoom({
    agentName: "demo-agent",
    identity: "demo-opaque",
    roomName: "demo-room",
    metadata: { duration_seconds: 120 },
    observedAt: new Date("2026-07-09T12:00:00.000Z"),
    expiresAt: new Date("2026-07-09T12:02:00.000Z"),
    env: {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://test.livekit.cloud",
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_demo_start_failed");
  }
  assert.deepEqual(calls, ["room", "inspect", "delete"]);
});

test("public demo provider cleans up an ambiguous atomic room-creation failure", async (t) => {
  for (const cleanupMode of [
    "not_found",
    "message_only_not_found",
    "unavailable",
    "throws",
  ] as const) {
    await t.test(cleanupMode, async () => {
      const calls: string[] = [];
      const cleanupError = new Error("cleanup unavailable");
      const provider = createLiveKitPublicDemoProvider({
        accessTokenFactory: class {
          addGrant() {
            calls.push("grant");
          }
          async toJwt() {
            calls.push("token");
            return "must-not-mint";
          }
        },
        agentDispatchClientFactory: () => ({
          createDispatch: async () => {
            throw new Error("atomic dispatch must not call createDispatch");
          },
          listDispatch: async () => {
            calls.push("reconcile");
            return [];
          },
        }),
        roomServiceClientFactory: () => ({
          createRoom: async () => {
            calls.push("room");
            throw new Error("response lost after request");
          },
          ...(cleanupMode === "unavailable"
            ? {}
            : {
                deleteRoom: async () => {
                  calls.push("delete");
                  if (cleanupMode === "not_found") {
                    throw Object.assign(new Error("room not found"), {
                      code: "not_found",
                    });
                  }
                  if (cleanupMode === "message_only_not_found") {
                    throw new Error("LiveKit cleanup endpoint not found");
                  }
                  throw cleanupError;
                },
              }),
        }),
      });

      const result = await provider.startPublicDemoRoom({
        agentName: "demo-agent",
        identity: "demo-opaque",
        roomName: "demo-room",
        metadata: { duration_seconds: 120 },
        observedAt: new Date("2026-07-09T12:00:00.000Z"),
        expiresAt: new Date("2026-07-09T12:02:00.000Z"),
        env: {
          apiKey: "key",
          apiSecret: "secret",
          url: "wss://test.livekit.cloud",
        },
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(
          result.error.code,
          cleanupMode === "not_found"
            ? "livekit_demo_start_failed"
            : "livekit_demo_cleanup_failed"
        );
        if (cleanupMode === "throws") {
          assert.equal(result.error.cause, cleanupError);
        }
        if (cleanupMode === "message_only_not_found") {
          assert.equal(
            (result.error.cause as Error).message,
            "LiveKit cleanup endpoint not found"
          );
        }
      }
      assert.deepEqual(
        calls,
        cleanupMode === "unavailable" ? ["room"] : ["room", "delete"]
      );
    });
  }
});

test("public demo provider reports unavailable or failed initial cleanup", async (t) => {
  for (const cleanupMode of ["unavailable", "throws"] as const) {
    await t.test(cleanupMode, async () => {
      const calls: string[] = [];
      const cleanupError = new Error("cleanup unavailable");
      const provider = createLiveKitPublicDemoProvider({
        agentDispatchClientFactory: () => ({
          createDispatch: async () => {
            calls.push("dispatch");
            throw new Error("must not dispatch");
          },
          listDispatch: async () => [
            { id: "automatic-1", room: "demo-room", agentName: "" },
          ],
        }),
        roomServiceClientFactory: () => ({
          createRoom: async () => {
            calls.push("room");
          },
          ...(cleanupMode === "throws"
            ? {
                deleteRoom: async () => {
                  calls.push("delete");
                  throw cleanupError;
                },
              }
            : {}),
        }),
      });

      const result = await provider.startPublicDemoRoom({
        agentName: "demo-agent",
        identity: "demo-opaque",
        roomName: "demo-room",
        metadata: { duration_seconds: 120 },
        observedAt: new Date("2026-07-09T12:00:00.000Z"),
        expiresAt: new Date("2026-07-09T12:02:00.000Z"),
        env: {
          apiKey: "key",
          apiSecret: "secret",
          url: "wss://test.livekit.cloud",
        },
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "livekit_demo_cleanup_failed");
        if (cleanupMode === "throws") {
          assert.equal(result.error.cause, cleanupError);
        }
      }
      assert.deepEqual(
        calls,
        cleanupMode === "throws" ? ["room", "delete"] : ["room"]
      );
    });
  }
});

test("public demo provider fails closed on mismatched or ambiguous dispatches", async (t) => {
  const cases: Array<{
    name: string;
    reconciled: Array<{ id: string; room: string; agentName: string }>;
  }> = [
    {
      name: "dispatch id missing",
      reconciled: [
        {
          id: "",
          room: "demo-room",
          agentName: "demo-agent",
        },
      ],
    },
    {
      name: "agent mismatch",
      reconciled: [
        {
          id: "dispatch-1",
          room: "demo-room",
          agentName: "",
        },
      ],
    },
    {
      name: "room mismatch",
      reconciled: [
        {
          id: "dispatch-1",
          room: "different-room",
          agentName: "demo-agent",
        },
      ],
    },
    {
      name: "missing reconciled dispatch",
      reconciled: [],
    },
    {
      name: "ambiguous reconciled dispatches",
      reconciled: [
        { id: "dispatch-1", room: "demo-room", agentName: "demo-agent" },
        { id: "dispatch-2", room: "demo-room", agentName: "demo-agent" },
      ],
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const calls: string[] = [];
      const provider = createLiveKitPublicDemoProvider({
        accessTokenFactory: class {
          addGrant() {
            calls.push("grant");
          }
          async toJwt() {
            calls.push("token");
            return demoJwtWithExpiration("2026-07-09T12:02:00.000Z");
          }
        },
        agentDispatchClientFactory: () => ({
          createDispatch: async () => {
            calls.push("dispatch");
            throw new Error("atomic dispatch must not call createDispatch");
          },
          listDispatch: async () => {
            calls.push("reconcile");
            return scenario.reconciled;
          },
        }),
        roomServiceClientFactory: () => ({
          createRoom: async () => {
            calls.push("room");
          },
          deleteRoom: async () => {
            calls.push("delete");
          },
        }),
        now: () => new Date("2026-07-09T12:00:00.000Z"),
      });

      const result = await provider.startPublicDemoRoom({
        agentName: "demo-agent",
        identity: "demo-opaque",
        roomName: "demo-room",
        metadata: { duration_seconds: 120 },
        observedAt: new Date("2026-07-09T12:00:00.000Z"),
        expiresAt: new Date("2026-07-09T12:02:00.000Z"),
        env: {
          apiKey: "key",
          apiSecret: "secret",
          url: "wss://test.livekit.cloud",
        },
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "livekit_demo_start_failed");
      }
      assert.deepEqual(calls, ["room", "reconcile", "delete"]);
    });
  }
});

test("public demo token-signing failure deletes the room after atomic dispatch", async () => {
  const calls: string[] = [];
  const provider = createLiveKitPublicDemoProvider({
    accessTokenFactory: class {
      addGrant() {
        calls.push("grant");
      }
      async toJwt(): Promise<string> {
        calls.push("jwt");
        throw new Error("signing unavailable");
      }
    },
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        calls.push("dispatch");
        throw new Error("atomic dispatch must not call createDispatch");
      },
      listDispatch: async () => {
        calls.push("reconcile");
        return [
          { id: "dispatch-1", room: "demo-room", agentName: "demo-agent" },
        ];
      },
    }),
    roomServiceClientFactory: () => ({
      createRoom: async () => {
        calls.push("room");
      },
      deleteRoom: async () => {
        calls.push("delete");
      },
    }),
    now: () => new Date("2026-07-09T12:00:00.000Z"),
  });

  const result = await provider.startPublicDemoRoom({
    agentName: "demo-agent",
    identity: "demo-opaque",
    roomName: "demo-room",
    metadata: { duration_seconds: 120 },
    observedAt: new Date("2026-07-09T12:00:00.000Z"),
    expiresAt: new Date("2026-07-09T12:02:00.000Z"),
    env: {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://test.livekit.cloud",
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(calls, ["room", "reconcile", "grant", "jwt", "delete"]);
});

test("public demo recovery requires an actual LiveKit agent participant", async () => {
  const checks: Array<Array<{ identity: string; kind: number }>> = [
    [{ identity: "different-human", kind: 0 }],
    [{ identity: "demo-agent", kind: 4 }],
  ];
  const calls: string[] = [];
  const provider = createLiveKitPublicDemoProvider({
    accessTokenFactory: class {
      addGrant() {}
      async toJwt() {
        calls.push("token");
        return demoJwtWithExpiration("2026-07-09T12:02:00.000Z");
      }
    },
    sleep: async () => {
      calls.push("wait");
    },
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        throw new Error("recovery must not redispatch");
      },
      listDispatch: async (room) => {
        calls.push("dispatch");
        return [{ id: "dispatch-1", room, agentName: "demo-agent" }];
      },
    }),
    roomServiceClientFactory: () => ({
      createRoom: async () => undefined,
      listParticipants: async () => {
        calls.push("participants");
        return (checks.shift() ?? []).map((participant) => ({
          ...participant,
          state: 1,
          joinedAtMs: BigInt(0),
        }));
      },
    }),
    now: () => new Date("2026-07-09T12:01:00.000Z"),
  });

  const result = await provider.issuePublicDemoToken({
    agentName: "demo-agent",
    identity: "demo-opaque",
    roomName: "demo-room",
    observedAt: new Date("2026-07-09T12:01:00.000Z"),
    expiresAt: new Date("2026-07-09T12:02:00.000Z"),
    env: {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://test.livekit.cloud",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    "dispatch",
    "participants",
    "wait",
    "participants",
    "dispatch",
    "token",
  ]);
});

test("public demo recovery withholds tokens and cleans up invalid dispatches", async (t) => {
  const cases: Array<{
    name: string;
    dispatches: Array<{ id: string; room: string; agentName: string }>;
  }> = [
    { name: "missing dispatch", dispatches: [] },
    {
      name: "missing dispatch id",
      dispatches: [{ id: "", room: "demo-room", agentName: "demo-agent" }],
    },
    {
      name: "wrong agent",
      dispatches: [
        { id: "dispatch-1", room: "demo-room", agentName: "other-agent" },
      ],
    },
    {
      name: "wrong room",
      dispatches: [
        {
          id: "dispatch-1",
          room: "different-room",
          agentName: "demo-agent",
        },
      ],
    },
    {
      name: "multiple dispatches",
      dispatches: [
        { id: "dispatch-1", room: "demo-room", agentName: "demo-agent" },
        { id: "dispatch-2", room: "demo-room", agentName: "demo-agent" },
      ],
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const calls: string[] = [];
      const provider = createLiveKitPublicDemoProvider({
        accessTokenFactory: class {
          addGrant() {
            calls.push("grant");
          }
          async toJwt() {
            calls.push("token");
            return demoJwtWithExpiration("2026-07-09T12:02:00.000Z");
          }
        },
        agentDispatchClientFactory: () => ({
          createDispatch: async () => {
            calls.push("redispatch");
            throw new Error("recovery must not redispatch");
          },
          listDispatch: async () => {
            calls.push("dispatch");
            return scenario.dispatches;
          },
        }),
        roomServiceClientFactory: () => ({
          createRoom: async () => undefined,
          listParticipants: async () => [
            {
              identity: "demo-agent",
              kind: 4,
              state: 1,
              joinedAtMs: BigInt(0),
            },
          ],
          deleteRoom: async () => {
            calls.push("delete");
          },
        }),
        now: () => new Date("2026-07-09T12:01:00.000Z"),
      });

      const result = await provider.issuePublicDemoToken({
        agentName: "demo-agent",
        identity: "demo-opaque",
        roomName: "demo-room",
        observedAt: new Date("2026-07-09T12:01:00.000Z"),
        expiresAt: new Date("2026-07-09T12:02:00.000Z"),
        env: {
          apiKey: "key",
          apiSecret: "secret",
          url: "wss://test.livekit.cloud",
        },
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "livekit_demo_dispatch_invalid");
      }
      assert.deepEqual(calls, ["dispatch", "delete"]);
    });
  }
});

test("public demo recovery treats dispatch verification errors as retryable without deleting", async () => {
  const calls: string[] = [];
  const provider = createLiveKitPublicDemoProvider({
    accessTokenFactory: class {
      addGrant() {
        calls.push("grant");
      }
      async toJwt() {
        calls.push("token");
        return "must-not-mint";
      }
    },
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        throw new Error("recovery must not redispatch");
      },
      listDispatch: async () => {
        calls.push("dispatch");
        throw new Error("provider unavailable");
      },
    }),
    roomServiceClientFactory: () => ({
      createRoom: async () => undefined,
      listParticipants: async () => [
        { identity: "demo-agent", kind: 4, state: 1, joinedAtMs: BigInt(0) },
      ],
      deleteRoom: async () => {
        calls.push("delete");
      },
    }),
    now: () => new Date("2026-07-09T12:01:00.000Z"),
  });

  const result = await provider.issuePublicDemoToken({
    agentName: "demo-agent",
    identity: "demo-opaque",
    roomName: "demo-room",
    observedAt: new Date("2026-07-09T12:01:00.000Z"),
    expiresAt: new Date("2026-07-09T12:02:00.000Z"),
    env: {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://test.livekit.cloud",
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_demo_dispatch_verify_failed");
    assert.equal(result.error.retryable, true);
  }
  assert.deepEqual(calls, ["dispatch"]);
});

test("public demo recovery reports cleanup failure without minting a token", async () => {
  const calls: string[] = [];
  const provider = createLiveKitPublicDemoProvider({
    accessTokenFactory: class {
      addGrant() {
        calls.push("grant");
      }
      async toJwt() {
        calls.push("token");
        return "must-not-mint";
      }
    },
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        throw new Error("recovery must not redispatch");
      },
      listDispatch: async () => {
        calls.push("dispatch");
        return [];
      },
    }),
    roomServiceClientFactory: () => ({
      createRoom: async () => undefined,
      listParticipants: async () => [
        { identity: "demo-agent", kind: 4, state: 1, joinedAtMs: BigInt(0) },
      ],
      deleteRoom: async () => {
        calls.push("delete");
        throw new Error("cleanup unavailable");
      },
    }),
    now: () => new Date("2026-07-09T12:01:00.000Z"),
  });

  const result = await provider.issuePublicDemoToken({
    agentName: "demo-agent",
    identity: "demo-opaque",
    roomName: "demo-room",
    observedAt: new Date("2026-07-09T12:01:00.000Z"),
    expiresAt: new Date("2026-07-09T12:02:00.000Z"),
    env: {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://test.livekit.cloud",
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_demo_cleanup_failed");
  }
  assert.deepEqual(calls, ["dispatch", "delete"]);
});

test("public demo recovery checks dispatch before participant readiness", async () => {
  const calls: string[] = [];
  const provider = createLiveKitPublicDemoProvider({
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        throw new Error("recovery must not redispatch");
      },
      listDispatch: async () => {
        calls.push("dispatch");
        return [];
      },
    }),
    roomServiceClientFactory: () => ({
      createRoom: async () => undefined,
      listParticipants: async () => {
        calls.push("participants");
        return [];
      },
      deleteRoom: async () => {
        calls.push("delete");
      },
    }),
  });

  const result = await provider.issuePublicDemoToken({
    agentName: "demo-agent",
    identity: "demo-opaque",
    roomName: "demo-room",
    observedAt: new Date("2026-07-09T12:01:00.000Z"),
    expiresAt: new Date("2026-07-09T12:02:00.000Z"),
    env: {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://test.livekit.cloud",
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_demo_dispatch_invalid");
  }
  assert.deepEqual(calls, ["dispatch", "delete"]);
});

test("public demo provider refuses initial and recovery tokens at or past the absolute deadline", async () => {
  const calls: string[] = [];
  const provider = createLiveKitPublicDemoProvider({
    accessTokenFactory: class {
      addGrant() {
        calls.push("grant");
      }
      async toJwt() {
        calls.push("token");
        return "must-not-mint";
      }
    },
    now: () => new Date("2026-07-09T12:02:00.000Z"),
    roomServiceClientFactory: () => ({
      createRoom: async () => {
        calls.push("room");
      },
      deleteRoom: async () => {
        calls.push("delete");
      },
      listParticipants: async () => [
        { identity: "demo-agent", kind: 4, state: 1, joinedAtMs: BigInt(0) },
      ],
    }),
    agentDispatchClientFactory: () => ({
      createDispatch: async (room, agentName) => {
        calls.push("dispatch");
        return { id: "dispatch-1", room, agentName };
      },
      listDispatch: async (room) => [
        { id: "dispatch-1", room, agentName: "demo-agent" },
      ],
    }),
  });
  const deadlineInput = {
    agentName: "demo-agent",
    identity: "demo-opaque",
    roomName: "demo-room",
    observedAt: new Date("2026-07-09T12:02:00.000Z"),
    expiresAt: new Date("2026-07-09T12:02:00.000Z"),
    env: {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://test.livekit.cloud",
    },
  };

  const recovery = await provider.issuePublicDemoToken(deadlineInput);
  assert.equal(recovery.ok, false);
  if (!recovery.ok) {
    assert.equal(recovery.error.code, "livekit_demo_token_deadline_invalid");
  }
  assert.deepEqual(calls, []);
});

test("public demo provider withholds a delayed signed token that crosses the persisted deadline", async () => {
  let now = new Date("2026-07-09T12:00:00.000Z");
  const provider = createLiveKitPublicDemoProvider({
    accessTokenFactory: class {
      addGrant() {}
      async toJwt() {
        now = new Date("2026-07-09T12:00:02.000Z");
        return demoJwtWithExpiration("2026-07-09T12:02:02.000Z");
      }
    },
    now: () => now,
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        throw new Error("recovery must not redispatch");
      },
      listDispatch: async (room) => [
        { id: "dispatch-1", room, agentName: "demo-agent" },
      ],
    }),
    roomServiceClientFactory: () => ({
      createRoom: async () => undefined,
      listParticipants: async () => [
        { identity: "demo-agent", kind: 4, state: 1, joinedAtMs: BigInt(0) },
      ],
    }),
  });

  const result = await provider.issuePublicDemoToken({
    agentName: "demo-agent",
    identity: "demo-opaque",
    roomName: "demo-room",
    observedAt: new Date("2026-07-09T12:00:00.000Z"),
    expiresAt: new Date("2026-07-09T12:02:00.000Z"),
    env: {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://test.livekit.cloud",
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_demo_token_deadline_invalid");
  }
});

function demoJwtWithExpiration(expiresAt: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
    "base64url"
  );
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(new Date(expiresAt).getTime() / 1_000) })
  ).toString("base64url");
  return `${header}.${payload}.signature`;
}

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

test("Supabase identity helpers normalize public, direct, and pooler targets", () => {
  const projectRef = "previewpreviewprevie";
  assert.equal(
    inferSupabaseProjectRef(`https://${projectRef}.supabase.co`),
    projectRef
  );
  assert.equal(
    inferSupabaseDatabaseProjectRef(
      `postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres`
    ),
    projectRef
  );
  assert.equal(
    inferSupabaseDatabaseProjectRef(
      `postgresql://postgres.${projectRef}:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
    ),
    projectRef
  );
  assert.equal(isSupabaseProjectRef(projectRef), true);
  assert.equal(inferSupabaseProjectRef("https://example.com"), undefined);
  assert.equal(
    inferSupabaseDatabaseProjectRef("postgresql://localhost/meelni"),
    undefined
  );
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
    LIVEKIT_INTERVIEW_AGENT_NAME: " interview-agent-prod ",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data, {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://server.livekit.cloud",
      interviewAgentName: "interview-agent-prod",
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

test("LiveKit provider creates and reconciles one atomically named interview dispatch", async () => {
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
        const agent = input.agents?.[0];
        dispatches.push({
          id: "dispatch-1",
          room: input.name,
          agentName: agent?.agentName ?? "",
        });
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
    assert.equal(result.data.roomName, fixture.input.roomName);
    assert.equal(result.data.url, fixture.input.env.url);
    assert.ok(result.data.token);
  }
  assert.deepEqual(calls, ["room", "list-dispatch"]);
  assert.equal(calls.includes("dispatch"), false);
  assert.equal(roomInputs.length, 1);
  const roomInput = roomInputs[0] as {
    name: string;
    metadata: string;
    emptyTimeout: number;
    maxParticipants: number;
    departureTimeout: number;
    agents: Array<{ agentName: string }>;
  };
  assert.equal(roomInput.name, fixture.input.roomName);
  assert.equal(roomInput.metadata, JSON.stringify(fixture.input.metadata));
  assert.equal(roomInput.emptyTimeout, 3600);
  assert.equal(roomInput.maxParticipants, 2);
  assert.equal(roomInput.departureTimeout, 60);
  assert.equal(roomInput.agents.length, 1);
  assert.equal(roomInput.agents[0].agentName, fixture.input.agentName);
});

test("LiveKit provider keeps exact agent job metadata private from room metadata", async () => {
  const fixture = createLiveKitStartFixture();
  const agentMetadata = JSON.stringify({
    contract_version: "private-job-metadata.v1",
    worker_evidence_capability: "private-worker-capability",
  });
  const roomInputs: unknown[] = [];
  const provider = createLiveKitInterviewProvider({
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        throw new Error("atomic dispatch must not create a second dispatch");
      },
      listDispatch: async () => [
        {
          id: "dispatch-1",
          room: fixture.input.roomName,
          agentName: fixture.input.agentName,
          metadata: agentMetadata,
        },
      ],
    }),
    roomServiceClientFactory: () => ({
      createRoom: async (input) => {
        roomInputs.push(input);
      },
      listRooms: async () => [
        {
          name: fixture.input.roomName,
          metadata: JSON.stringify(fixture.input.metadata),
        },
      ],
    }),
  });

  const result = await provider.startInterviewRoom({
    ...fixture.input,
    agentMetadata,
  });

  assert.equal(result.ok, true);
  const roomInput = roomInputs[0] as {
    metadata: string;
    agents: Array<{ agentName: string; metadata?: string }>;
  };
  assert.equal(roomInput.metadata, JSON.stringify(fixture.input.metadata));
  assert.equal(roomInput.metadata.includes("private-worker-capability"), false);
  assert.equal(roomInput.agents[0].metadata, agentMetadata);
});

test("LiveKit provider rejects invalid or conflicting agent job metadata", async () => {
  const fixture = createLiveKitStartFixture();
  let roomCalls = 0;
  const invalidProvider = createLiveKitInterviewProvider({
    roomServiceClientFactory: () => ({
      createRoom: async () => {
        roomCalls += 1;
      },
    }),
  });
  const invalid = await invalidProvider.startInterviewRoom({
    ...fixture.input,
    agentMetadata: "",
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.error.code, "livekit_agent_dispatch_metadata_invalid");
    assert.equal(invalid.error.retryable, false);
  }
  assert.equal(roomCalls, 0);

  const provider = createLiveKitInterviewProvider({
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        throw new Error("must-not-create");
      },
      listDispatch: async () => [
        {
          id: "dispatch-1",
          room: fixture.input.roomName,
          agentName: fixture.input.agentName,
          metadata: "different-private-job",
        },
      ],
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
  const conflict = await provider.startInterviewRoom({
    ...fixture.input,
    agentMetadata: "expected-private-job",
  });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) {
    assert.equal(conflict.error.code, "livekit_agent_dispatch_conflict");
    assert.equal(conflict.error.retryable, false);
  }
});

test("LiveKit provider reports separate room and dispatch stage timings", async () => {
  const fixture = createLiveKitStartFixture();
  const stages: Array<[string, string, number]> = [];
  let clock = 0;
  const provider = createLiveKitInterviewProvider({
    monotonicNow: () => (clock += 25),
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        throw new Error("atomic dispatch must not create a second dispatch");
      },
      listDispatch: async () => [
        {
          id: "dispatch-1",
          room: fixture.input.roomName,
          agentName: fixture.input.agentName,
        },
      ],
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

  const result = await provider.startInterviewRoom({
    ...fixture.input,
    onStage: (stage, outcome, durationMs) => {
      stages.push([stage, outcome, durationMs]);
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(stages, [
    ["room_create", "succeeded", 25],
    ["room_verification", "succeeded", 25],
    ["dispatch_verification", "succeeded", 25],
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

test("LiveKit provider rejects unnamed dispatches created by an automatic worker", async () => {
  const fixture = createLiveKitStartFixture();
  const provider = createLiveKitInterviewProvider({
    agentDispatchClientFactory: () => ({
      listDispatch: async () => [
        {
          id: "dispatch-automatic",
          room: fixture.input.roomName,
          agentName: "",
        },
      ],
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
      listDispatch: async () => [],
      createDispatch: async () => {
        calls.push("dispatch");
        return { id: "dispatch-id", agentName: "agent", room: "room" };
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

test("a token that expires while its signer is delayed is withheld", async () => {
  const observedAt = new Date("2026-07-10T08:00:00.000Z");
  const tokenExpiresAt = new Date("2026-07-10T08:00:02.000Z");
  const deadlineAt = new Date("2026-07-10T08:05:00.000Z");
  const clock = [observedAt, new Date("2026-07-10T08:00:03.000Z")];
  const result = await issueInterviewParticipantToken(
    {
      identity: "authenticated-user-id",
      participantName: "Candidate",
      roomName: "interview-server-owned-room",
      ttlSeconds: 300,
      observedAt,
      expiresAt: deadlineAt,
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    },
    {
      now: () => clock.shift() ?? clock[0]!,
      accessTokenFactory: class {
        addGrant() {}
        async toJwt() {
          return jwtWithExpiration(
            Math.floor(tokenExpiresAt.getTime() / 1_000)
          );
        }
      },
    }
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_token_expiry_invalid");
  }
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

test("LiveKit room termination uses provider-time revocation before deleting the room", async () => {
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
      env,
    },
    {
      now: () => new Date("1970-01-01T00:00:00.000Z"),
      roomServiceClientFactory: () => ({
        createRoom: async () => undefined,
        removeParticipant: async (roomName, identity, options) => {
          assert.equal(options, undefined);
          calls.push(`revoke:${roomName}:${identity}:provider-time`);
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
    "revoke:interview-deadline-room:candidate-id:provider-time",
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

test("LiveKit reliable server data targets only the exact runtime identity and topic", async () => {
  const payload = new TextEncoder().encode(
    '{"event_type":"runtime_settlement_request"}'
  );
  const result = await sendReliableInterviewRoomData(
    {
      roomName: "interview-reconnect-room",
      destinationIdentity: "agent-worker",
      topic: "meelni.transcript.settlement.request",
      data: payload,
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
      },
    },
    {
      roomServiceClientFactory: () => ({
        createRoom: async () => undefined,
        sendData: async (roomName, data, kind, options) => {
          assert.equal(roomName, "interview-reconnect-room");
          assert.deepEqual(data, payload);
          assert.equal(kind, 0);
          assert.deepEqual(options, {
            destinationIdentities: ["agent-worker"],
            topic: "meelni.transcript.settlement.request",
          });
        },
      }),
    }
  );

  assert.deepEqual(result, {
    ok: true,
    provider: "livekit",
    data: {
      roomName: "interview-reconnect-room",
      destinationIdentity: "agent-worker",
      topic: "meelni.transcript.settlement.request",
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
    interviewAgentName: "meelni-interview-agent",
  };
  for (const state of [0, 1, 2]) {
    const result = await inspectInterviewParticipantPresence(
      {
        roomName: "interview-presence-room",
        participantIdentity: "candidate-id",
        env,
      },
      {
        agentDispatchClientFactory: () => ({
          createDispatch: async () => {
            throw new Error("presence inspection must not create a dispatch");
          },
          listDispatch: async () => [],
        }),
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
      assert.equal(result.data.roomPresent, true);
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
      agentDispatchClientFactory: () => ({
        createDispatch: async () => {
          throw new Error("presence inspection must not create a dispatch");
        },
        listDispatch: async () => [],
      }),
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
    data: {
      roomPresent: true,
      present: false,
      joined: false,
      joinedAt: null,
      agent: null,
      targetSource: "none",
      targetReason: "dispatch_absent",
    },
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
        interviewAgentName: "meelni-interview-agent",
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
            attributes: { "lk.agent.name": "meelni-interview-agent" },
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

test("LiveKit presence preserves candidate facts but never targets without a configured interview agent name", async (t) => {
  for (const fixture of [
    {
      name: "missing name cannot authorize the sole named agent",
      interviewAgentName: undefined,
      includeAgent: true,
    },
    {
      name: "blank name cannot authorize the sole named agent",
      interviewAgentName: "   ",
      includeAgent: true,
    },
    {
      name: "missing name cannot authorize a running dispatch fallback",
      interviewAgentName: undefined,
      includeAgent: false,
    },
  ]) {
    await t.test(fixture.name, async () => {
      let dispatchInspected = false;
      const participants: ParticipantInfo[] = [
        new ParticipantInfo({
          identity: "candidate-id",
          state: ParticipantInfo_State.ACTIVE,
          joinedAtMs: BigInt(1_783_670_430_000),
          kind: ParticipantInfo_Kind.STANDARD,
        }),
      ];
      if (fixture.includeAgent) {
        participants.push(
          new ParticipantInfo({
            identity: "agent-worker",
            state: ParticipantInfo_State.ACTIVE,
            joinedAtMs: BigInt(1_783_670_430_001),
            kind: ParticipantInfo_Kind.AGENT,
            attributes: { "lk.agent.name": "meelni-interview-agent" },
          })
        );
      }
      const result = await inspectInterviewParticipantPresence(
        {
          roomName: "interview-presence-room",
          participantIdentity: "candidate-id",
          env: {
            apiKey: "key",
            apiSecret: "secret",
            url: "wss://test.livekit.cloud",
            interviewAgentName: fixture.interviewAgentName,
          },
        },
        {
          roomServiceClientFactory: () => ({
            createRoom: async () => undefined,
            listParticipants: async () => participants,
          }),
          agentDispatchClientFactory: () => ({
            createDispatch: async () => {
              throw new Error("presence inspection must not create a dispatch");
            },
            listDispatch: async () => {
              dispatchInspected = true;
              return [runningDispatch()];
            },
          }),
        }
      );

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.present, true);
        assert.equal(result.data.joined, true);
        assert.equal(result.data.agent, null);
        assert.equal(result.data.targetSource, "none");
        assert.equal(result.data.targetReason, "agent_projection_invalid");
      }
      assert.equal(dispatchInspected, false);
    });
  }
});

test("LiveKit presence resolves a uniquely running room dispatch when the agent participant projection is transiently absent", async () => {
  const calls: string[] = [];
  const result = await inspectInterviewParticipantPresence(
    {
      roomName: "interview-presence-room",
      participantIdentity: "candidate-id",
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
        interviewAgentName: "meelni-interview-agent",
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
            kind: 0,
          },
        ],
      }),
      agentDispatchClientFactory: () => ({
        createDispatch: async () => {
          throw new Error("presence inspection must not create a dispatch");
        },
        listDispatch: async (room) => {
          calls.push(`dispatch:${room}`);
          return [
            runningDispatch({
              room,
              identity: "agent-AJ_provider_owned",
            }),
          ];
        },
      }),
    }
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.agent?.identity, "agent-AJ_provider_owned");
    assert.equal(result.data.agent?.joinedAt, null);
    assert.equal(result.data.targetSource, "dispatch");
    assert.equal(result.data.targetReason, "dispatch_exact");
  }
  assert.deepEqual(calls, ["dispatch:interview-presence-room"]);
});

test("LiveKit presence never guesses across multiple active provider agents", async () => {
  let dispatchInspected = false;
  const result = await inspectInterviewParticipantPresence(
    {
      roomName: "interview-presence-room",
      participantIdentity: "candidate-id",
      env: {
        apiKey: "key",
        apiSecret: "secret",
        url: "wss://test.livekit.cloud",
        interviewAgentName: "meelni-interview-agent",
      },
    },
    {
      roomServiceClientFactory: () => ({
        createRoom: async () => undefined,
        listParticipants: async () => [
          {
            identity: "agent-one",
            state: 2,
            joinedAtMs: BigInt(1),
            kind: 4,
          },
          {
            identity: "agent-two",
            state: 2,
            joinedAtMs: BigInt(2),
            kind: 4,
          },
        ],
      }),
      agentDispatchClientFactory: () => ({
        createDispatch: async () => {
          throw new Error("presence inspection must not create a dispatch");
        },
        listDispatch: async () => {
          dispatchInspected = true;
          return [];
        },
      }),
    }
  );

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.agent, null);
  assert.equal(dispatchInspected, false);
});

test("LiveKit presence fails closed for a wrong named or dispatch-mismatched agent", async (t) => {
  const env = {
    apiKey: "key",
    apiSecret: "secret",
    url: "wss://test.livekit.cloud",
    interviewAgentName: "meelni-interview-agent",
  };

  await t.test("wrong projected agent name", async () => {
    let dispatchInspected = false;
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
              identity: "agent-wrong-name",
              state: 2,
              joinedAtMs: BigInt(1),
              kind: 4,
              attributes: { "lk.agent.name": "another-agent" },
            },
          ],
        }),
        agentDispatchClientFactory: () => ({
          createDispatch: async () => {
            throw new Error("presence inspection must not create a dispatch");
          },
          listDispatch: async () => {
            dispatchInspected = true;
            return [];
          },
        }),
      }
    );

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.agent, null);
    assert.equal(dispatchInspected, false);
  });

  await t.test(
    "projected identity disagrees with running dispatch",
    async () => {
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
                identity: "agent-projected",
                state: 2,
                joinedAtMs: BigInt(1),
                kind: 4,
              },
            ],
          }),
          agentDispatchClientFactory: () => ({
            createDispatch: async () => {
              throw new Error("presence inspection must not create a dispatch");
            },
            listDispatch: async (room) => [
              {
                id: "dispatch-1",
                room,
                agentName: "meelni-interview-agent",
                state: {
                  jobs: [
                    {
                      state: {
                        status: 1,
                        participantIdentity: "agent-dispatch",
                      },
                    },
                  ],
                },
              },
            ],
          }),
        }
      );

      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.data.agent, null);
    }
  );
});

test("LiveKit dispatch fallback normalizes real protocol history and fails closed for poisoned current projections", async (t) => {
  const exactLimitIdentity = "a".repeat(256);
  const cases: Array<{
    name: string;
    dispatches: AgentDispatch[];
    expectedIdentity: string | null;
    expectedReason?: string;
  }> = [
    {
      name: "accepts one exact running room job without a participant projection",
      dispatches: [runningDispatch()],
      expectedIdentity: "agent-current",
      expectedReason: "dispatch_exact",
    },
    {
      name: "accepts terminal dispatch history plus one exact running room job",
      dispatches: [
        runningDispatch({ id: "dispatch-deleted", deletedAt: BigInt(2) }),
        runningDispatch({
          id: "dispatch-finished",
          jobStatus: JobStatus.JS_SUCCESS,
          endedAt: BigInt(3),
        }),
        runningDispatch({ identity: exactLimitIdentity }),
      ],
      expectedIdentity: exactLimitIdentity,
      expectedReason: "dispatch_exact",
    },
    {
      name: "ignores deleted dispatch history without requiring a retained job",
      dispatches: [
        deletedDispatchWithoutJobs(),
        runningDispatch({ identity: exactLimitIdentity }),
      ],
      expectedIdentity: exactLimitIdentity,
      expectedReason: "dispatch_exact",
    },
    {
      name: "rejects terminal and current jobs inside one room dispatch",
      dispatches: [dispatchWithTerminalJobHistory()],
      expectedIdentity: null,
      expectedReason: "dispatch_projection_invalid",
    },
    {
      name: "rejects two running jobs inside one room dispatch",
      dispatches: [dispatchWithSecondRunningJob()],
      expectedIdentity: null,
      expectedReason: "dispatch_projection_invalid",
    },
    {
      name: "rejects a 257-byte identity",
      dispatches: [runningDispatch({ identity: "a".repeat(257) })],
      expectedIdentity: null,
      expectedReason: "dispatch_projection_invalid",
    },
    {
      name: "rejects multiple running dispatches",
      dispatches: [
        runningDispatch({ id: "dispatch-1", identity: "agent-one" }),
        runningDispatch({ id: "dispatch-2", identity: "agent-two" }),
      ],
      expectedIdentity: null,
      expectedReason: "dispatch_ambiguous",
    },
    {
      name: "rejects pending plus running contenders",
      dispatches: [
        runningDispatch({
          id: "dispatch-pending",
          jobStatus: JobStatus.JS_PENDING,
          identity: "",
        }),
        runningDispatch({ id: "dispatch-running" }),
      ],
      expectedIdentity: null,
      expectedReason: "dispatch_ambiguous",
    },
    {
      name: "rejects a malformed dispatch default instead of treating it as current",
      dispatches: [
        Object.assign(runningDispatch(), {
          state: {
            deletedAt: undefined,
            jobs: runningDispatch().state?.jobs ?? [],
          },
        }) as unknown as AgentDispatch,
      ],
      expectedIdentity: null,
      expectedReason: "dispatch_projection_invalid",
    },
    {
      name: "rejects a poisoned dispatch deleted-at type",
      dispatches: [
        Object.assign(runningDispatch(), {
          state: {
            deletedAt: "0",
            jobs: runningDispatch().state?.jobs ?? [],
          },
        }) as unknown as AgentDispatch,
      ],
      expectedIdentity: null,
      expectedReason: "dispatch_projection_invalid",
    },
    {
      name: "rejects a running job with a poisoned ended-at default",
      dispatches: [runningDispatchWithJobPoison({ endedAt: undefined })],
      expectedIdentity: null,
      expectedReason: "dispatch_projection_invalid",
    },
    {
      name: "rejects a running job with a poisoned ended-at type",
      dispatches: [runningDispatchWithJobPoison({ endedAt: "0" })],
      expectedIdentity: null,
      expectedReason: "dispatch_projection_invalid",
    },
    {
      name: "does not ignore malformed terminal history",
      dispatches: [
        runningDispatch({
          id: "dispatch-malformed-terminal",
          jobStatus: JobStatus.JS_SUCCESS,
          endedAt: BigInt(3),
          jobDispatchId: "another-dispatch",
        }),
        runningDispatch({ id: "dispatch-running" }),
      ],
      expectedIdentity: null,
      expectedReason: "dispatch_ambiguous",
    },
    {
      name: "does not ignore terminal status with a default ended-at timestamp",
      dispatches: [
        runningDispatch({
          id: "dispatch-inconsistent-terminal",
          jobStatus: JobStatus.JS_SUCCESS,
          endedAt: BigInt(0),
        }),
        runningDispatch({ id: "dispatch-running" }),
      ],
      expectedIdentity: null,
      expectedReason: "dispatch_ambiguous",
    },
    {
      name: "rejects a wrong nested dispatch binding",
      dispatches: [runningDispatch({ jobDispatchId: "another-dispatch" })],
      expectedIdentity: null,
      expectedReason: "dispatch_projection_invalid",
    },
    {
      name: "rejects a wrong nested room binding",
      dispatches: [runningDispatchWithJobPoison({ room: "another-room" })],
      expectedIdentity: null,
      expectedReason: "dispatch_projection_invalid",
    },
    {
      name: "rejects a missing running job identity",
      dispatches: [runningDispatch({ identity: "" })],
      expectedIdentity: null,
      expectedReason: "dispatch_projection_invalid",
    },
    {
      name: "rejects the wrong job type",
      dispatches: [runningDispatch({ jobType: JobType.JT_PUBLISHER })],
      expectedIdentity: null,
      expectedReason: "dispatch_projection_invalid",
    },
    {
      name: "rejects a wrong-kind optional job participant projection",
      dispatches: [
        runningDispatch({
          participant: new ParticipantInfo({
            identity: "agent-current",
            kind: ParticipantInfo_Kind.STANDARD,
            state: ParticipantInfo_State.ACTIVE,
          }),
        }),
      ],
      expectedIdentity: null,
      expectedReason: "dispatch_projection_invalid",
    },
    {
      name: "rejects a disconnected optional job participant projection",
      dispatches: [
        runningDispatch({
          participant: new ParticipantInfo({
            identity: "agent-current",
            kind: ParticipantInfo_Kind.AGENT,
            state: ParticipantInfo_State.DISCONNECTED,
          }),
        }),
      ],
      expectedIdentity: null,
      expectedReason: "dispatch_projection_invalid",
    },
    {
      name: "rejects a participant projection on a room job even when internally consistent",
      dispatches: [
        runningDispatch({
          participant: new ParticipantInfo({
            identity: "agent-current",
            kind: ParticipantInfo_Kind.AGENT,
            state: ParticipantInfo_State.ACTIVE,
            attributes: { "lk.agent.name": "meelni-interview-agent" },
          }),
        }),
      ],
      expectedIdentity: null,
      expectedReason: "dispatch_projection_invalid",
    },
    {
      name: "rejects a mismatched optional job participant projection",
      dispatches: [
        runningDispatch({
          participant: new ParticipantInfo({
            identity: "another-agent",
            kind: 4,
            state: 2,
            attributes: { "lk.agent.name": "meelni-interview-agent" },
          }),
        }),
      ],
      expectedIdentity: null,
      expectedReason: "dispatch_projection_invalid",
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const result = await inspectInterviewParticipantPresence(
        {
          roomName: "interview-presence-room",
          participantIdentity: "candidate-id",
          env: {
            apiKey: "key",
            apiSecret: "secret",
            url: "wss://test.livekit.cloud",
            interviewAgentName: "meelni-interview-agent",
          },
        },
        {
          roomServiceClientFactory: () => ({
            createRoom: async () => undefined,
            listParticipants: async () => [],
          }),
          agentDispatchClientFactory: () => ({
            createDispatch: async () => {
              throw new Error("presence inspection must not create a dispatch");
            },
            listDispatch: async () => fixture.dispatches,
          }),
        }
      );

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(
          result.data.agent?.identity ?? null,
          fixture.expectedIdentity
        );
        if (fixture.expectedReason) {
          assert.equal(result.data.targetReason, fixture.expectedReason);
        }
      }
    });
  }
});

test("LiveKit presence rejects malformed active agent projections before exact targeting", async (t) => {
  for (const fixture of [
    { name: "blank identity", identity: "" },
    { name: "overbound identity", identity: "a".repeat(257) },
    { name: "non-string identity", identity: 42 },
  ]) {
    await t.test(fixture.name, async () => {
      let dispatchInspected = false;
      const result = await inspectInterviewParticipantPresence(
        {
          roomName: "interview-presence-room",
          participantIdentity: "candidate-id",
          env: {
            apiKey: "key",
            apiSecret: "secret",
            url: "wss://test.livekit.cloud",
            interviewAgentName: "meelni-interview-agent",
          },
        },
        {
          roomServiceClientFactory: () => ({
            createRoom: async () => undefined,
            listParticipants: async () => [
              {
                identity: fixture.identity,
                state: ParticipantInfo_State.ACTIVE,
                joinedAtMs: BigInt(1),
                kind: ParticipantInfo_Kind.AGENT,
              } as unknown as ParticipantInfo,
              new ParticipantInfo({
                identity: "valid-but-must-not-authorize",
                state: ParticipantInfo_State.ACTIVE,
                joinedAtMs: BigInt(2),
                kind: ParticipantInfo_Kind.AGENT,
                attributes: {
                  "lk.agent.name": "meelni-interview-agent",
                },
              }),
            ],
          }),
          agentDispatchClientFactory: () => ({
            createDispatch: async () => {
              throw new Error("presence inspection must not create a dispatch");
            },
            listDispatch: async () => {
              dispatchInspected = true;
              return [runningDispatch()];
            },
          }),
        }
      );

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.agent, null);
        assert.equal(result.data.targetSource, "none");
        assert.equal(result.data.targetReason, "agent_projection_invalid");
      }
      assert.equal(dispatchInspected, false);
    });
  }
});

function runningDispatch({
  id = "dispatch-current",
  room = "interview-presence-room",
  agentName = "meelni-interview-agent",
  identity = "agent-current",
  deletedAt = BigInt(0),
  jobStatus = JobStatus.JS_RUNNING,
  endedAt = BigInt(0),
  jobDispatchId = id,
  jobType = JobType.JT_ROOM,
  participant,
}: {
  id?: string;
  room?: string;
  agentName?: string;
  identity?: string;
  deletedAt?: bigint;
  jobStatus?: JobStatus;
  endedAt?: bigint;
  jobDispatchId?: string;
  jobType?: JobType;
  participant?: ParticipantInfo;
} = {}): AgentDispatch {
  return new AgentDispatch({
    id,
    room,
    agentName,
    state: {
      deletedAt,
      jobs: [
        new Job({
          id: `${id}-job`,
          dispatchId: jobDispatchId,
          type: jobType,
          room: new Room({ name: room }),
          agentName,
          participant,
          state: new JobState({
            status: jobStatus,
            endedAt,
            participantIdentity: identity,
          }),
        }),
      ],
    },
  });
}

function runningDispatchWithJobPoison(input: {
  endedAt?: unknown;
  room?: string;
}): AgentDispatch {
  const dispatch = runningDispatch();
  assert.ok(dispatch.state);
  const job = dispatch.state.jobs[0];
  assert.ok(job);
  assert.ok(job.state);
  if ("endedAt" in input) {
    Object.assign(job.state, { endedAt: input.endedAt });
  }
  if (input.room) {
    job.room = new Room({ name: input.room });
  }
  return dispatch;
}

function dispatchWithTerminalJobHistory(): AgentDispatch {
  const dispatch = runningDispatch({ id: "dispatch-with-history" });
  assert.ok(dispatch.state);
  dispatch.state.jobs.unshift(
    new Job({
      id: "dispatch-with-history-terminal-job",
      dispatchId: dispatch.id,
      type: JobType.JT_ROOM,
      room: new Room({ name: dispatch.room }),
      agentName: dispatch.agentName,
      state: new JobState({
        status: JobStatus.JS_SUCCESS,
        endedAt: BigInt(3),
        participantIdentity: "agent-terminal",
      }),
    })
  );
  return dispatch;
}

function dispatchWithSecondRunningJob(): AgentDispatch {
  const dispatch = runningDispatch({ id: "dispatch-with-two-running-jobs" });
  assert.ok(dispatch.state);
  dispatch.state.jobs.push(
    new Job({
      id: "dispatch-with-two-running-jobs-second-job",
      dispatchId: dispatch.id,
      type: JobType.JT_ROOM,
      room: new Room({ name: dispatch.room }),
      agentName: dispatch.agentName,
      state: new JobState({
        status: JobStatus.JS_RUNNING,
        endedAt: BigInt(0),
        participantIdentity: "agent-second",
      }),
    })
  );
  return dispatch;
}

function deletedDispatchWithoutJobs(): AgentDispatch {
  return new AgentDispatch({
    id: "dispatch-deleted-without-jobs",
    room: "interview-presence-room",
    agentName: "meelni-interview-agent",
    state: {
      deletedAt: BigInt(2),
      jobs: [],
    },
  });
}

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
    data: {
      roomPresent: false,
      present: false,
      joined: false,
      joinedAt: null,
      agent: null,
      targetSource: "none",
      targetReason: "agent_absent",
    },
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
