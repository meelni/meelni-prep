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
  createDrizzleTranscriptRuntimeWriterStore: vi.fn(() => ({
    register: vi.fn(),
  })),
}));
vi.mock("@/lib/db/interview-runtime-events", () => ({
  createDrizzleInterviewRuntimeFailureStore: vi.fn(() => ({
    persistProviderFailure: vi.fn(),
  })),
}));
vi.mock("@/lib/db/interview-credit-settlement", () => ({
  convergeDrizzleInterviewCreditSettlement: vi.fn(),
}));
vi.mock("@/lib/db/runtime-settlement-commands", () => ({
  pullRuntimeSettlementCommand: vi.fn(),
  acknowledgeRuntimeSettlementCommand: vi.fn(),
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
vi.mock("@/lib/workflows/ingest-interview-runtime-event", () => ({
  ingestInterviewRuntimeEvent: vi.fn(),
}));
vi.mock("@/lib/workflows/ingest-transcript-runtime-writer", () => ({
  ingestTranscriptRuntimeWriter: vi.fn(),
}));

import { signRuntimeTranscriptBody } from "@/lib/security/transcript-ingest-authorization";
import { ingestTranscriptEvent } from "@/lib/workflows/ingest-transcript-event";
import { ingestTranscriptInterruptionMarker } from "@/lib/workflows/ingest-transcript-interruption-marker";
import { ingestTranscriptRuntimeSettlement } from "@/lib/workflows/ingest-transcript-runtime-settlement";
import { ingestInterviewRuntimeEvent } from "@/lib/workflows/ingest-interview-runtime-event";
import { ingestTranscriptRuntimeWriter } from "@/lib/workflows/ingest-transcript-runtime-writer";
import {
  acknowledgeRuntimeSettlementCommand,
  pullRuntimeSettlementCommand,
} from "@/lib/db/runtime-settlement-commands";
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

  it("quietly rejects an empty signed request body", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const response = await POST(requestRaw(""));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "invalid_runtime_transcript_payload",
      });
      expect(consoleError).not.toHaveBeenCalled();
      expect(ingestTranscriptEvent).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("quietly rejects a truncated signed JSON body", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const response = await POST(requestRaw("{"));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "invalid_runtime_transcript_payload",
      });
      expect(consoleError).not.toHaveBeenCalled();
      expect(ingestTranscriptEvent).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
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

  it("cancels a chunked body as soon as it crosses 64 KiB", async () => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(33 * 1024));
      },
      cancel() {
        canceled = true;
      },
    });
    const oversized = new NextRequest(
      "http://localhost/api/internal/transcript",
      {
        method: "POST",
        body: stream,
        duplex: "half",
        headers: { "content-type": "application/json" },
      }
    );

    const response = await POST(oversized);

    expect(response.status).toBe(413);
    expect(canceled).toBe(true);
    expect(ingestTranscriptEvent).not.toHaveBeenCalled();
  });

  it("uses the voice-runtime principal and returns only acknowledgement metadata", async () => {
    vi.mocked(ingestTranscriptEvent).mockResolvedValue({
      ok: true,
      disposition: "created",
      turn: {
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        text: "must not leave the server",
      },
    });
    const response = await POST(
      request({ sessionId: SESSION_ID, event: { event_id: "event-1" } })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      disposition: "created",
      kind: "turn",
      row_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
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

  it("pulls and acknowledges the exact signed durable settlement command", async () => {
    const identity = {
      contract_version: 1,
      session_id: SESSION_ID,
      room_name: "interview-room",
      writer_id: "writer-2",
      writer_generation: 2,
    };
    const command = {
      contract_version: 1 as const,
      event_type: "runtime_settlement_command" as const,
      command_id: `runtime-settlement:${SESSION_ID}:4`,
      session_id: SESSION_ID,
      lifecycle_version: 4,
      room_name: "interview-room",
      writer_id: "writer-2",
      writer_generation: 2,
      cutoff_at: "2026-08-14T05:00:00.000Z",
      expires_at: "2026-08-14T05:00:20.000Z",
    };
    vi.mocked(pullRuntimeSettlementCommand).mockResolvedValue({
      ok: true,
      disposition: "pending",
      command,
    });
    const pull = {
      ...identity,
      event_type: "runtime_settlement_command_pull",
    };
    const pulled = await POST(
      request({ sessionId: SESSION_ID, settlementCommandPull: pull })
    );
    expect(pulled.status).toBe(200);
    expect(await pulled.json()).toEqual({
      success: true,
      kind: "settlement_command",
      disposition: "pending",
      command,
    });

    vi.mocked(acknowledgeRuntimeSettlementCommand).mockResolvedValue({
      ok: true,
      disposition: "existing",
    });
    const ack = {
      ...identity,
      event_type: "runtime_settlement_command_ack",
      command_id: command.command_id,
      outcome: "settled",
    };
    const acknowledged = await POST(
      request({ sessionId: SESSION_ID, settlementCommandAck: ack })
    );
    expect(acknowledged.status).toBe(200);
    expect(await acknowledged.json()).toEqual({
      success: true,
      kind: "settlement_command_ack",
      disposition: "existing",
    });
  });

  it("fails closed for stale command generations and unknown contracts", async () => {
    const stale = {
      contract_version: 1,
      event_type: "runtime_settlement_command_pull",
      session_id: SESSION_ID,
      room_name: "interview-room",
      writer_id: "writer-old",
      writer_generation: 1,
    };
    vi.mocked(pullRuntimeSettlementCommand).mockResolvedValue({
      ok: false,
      reason: "fenced",
    });
    const fenced = await POST(
      request({ sessionId: SESSION_ID, settlementCommandPull: stale })
    );
    expect(fenced.status).toBe(409);

    const unknownVersion = await POST(
      request({
        sessionId: SESSION_ID,
        settlementCommandPull: { ...stale, contract_version: 2 },
      })
    );
    expect(unknownVersion.status).toBe(400);

    const mismatchedEnvelope = await POST(
      request({
        sessionId: "00000000-0000-4000-8000-000000000002",
        settlementCommandPull: stale,
      })
    );
    expect(mismatchedEnvelope.status).toBe(400);
    expect(pullRuntimeSettlementCommand).toHaveBeenCalledTimes(1);
  });

  it("routes provider-neutral runtime failure evidence", async () => {
    vi.mocked(ingestInterviewRuntimeEvent).mockResolvedValue({
      ok: true,
      disposition: "created",
      sessionId: SESSION_ID,
      creditDisposition: "released",
    });
    const response = await POST(
      request({
        sessionId: SESSION_ID,
        runtimeEvent: { type: "provider_failed" },
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      disposition: "created",
      kind: "runtime_event",
    });
    expect(ingestInterviewRuntimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        requestSessionId: SESSION_ID,
        event: { type: "provider_failed" },
      })
    );
  });

  it("returns the durable server-assigned writer generation before output", async () => {
    vi.mocked(ingestTranscriptRuntimeWriter).mockResolvedValue({
      ok: true,
      disposition: "created",
      writer: { writerId: "writer-1" },
      writerGeneration: 2,
    });
    const response = await POST(
      request({
        sessionId: SESSION_ID,
        writerRegistration: {
          event_type: "runtime_writer_registration",
          writer_id: "writer-1",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      disposition: "created",
      kind: "writer_registration",
      writer_generation: 2,
    });
    expect(ingestTranscriptRuntimeWriter).toHaveBeenCalledOnce();
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

  it("redacts transcript content and custom error names from failure logs", async () => {
    const sentinel = "PRIVATE_TRANSCRIPT_SENTINEL_do_not_log";
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const error = new Error(`database rejected ${sentinel}`);
    error.name = sentinel;
    vi.mocked(ingestTranscriptEvent).mockRejectedValueOnce(error);

    try {
      const response = await POST(
        request({ sessionId: SESSION_ID, event: { event_id: "event-3" } })
      );
      expect(response.status).toBe(500);
      expect(consoleError).toHaveBeenCalledWith(
        "Runtime transcript ingest failed",
        { error_class: "Error" }
      );
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(sentinel);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("maps database lock and statement timeouts to retryable 503s", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      for (const code of ["55P03", "57014"]) {
        const error = Object.assign(new Error("private database detail"), {
          code,
        });
        vi.mocked(ingestTranscriptEvent).mockRejectedValueOnce(error);

        const response = await POST(
          request({ sessionId: SESSION_ID, event: { event_id: code } })
        );

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({
          error: "runtime_transcript_ingest_unavailable",
        });
      }
      expect(JSON.stringify(consoleWarn.mock.calls)).not.toContain(
        "private database detail"
      );
    } finally {
      consoleWarn.mockRestore();
    }
  });
});

function request(body: Record<string, unknown>) {
  return requestRaw(JSON.stringify(body));
}

function requestRaw(rawBody: string) {
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
