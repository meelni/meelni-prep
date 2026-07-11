import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/transcripts", () => ({
  createDrizzleTranscriptIngestStore: vi.fn(() => ({ persist: vi.fn() })),
}));
vi.mock("@/lib/workflows/ingest-transcript-event", () => ({
  ingestTranscriptEvent: vi.fn(),
}));

import { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { ingestTranscriptEvent } from "@/lib/workflows/ingest-transcript-event";
import { POST } from "./route";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("POST /api/session/transcript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth({ id: "user-1" });
  });

  it("rejects unauthenticated requests", async () => {
    mockAuth(null, new Error("expired"));
    const response = await POST(request({ sessionId: SESSION_ID, event: {} }));
    expect(response.status).toBe(401);
    expect(ingestTranscriptEvent).not.toHaveBeenCalled();
  });

  it("rejects empty JSON as a malformed event", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/session/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    );
    expect(response.status).toBe(400);
    expect(ingestTranscriptEvent).not.toHaveBeenCalled();
  });

  it("rejects an aborted body read without leaking the transport error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST({
      headers: new Headers({ "Content-Type": "application/json" }),
      body: {
        getReader: () => ({
          read: vi.fn().mockRejectedValue(new Error("private aborted body")),
        }),
      },
    } as unknown as NextRequest);

    expect(response.status).toBe(400);
    expect(ingestTranscriptEvent).not.toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
      "private aborted body"
    );
    errorSpy.mockRestore();
  });

  it("rejects simple cross-origin media types before ingest", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/session/transcript", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ sessionId: SESSION_ID, event: {} }),
      })
    );

    expect(response.status).toBe(415);
    expect(ingestTranscriptEvent).not.toHaveBeenCalled();
  });

  it("rejects media types that merely prefix-match JSON", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/session/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json-evil" },
        body: JSON.stringify({ sessionId: SESSION_ID, event: {} }),
      })
    );

    expect(response.status).toBe(415);
    expect(ingestTranscriptEvent).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies before ingest", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/session/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ padding: "x".repeat(66_000) }),
      })
    );

    expect(response.status).toBe(413);
    expect(ingestTranscriptEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed request envelopes before ingest", async () => {
    const response = await POST(request({ sessionId: "not-a-uuid" }));
    expect(response.status).toBe(400);
    expect(ingestTranscriptEvent).not.toHaveBeenCalled();
  });

  it.each([
    "invalid_event",
    "session_mismatch",
    "room_mismatch",
    "event_time_out_of_bounds",
  ])("maps %s to a safe 400 response", async (reason) => {
    vi.mocked(ingestTranscriptEvent).mockResolvedValue({
      ok: false,
      reason,
    } as never);
    const response = await POST(request({ sessionId: SESSION_ID, event: {} }));
    expect(response.status).toBe(400);
  });

  it("redacts persistence exceptions that may contain transcript text", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(ingestTranscriptEvent).mockRejectedValue(
      new Error("Failing row contains private transcript text")
    );

    const response = await POST(request({ sessionId: SESSION_ID, event: {} }));

    expect(response.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledWith("[Transcript] Persistence failed", {
      code: "transcript_persistence_failed",
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
      "private transcript text"
    );
    errorSpy.mockRestore();
  });

  it("keeps missing and cross-user sessions indistinguishable", async () => {
    vi.mocked(ingestTranscriptEvent).mockResolvedValue({
      ok: false,
      reason: "not_found",
    });
    const response = await POST(request({ sessionId: SESSION_ID, event: {} }));
    expect(response.status).toBe(404);
  });

  it("rate-limits sessions that exceed the durable turn cap", async () => {
    vi.mocked(ingestTranscriptEvent).mockResolvedValue({
      ok: false,
      reason: "session_capacity_exceeded",
    });
    const response = await POST(request({ sessionId: SESSION_ID, event: {} }));
    expect(response.status).toBe(429);
  });

  it.each([
    "event_conflict",
    "writer_sequence_conflict",
    "writer_order_conflict",
  ])("maps %s to an identity conflict", async (reason) => {
    vi.mocked(ingestTranscriptEvent).mockResolvedValue({
      ok: false,
      reason,
    } as never);
    const response = await POST(request({ sessionId: SESSION_ID, event: {} }));
    expect(response.status).toBe(409);
  });

  it("distinguishes a closed session from transcript identity corruption", async () => {
    vi.mocked(ingestTranscriptEvent).mockResolvedValue({
      ok: false,
      reason: "session_closed",
    });
    const response = await POST(request({ sessionId: SESSION_ID, event: {} }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "transcript_session_closed",
    });
  });

  it.each(["created", "existing"] as const)(
    "returns the durable turn for %s events",
    async (disposition) => {
      vi.mocked(ingestTranscriptEvent).mockResolvedValue({
        ok: true,
        disposition,
        turn: { id: "turn-1" },
      });
      const response = await POST(
        request({ sessionId: SESSION_ID, event: {} })
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        success: true,
        disposition,
        turn: { id: "turn-1" },
      });
    }
  );
});

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/session/transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuth(user: { id: string } | null, error: Error | null = null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error }),
    },
  } as never);
}
