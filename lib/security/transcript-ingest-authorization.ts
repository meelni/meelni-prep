import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNING_CONTEXT = "meelni/transcript-ingest/v1";
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/;

export type RuntimeTranscriptAuthorizationResult =
  | { authorized: true }
  | {
      authorized: false;
      reason: "missing_configuration" | "invalid_signature" | "stale_request";
    };

export function authorizeRuntimeTranscriptRequest(input: {
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  livekitApiSecret: string | undefined;
  nowSeconds?: number;
}): RuntimeTranscriptAuthorizationResult {
  const secret = input.livekitApiSecret?.trim();
  if (!secret || secret.length < 32) {
    return { authorized: false, reason: "missing_configuration" };
  }

  if (
    !input.timestampHeader ||
    !/^\d{10}$/.test(input.timestampHeader) ||
    !input.signatureHeader ||
    !SIGNATURE_PATTERN.test(input.signatureHeader)
  ) {
    return { authorized: false, reason: "invalid_signature" };
  }

  const timestamp = Number(input.timestampHeader);
  const now = Math.floor(input.nowSeconds ?? Date.now() / 1000);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(now - timestamp) > MAX_CLOCK_SKEW_SECONDS
  ) {
    return { authorized: false, reason: "stale_request" };
  }

  const expected = signRuntimeTranscriptBody({
    livekitApiSecret: secret,
    timestamp: input.timestampHeader,
    rawBody: input.rawBody,
  });
  const suppliedBuffer = Buffer.from(input.signatureHeader, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
    ? { authorized: true }
    : { authorized: false, reason: "invalid_signature" };
}

export function signRuntimeTranscriptBody(input: {
  livekitApiSecret: string;
  timestamp: string;
  rawBody: string;
}): string {
  const signingKey = createHmac("sha256", input.livekitApiSecret)
    .update(SIGNING_CONTEXT, "utf8")
    .digest();
  return createHmac("sha256", signingKey)
    .update(`${input.timestamp}.${input.rawBody}`, "utf8")
    .digest("hex");
}
