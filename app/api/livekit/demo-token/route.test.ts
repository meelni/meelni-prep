import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accessTokenConstructions: 0,
  dispatchClientConstructions: 0,
  roomClientConstructions: 0,
  createDispatch: vi.fn(),
  createRoom: vi.fn(),
  toJwt: vi.fn(),
}));

vi.mock("livekit-server-sdk", () => ({
  AccessToken: class AccessTokenMock {
    constructor() {
      mocks.accessTokenConstructions += 1;
    }

    addGrant() {}

    toJwt = mocks.toJwt;
  },
  AgentDispatchClient: class AgentDispatchClientMock {
    constructor() {
      mocks.dispatchClientConstructions += 1;
    }

    createDispatch = mocks.createDispatch;
  },
  RoomServiceClient: class RoomServiceClientMock {
    constructor() {
      mocks.roomClientConstructions += 1;
    }

    createRoom = mocks.createRoom;
  },
  TrackSource: { MICROPHONE: 1 },
  WebhookReceiver: class WebhookReceiverMock {},
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
  "LIVEKIT_DEMO_AGENT_NAME",
] as const;

const originalEnvironment = Object.fromEntries(
  ENV_KEYS.map((name) => [name, process.env[name]])
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

describe("POST /api/livekit/demo-token provider isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accessTokenConstructions = 0;
    mocks.dispatchClientConstructions = 0;
    mocks.roomClientConstructions = 0;
    setValidPreviewLiveKitEnvironment();
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
      name: "missing demo agent identity",
      arrange: () => {
        delete process.env.LIVEKIT_DEMO_AGENT_NAME;
      },
    },
  ])("fails closed for $name before provider work", async ({ arrange }) => {
    arrange();

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "LiveKit credentials not configured",
    });
    expectNoLiveKitProviderWork();
  });
});

function request(): NextRequest {
  return new NextRequest("http://localhost/api/livekit/demo-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ participantName: "Preview Guest" }),
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
  process.env.LIVEKIT_DEMO_AGENT_NAME = "preview-demo-agent";
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

function expectNoLiveKitProviderWork() {
  expect(mocks.accessTokenConstructions).toBe(0);
  expect(mocks.dispatchClientConstructions).toBe(0);
  expect(mocks.roomClientConstructions).toBe(0);
  expect(mocks.createRoom).not.toHaveBeenCalled();
  expect(mocks.createDispatch).not.toHaveBeenCalled();
  expect(mocks.toJwt).not.toHaveBeenCalled();
}
