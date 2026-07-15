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
      expect(consoleError).toHaveBeenCalledWith(
        "Interview session start failed"
      );
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
      expect(startInterviewSessionWorkflow).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

function request() {
  return new NextRequest("http://localhost/api/session/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roundType: "product_sense" }),
  });
}
