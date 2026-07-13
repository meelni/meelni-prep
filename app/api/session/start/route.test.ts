import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accessTokenConstructions: 0,
  dispatchClientConstructions: 0,
  roomClientConstructions: 0,
  createClient: vi.fn(),
  resolveReactivationAccess: vi.fn(),
  startInterviewSessionWorkflow: vi.fn(),
}));

vi.mock("livekit-server-sdk", () => ({
  AccessToken: class AccessTokenMock {
    constructor() {
      mocks.accessTokenConstructions += 1;
    }
  },
  AgentDispatchClient: class AgentDispatchClientMock {
    constructor() {
      mocks.dispatchClientConstructions += 1;
    }
  },
  RoomServiceClient: class RoomServiceClientMock {
    constructor() {
      mocks.roomClientConstructions += 1;
    }
  },
  TrackSource: { MICROPHONE: 1 },
  WebhookReceiver: class WebhookReceiverMock {},
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/feature-flags/reactivation-access", () => ({
  resolveReactivationAccess: mocks.resolveReactivationAccess,
}));

vi.mock("@/lib/workflows/start-session", () => ({
  startInterviewSessionWorkflow: mocks.startInterviewSessionWorkflow,
}));

import { POST } from "./route";

const ENV_KEYS = [
  "VERCEL_ENV",
  "MEELNI_ENV_PULL_ENVIRONMENT",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "LIVEKIT_URL",
  "NEXT_PUBLIC_LIVEKIT_URL",
  "MEELNI_PREVIEW_LIVEKIT_URL",
  "MEELNI_PRODUCTION_LIVEKIT_URL",
  "LIVEKIT_INTERVIEW_AGENT_NAME",
] as const;

const originalEnvironment = Object.fromEntries(
  ENV_KEYS.map((name) => [name, process.env[name]])
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

describe("POST /api/session/start provider isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accessTokenConstructions = 0;
    mocks.dispatchClientConstructions = 0;
    mocks.roomClientConstructions = 0;
    setValidPreviewLiveKitEnvironment();
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "11111111-1111-4111-8111-111111111111",
              email: "candidate@example.invalid",
              user_metadata: {},
            },
          },
          error: null,
        }),
      },
    });
    mocks.resolveReactivationAccess.mockResolvedValue({
      source: "statsig",
      value: true,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnvironment();
  });

  it.each([
    {
      name: "missing Preview project identity",
      arrange: () => {
        delete process.env.MEELNI_PREVIEW_LIVEKIT_URL;
      },
    },
    {
      name: "malformed Preview project identity",
      arrange: () => {
        process.env.MEELNI_PREVIEW_LIVEKIT_URL =
          "https://preview-route-test.livekit.cloud";
      },
    },
    {
      name: "Preview runtime and project identity mismatch",
      arrange: () => {
        process.env.LIVEKIT_URL =
          "wss://other-preview-route-test.livekit.cloud";
      },
    },
    {
      name: "missing Production project identity",
      arrange: () => {
        delete process.env.MEELNI_PRODUCTION_LIVEKIT_URL;
      },
    },
    {
      name: "conflicting deployment markers",
      arrange: () => {
        process.env.MEELNI_ENV_PULL_ENVIRONMENT = "production";
      },
    },
    {
      name: "Preview and Production project identity conflict",
      arrange: () => {
        process.env.MEELNI_PREVIEW_LIVEKIT_URL =
          process.env.MEELNI_PRODUCTION_LIVEKIT_URL;
      },
    },
    {
      name: "missing interview agent identity",
      arrange: () => {
        delete process.env.LIVEKIT_INTERVIEW_AGENT_NAME;
      },
    },
  ])("fails closed for $name before session startup", async ({ arrange }) => {
    arrange();

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Server configuration error",
    });
    expect(mocks.startInterviewSessionWorkflow).not.toHaveBeenCalled();
    expectNoLiveKitSdkConstruction();
  });
});

function request(): NextRequest {
  return new NextRequest("http://localhost/api/session/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      startAttemptId: "550e8400-e29b-41d4-a716-446655440000",
      roundType: "product_sense",
    }),
  });
}

function setValidPreviewLiveKitEnvironment() {
  process.env.VERCEL_ENV = "preview";
  process.env.MEELNI_ENV_PULL_ENVIRONMENT = "preview";
  process.env.LIVEKIT_API_KEY = "preview-key";
  process.env.LIVEKIT_API_SECRET = "preview-secret";
  process.env.LIVEKIT_URL = "wss://preview-route-test.livekit.cloud";
  delete process.env.NEXT_PUBLIC_LIVEKIT_URL;
  process.env.MEELNI_PREVIEW_LIVEKIT_URL =
    "wss://preview-route-test.livekit.cloud";
  process.env.MEELNI_PRODUCTION_LIVEKIT_URL =
    "wss://production-route-test.livekit.cloud";
  process.env.LIVEKIT_INTERVIEW_AGENT_NAME = "preview-interview-agent";
}

function restoreEnvironment() {
  for (const name of ENV_KEYS) {
    const value = originalEnvironment[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

function expectNoLiveKitSdkConstruction() {
  expect(mocks.accessTokenConstructions).toBe(0);
  expect(mocks.dispatchClientConstructions).toBe(0);
  expect(mocks.roomClientConstructions).toBe(0);
}
