import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createDrizzleTranscriptIngestStore,
  createDrizzleTranscriptInterruptionMarkerStore,
  createDrizzleTranscriptRuntimeSettlementStore,
} from "@/lib/db/transcripts";
import { authorizeRuntimeTranscriptRequest } from "@/lib/security/transcript-ingest-authorization";
import { ingestTranscriptEvent } from "@/lib/workflows/ingest-transcript-event";
import { ingestTranscriptInterruptionMarker } from "@/lib/workflows/ingest-transcript-interruption-marker";
import { ingestTranscriptRuntimeSettlement } from "@/lib/workflows/ingest-transcript-runtime-settlement";

const RuntimeTranscriptRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    event: z.unknown().optional(),
    interruptionMarker: z.unknown().optional(),
    settlement: z.unknown().optional(),
  })
  .refine(
    (body) =>
      [body.event, body.interruptionMarker, body.settlement].filter(
        (value) => value !== undefined
      ).length === 1,
    "exactly one runtime transcript payload is required"
  );
const MAX_RUNTIME_TRANSCRIPT_BODY_BYTES = 64 * 1024;

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_RUNTIME_TRANSCRIPT_BODY_BYTES
  ) {
    return response({ error: "runtime_transcript_payload_too_large" }, 413);
  }
  const rawBody = await req.text();
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
    | Awaited<ReturnType<typeof ingestTranscriptRuntimeSettlement>>,
  kind: "turn" | "marker" | "settlement"
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
    result.reason === "session_closed"
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
