import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createDrizzleTranscriptIngestStore,
  createDrizzleTranscriptInterruptionMarkerStore,
  createDrizzleTranscriptRuntimeSettlementStore,
  createDrizzleTranscriptRuntimeWriterStore,
} from "@/lib/db/transcripts";
import { createDrizzleInterviewRuntimeFailureStore } from "@/lib/db/interview-runtime-events";
import { authorizeRuntimeTranscriptRequest } from "@/lib/security/transcript-ingest-authorization";
import { ingestTranscriptEvent } from "@/lib/workflows/ingest-transcript-event";
import { ingestTranscriptInterruptionMarker } from "@/lib/workflows/ingest-transcript-interruption-marker";
import { ingestTranscriptRuntimeSettlement } from "@/lib/workflows/ingest-transcript-runtime-settlement";
import { ingestInterviewRuntimeEvent } from "@/lib/workflows/ingest-interview-runtime-event";
import { ingestTranscriptRuntimeWriter } from "@/lib/workflows/ingest-transcript-runtime-writer";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";

const RuntimeTranscriptRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    event: z.unknown().optional(),
    interruptionMarker: z.unknown().optional(),
    settlement: z.unknown().optional(),
    runtimeEvent: z.unknown().optional(),
    writerRegistration: z.unknown().optional(),
  })
  .refine(
    (body) =>
      [
        body.event,
        body.interruptionMarker,
        body.settlement,
        body.runtimeEvent,
        body.writerRegistration,
      ].filter((value) => value !== undefined).length === 1,
    "exactly one runtime transcript payload is required"
  );
const MAX_RUNTIME_TRANSCRIPT_BODY_BYTES = 64 * 1024;

