import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/internal/integrations", () => ({
  getLiveKitAgentName: vi.fn(),
  getLiveKitEnvironment: vi.fn(),
}));
vi.mock("@/lib/workflows/start-session", () => ({
  startInterviewSessionWorkflow: vi.fn(),
}));
vi.mock("@/lib/feature-flags/reactivation-access", () => ({
  resolveReactivationAccess: vi.fn().mockResolvedValue({ value: true }),
}));

import {
  getLiveKitAgentName,
  getLiveKitEnvironment,
} from "@/lib/internal/integrations";
import { createClient } from "@/lib/supabase/server";
import { startInterviewSessionWorkflow } from "@/lib/workflows/start-session";
import { POST } from "./route";

describe("POST /api/session/start logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: { id: "user-1", email: "candidate@example.com" },
          },
          error: null,
        }),
      },
    } as never);
    vi.mocked(getLiveKitEnvironment).mockReturnValue({
      ok: true,
      data: {
        apiKey: "redacted",
        apiSecret: "redacted",
        wsUrl: "wss://preview.example.test",
      },
    } as never);
    vi.mocked(getLiveKitAgentName).mockReturnValue({
      ok: true,
      provider: "livekit",
      data: "interview-agent",
    });
  });

  it("does not log unrestricted workflow errors", async () => {
    const sentinel = "QUESTION-OR-PROVIDER-CONTENT-SENTINEL";
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(startInterviewSessionWorkflow).mockRejectedValue(
      new Error(sentinel)
    );

    try {
      const response = await POST(request());

      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toContain(sentinel);
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(sentinel);
      expect(readOperationalEvent(consoleError)).toMatchObject({
        event: "meelni_operational_failure",
        version: 1,
        operation: "interview_start",
        errorCode: "interview_start_failed",
        severity: "critical",
        retryable: true,
        requestId: null,
        correlationId: null,
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("redacts environment validation details", async () => {
    const sentinel = "SECRET-ENVIRONMENT-DETAIL-SENTINEL";
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(getLiveKitEnvironment).mockReturnValue({
      ok: false,
      error: new Error(sentinel),
    } as never);

    try {
      const response = await POST(request());

      expect(response.status).toBe(500);
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(sentinel);
      expect(readOperationalEvent(consoleError)).toMatchObject({
        operation: "interview_start",
        errorCode: "livekit_config_missing",
        severity: "critical",
        retryable: false,
      });
      expect(startInterviewSessionWorkflow).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("does not page on an expected idempotent start-in-progress retry", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(startInterviewSessionWorkflow).mockResolvedValue({
      ok: false,
      status: 503,
      body: {
        error: "interview_start_in_progress",
        message: "The interview is still starting. Please try again.",
        retryable: true,
        retryAfterMs: 1_000,
      },
    } as never);

    try {
      const response = await POST(request());

      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("1");
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("reports authorization and gate latency without customer content", async () => {
    const consoleInfo = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    vi.mocked(startInterviewSessionWorkflow).mockResolvedValue({
      ok: false,
      status: 503,
      body: { error: "interview_start_in_progress", retryable: true },
    } as never);

    try {
      await POST(request());

      expect(consoleInfo).toHaveBeenCalledTimes(1);
      const event = JSON.parse(
        String(consoleInfo.mock.calls[0]?.[0])
      ) as Record<string, unknown>;
      expect(event).toMatchObject({
        event: "meelni_interview_start_stage",
        version: 1,
        stage: "authorization_gate",
        outcome: "succeeded",
      });
      expect(Object.keys(event).sort()).toEqual([
        "durationMs",
        "event",
        "latencyClass",
        "outcome",
        "sloTargetMs",
        "sloUpperBoundMs",
        "stage",
        "version",
      ]);
      expect(JSON.stringify(event)).not.toContain("candidate@example.com");
      expect(JSON.stringify(event)).not.toContain("user-1");
    } finally {
      consoleInfo.mockRestore();
    }
  });
});

function readOperationalEvent(
  consoleError: ReturnType<typeof vi.spyOn>
): Record<string, unknown> {
  expect(consoleError).toHaveBeenCalledTimes(1);
  return JSON.parse(String(consoleError.mock.calls[0]?.[0])) as Record<
    string,
    unknown
  >;
}

function request() {
  return new NextRequest("http://localhost/api/session/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roundType: "product_sense" }),
  });
}
