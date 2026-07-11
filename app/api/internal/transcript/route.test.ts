import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/transcripts", () => ({
  createDrizzleTranscriptIngestStore: vi.fn(() => ({ persist: vi.fn() })),
  createDrizzleTranscriptInterruptionMarkerStore: vi.fn(() => ({
    persist: vi.fn(),
  })),
  createDrizzleTranscriptRuntimeSettlementStore: vi.fn(() => ({
    persist: vi.fn(),
  })),
}));
vi.mock("@/lib/workflows/ingest-transcript-event", () => ({
  ingestTranscriptEvent: vi.fn(),
}));
vi.mock("@/lib/workflows/ingest-transcript-interruption-marker", () => ({
  ingestTranscriptInterruptionMarker: vi.fn(),
}));
vi.mock("@/lib/workflows/ingest-transcript-runtime-settlement", () => ({
  ingestTranscriptRuntimeSettlement: vi.fn(),
}));

import { signRuntimeTranscriptBody } from "@/lib/security/transcript-ingest-authorization";
import { ingestTranscriptEvent } from "@/lib/workflows/ingest-transcript-event";
import { ingestTranscriptInterruptionMarker } from "@/lib/workflows/ingest-transcript-interruption-marker";
import { ingestTranscriptRuntimeSettlement } from "@/lib/workflows/ingest-transcript-runtime-settlement";
import { POST } from "./route";

const SECRET = "livekit-secret-with-at-least-thirty-two-characters";
const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("POST /api/internal/transcript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LIVEKIT_API_SECRET = SECRET;
  });

  it("fails closed when service authentication is unavailable or invalid", async () => {
    delete process.env.LIVEKIT_API_SECRET;
    const unavailable = await POST(
      request({ sessionId: SESSION_ID, event: {} })
    );
    expect(unavailable.status).toBe(503);

    process.env.LIVEKIT_API_SECRET = SECRET;
    const unauthorized = await POST(
      new NextRequest("http://localhost/api/internal/transcript", {
        method: "POST",
        body: JSON.stringify({ sessionId: SESSION_ID, event: {} }),
        headers: {
          "content-type": "application/json",
          "x-meelni-timestamp": String(Math.floor(Date.now() / 1000)),
          "x-meelni-signature": "0".repeat(64),
        },
      })
    );
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects oversized bodies before authentication or parsing", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/internal/transcript", {
        method: "POST",
        body: "{}",
        headers: {
          "content-length": String(65 * 1024),
          "content-type": "application/json",
        },
      })
    );
    expect(response.status).toBe(413);
    expect(ingestTranscriptEvent).not.toHaveBeenCalled();
  });

  it("rejects unsupported media types before reading signed content", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/internal/transcript", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "text/plain" },
      })
    );

    expect(response.status).toBe(415);
    expect(ingestTranscriptEvent).not.toHaveBeenCalled();
  });

  it("stops reading a chunked body once the byte limit is exceeded", async () => {
    let reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads += 1;
        controller.enqueue(new Uint8Array(40 * 1024));
      },
    });
    const response = await POST(
      new NextRequest("http://localhost/api/internal/transcript", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
        duplex: "half",
      } as never)
    );

    expect(response.status).toBe(413);
    expect(reads).toBe(2);
    expect(ingestTranscriptEvent).not.toHaveBeenCalled();
  });

  it("fails closed without logging content when the request body aborts", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"sessionId":"secret'));
        controller.error(new Error("raw transcript text"));
      },
    });

    try {
      const response = await POST(
        new NextRequest("http://localhost/api/internal/transcript", {
          method: "POST",
          body,
          headers: { "content-type": "application/json" },
          duplex: "half",
        } as never)
      );
      expect(response.status).toBe(400);
      expect(consoleError).not.toHaveBeenCalled();
      expect(ingestTranscriptEvent).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("uses the voice-runtime principal and returns only acknowledgement metadata", async () => {
    vi.mocked(ingestTranscriptEvent).mockResolvedValue({
      ok: true,
      disposition: "created",
      turn: { text: "must not leave the server" },
    });
    const response = await POST(
      request({ sessionId: SESSION_ID, event: { event_id: "event-1" } })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      disposition: "created",
      kind: "turn",
    });
    expect(ingestTranscriptEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestSessionId: SESSION_ID,
        principal: { kind: "voice_runtime" },
      })
    );
  });

  it("routes textless interruption markers outside transcript turns", async () => {
    vi.mocked(ingestTranscriptInterruptionMarker).mockResolvedValue({
      ok: true,
      disposition: "existing",
      marker: { id: "marker-1" },
    });
    const response = await POST(
      request({
        sessionId: SESSION_ID,
        interruptionMarker: { event_id: "marker-1" },
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      disposition: "existing",
      kind: "marker",
    });
    expect(ingestTranscriptEvent).not.toHaveBeenCalled();
  });

  it("routes metadata-only runtime settlement evidence", async () => {
    vi.mocked(ingestTranscriptRuntimeSettlement).mockResolvedValue({
      ok: true,
      disposition: "created",
      settlement: { state: "settled" },
    });
    const response = await POST(
      request({
        sessionId: SESSION_ID,
        settlement: { event_type: "runtime_settlement" },
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      disposition: "created",
      kind: "settlement",
    });
  });

  it("rejects ambiguous envelopes and maps integrity failures", async () => {
    const ambiguous = await POST(
      request({
        sessionId: SESSION_ID,
        event: {},
        interruptionMarker: {},
      })
    );
    expect(ambiguous.status).toBe(400);

    vi.mocked(ingestTranscriptEvent).mockResolvedValue({
      ok: false,
      reason: "event_conflict",
    });
    const conflict = await POST(
      request({ sessionId: SESSION_ID, event: { event_id: "event-1" } })
    );
    expect(conflict.status).toBe(409);

    vi.mocked(ingestTranscriptEvent).mockResolvedValue({
      ok: false,
      reason: "session_capacity_exceeded",
    });
    const capacity = await POST(
      request({ sessionId: SESSION_ID, event: { event_id: "event-2" } })
    );
    expect(capacity.status).toBe(429);
  });

  it("redacts transcript content from unexpected failure logs", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(ingestTranscriptEvent).mockRejectedValueOnce(
      new Error("database rejected raw transcript text")
    );

    try {
      const response = await POST(
        request({ sessionId: SESSION_ID, event: { event_id: "event-3" } })
      );
      expect(response.status).toBe(500);
      expect(consoleError).toHaveBeenCalledWith(
        "Runtime transcript ingest failed",
        { errorType: "Error" }
      );
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
        "raw transcript text"
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

function request(body: Record<string, unknown>) {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new NextRequest("http://localhost/api/internal/transcript", {
    method: "POST",
    body: rawBody,
    headers: {
      "content-type": "application/json",
      "x-meelni-timestamp": timestamp,
      "x-meelni-signature": signRuntimeTranscriptBody({
        livekitApiSecret: SECRET,
        timestamp,
        rawBody,
      }),
    },
  });
}