export async function POST(req: NextRequest) {
  if (!isJsonContentType(req.headers.get("content-type"))) {
    return response(
      { error: "unsupported_runtime_transcript_media_type" },
      415
    );
  }
  const contentLengthHeader = req.headers.get("content-length");
  if (
    contentLengthHeader !== null &&
    (!/^\d+$/.test(contentLengthHeader) ||
      Number(contentLengthHeader) > MAX_RUNTIME_TRANSCRIPT_BODY_BYTES)
  ) {
    return response({ error: "runtime_transcript_payload_too_large" }, 413);
  }
  const body = await readBoundedRuntimeBody(req);
  if (body.disposition === "too_large") {
    return response({ error: "runtime_transcript_payload_too_large" }, 413);
  }
  if (body.disposition === "aborted") {
    return response({ error: "runtime_transcript_request_aborted" }, 400);
  }
  if (!("rawBody" in body)) {
    return response({ error: "runtime_transcript_request_aborted" }, 400);
  }
  const rawBody = body.rawBody;
  const authorization = authorizeRuntimeTranscriptRequest({
    rawBody,
    timestampHeader: req.headers.get("x-meelni-timestamp"),
    signatureHeader: req.headers.get("x-meelni-signature"),
    livekitApiSecret: process.env.LIVEKIT_API_SECRET,
  });
  if (!authorization.authorized) {
    const configurationFailure =
      authorization.reason === "missing_configuration";
    return NextResponse.json(
      {
        error: configurationFailure
          ? "runtime_transcript_ingest_unavailable"
          : "runtime_transcript_ingest_unauthorized",
      },
      {
        status: configurationFailure ? 503 : 401,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const parsed = RuntimeTranscriptRequestSchema.safeParse(
    safeParseJson(rawBody)
  );
  if (!parsed.success) {
    return response({ error: "invalid_runtime_transcript_payload" }, 400);
  }

  try {
    if (parsed.data.writerRegistration !== undefined) {
      const result = await ingestTranscriptRuntimeWriter({
        requestSessionId: parsed.data.sessionId,
        registration: parsed.data.writerRegistration,
        store: createDrizzleTranscriptRuntimeWriterStore(),
      });
      if (result.ok) {
        return response(
          {
            success: true,
            disposition: result.disposition,
            kind: "writer_registration",
            writer_generation: result.writerGeneration,
          },
          200
        );
      }
      return mapIngestResult(result, "writer_registration");
    }

    if (parsed.data.event !== undefined) {
      const result = await ingestTranscriptEvent({
        requestSessionId: parsed.data.sessionId,
        principal: { kind: "voice_runtime" },
        event: parsed.data.event,
        store: createDrizzleTranscriptIngestStore(),
      });
      return mapIngestResult(result, "turn");
    }

    if (parsed.data.interruptionMarker !== undefined) {
      const result = await ingestTranscriptInterruptionMarker({
        requestSessionId: parsed.data.sessionId,
        marker: parsed.data.interruptionMarker,
        store: createDrizzleTranscriptInterruptionMarkerStore(),
      });
      return mapIngestResult(result, "marker");
    }

    if (parsed.data.runtimeEvent !== undefined) {
      const result = await ingestInterviewRuntimeEvent({
        requestSessionId: parsed.data.sessionId,
        event: parsed.data.runtimeEvent,
        store: createDrizzleInterviewRuntimeFailureStore(),
      });
      return mapIngestResult(result, "runtime_event");
    }

    const result = await ingestTranscriptRuntimeSettlement({
      requestSessionId: parsed.data.sessionId,
      settlement: parsed.data.settlement,
      store: createDrizzleTranscriptRuntimeSettlementStore(),
    });
    return mapIngestResult(result, "settlement");
  } catch (error) {
    console.error("Runtime transcript ingest failed", {
      ...toSafeErrorLog(error),
    });
    return response({ error: "runtime_transcript_ingest_failed" }, 500);
  }
}

function mapIngestResult(
  result:
    | Awaited<ReturnType<typeof ingestTranscriptEvent>>
    | Awaited<ReturnType<typeof ingestTranscriptInterruptionMarker>>
    | Awaited<ReturnType<typeof ingestTranscriptRuntimeSettlement>>
    | Awaited<ReturnType<typeof ingestInterviewRuntimeEvent>>
    | Awaited<ReturnType<typeof ingestTranscriptRuntimeWriter>>,
  kind:
    | "turn"
    | "marker"
    | "settlement"
    | "runtime_event"
    | "writer_registration"
) {
  if (result.ok) {
    const rowId =
      kind === "turn" && "turn" in result && isPersistedRow(result.turn)
        ? result.turn.id
        : undefined;
    return response(
      {
        success: true,
        disposition: result.disposition,
        kind,
        ...(rowId ? { row_id: rowId } : {}),
      },
      200
    );
  }
  if (result.reason === "session_capacity_exceeded") {
    return response({ error: "transcript_session_capacity_exceeded" }, 429);
  }
  if (result.reason === "not_found") {
    return response({ error: "runtime_transcript_session_not_found" }, 404);
  }
  if (
    result.reason === "event_conflict" ||
    result.reason === "settlement_conflict" ||
    result.reason === "registration_conflict" ||
    result.reason === "writer_sequence_conflict" ||
    result.reason === "writer_order_conflict" ||
    result.reason === "writer_not_registered" ||
    result.reason === "writer_fenced" ||
    result.reason === "runtime_settled" ||
    result.reason === "session_closed" ||
    result.reason === "room_mismatch"
  ) {
    return response({ error: "runtime_transcript_identity_conflict" }, 409);
  }
  return response({ error: "invalid_runtime_transcript_payload" }, 400);
}

function isPersistedRow(value: unknown): value is { id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0
  );
}

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function safeParseJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

function isJsonContentType(value: string | null): boolean {
  return value?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

async function readBoundedRuntimeBody(
  req: NextRequest
): Promise<
  | { disposition: "ok"; rawBody: string }
  | { disposition: "too_large" | "aborted" }
> {
  if (!req.body) return { disposition: "ok", rawBody: "" };

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let rawBody = "";
  const abort = () => {
    void reader.cancel("request_aborted");
  };
  req.signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      if (req.signal.aborted) return { disposition: "aborted" };
      const chunk = await reader.read();
      if (chunk.done) break;
      bytesRead += chunk.value.byteLength;
      if (bytesRead > MAX_RUNTIME_TRANSCRIPT_BODY_BYTES) {
        await reader.cancel("payload_too_large");
        return { disposition: "too_large" };
      }
      rawBody += decoder.decode(chunk.value, { stream: true });
    }
    rawBody += decoder.decode();
    return { disposition: "ok", rawBody };
  } catch {
    return { disposition: "aborted" };
  } finally {
    req.signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
