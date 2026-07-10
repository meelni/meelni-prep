import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createDrizzleTranscriptIngestStore,
  createDrizzleTranscriptInterruptionMarkerStore,
  createDrizzleTranscriptRuntimeSettlementStore,
} from "@/lib/db/transcripts";
import { createDrizzleInterviewRuntimeFailureStore } from "@/lib/db/interview-runtime-events";
import { convergeDrizzleInterviewCreditSettlement } from "@/lib/db/interview-credit-settlement";
import { authorizeRuntimeTranscriptRequest } from "@/lib/security/transcript-ingest-authorization";
import { ingestTranscriptEvent } from "@/lib/workflows/ingest-transcript-event";
import { ingestTranscriptInterruptionMarker } from "@/lib/workflows/ingest-transcript-interruption-marker";
import { ingestTranscriptRuntimeSettlement } from "@/lib/workflows/ingest-transcript-runtime-settlement";
import { ingestInterviewRuntimeEvent } from "@/lib/workflows/ingest-interview-runtime-event";

const RuntimeTranscriptRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    event: z.unknown().optional(),
    interruptionMarker: z.unknown().optional(),
    settlement: z.unknown().optional(),
    runtimeEvent: z.unknown().optional(),
  })
  .refine(
    (body) =>
      [
        body.event,
        body.interruptionMarker,
        body.settlement,
        body.runtimeEvent,
      ].filter(
        (value) => value !== undefined
      ).length === 1,
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
  const body = await readBoundedRawBody(req);
  if (!body.ok) {
    if (body.reason === "too_large") {
      return response({ error: "runtime_transcript_payload_too_large" }, 413);
    }
    return response({ error: "invalid_runtime_transcript_payload" }, 400);
  }
  const rawBody = body.rawBody;
  if (Buffer.byteLength(rawBody, "utf8") > MAX_RUNTIME_TRANSCRIPT_BODY_BYTES) {
    return response({ error: "runtime_transcript_payload_too_large" }, 413);
  }
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
        settleCredit: convergeDrizzleInterviewCreditSettlement,
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
      errorType: error instanceof Error ? error.name : "unknown_error",
    });
    return response({ error: "runtime_transcript_ingest_failed" }, 500);
  }
}

function mapIngestResult(
  result:
    | Awaited<ReturnType<typeof ingestTranscriptEvent>>
    | Awaited<ReturnType<typeof ingestTranscriptInterruptionMarker>>
    | Awaited<ReturnType<typeof ingestTranscriptRuntimeSettlement>>
    | Awaited<ReturnType<typeof ingestInterviewRuntimeEvent>>,
  kind: "turn" | "marker" | "settlement" | "runtime_event"
) {
  if (result.ok) {
    return response(
      { success: true, disposition: result.disposition, kind },
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
    result.reason === "writer_sequence_conflict" ||
    result.reason === "writer_order_conflict" ||
    result.reason === "runtime_settled" ||
    result.reason === "session_closed" ||
    result.reason === "room_mismatch"
  ) {
    return response({ error: "runtime_transcript_identity_conflict" }, 409);
  }
  return response({ error: "invalid_runtime_transcript_payload" }, 400);
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

async function readBoundedRawBody(
  req: NextRequest
): Promise<
  | { ok: true; rawBody: string }
  | { ok: false; reason: "too_large" | "unreadable" }
> {
  if (!req.body) return { ok: true, rawBody: "" };

  const chunks: Buffer[] = [];
  let bytesRead = 0;
  const reader = req.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_RUNTIME_TRANSCRIPT_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(Buffer.from(value));
    }
    return { ok: true, rawBody: Buffer.concat(chunks).toString("utf8") };
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }
}
