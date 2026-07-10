import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeRuntimeTranscriptRequest,
  signRuntimeTranscriptBody,
} from "./transcript-ingest-authorization";

const SECRET = "livekit-secret-with-at-least-thirty-two-characters";
const BODY = '{"sessionId":"session-1","event":{"event_id":"event-1"}}';
const TIMESTAMP = "1783672200";

test("runtime transcript signatures bind the exact body and timestamp", () => {
  const signature = signRuntimeTranscriptBody({
    livekitApiSecret: SECRET,
    timestamp: TIMESTAMP,
    rawBody: BODY,
  });

  assert.deepEqual(
    authorizeRuntimeTranscriptRequest({
      rawBody: BODY,
      timestampHeader: TIMESTAMP,
      signatureHeader: signature,
      livekitApiSecret: SECRET,
      nowSeconds: Number(TIMESTAMP),
    }),
    { authorized: true }
  );
  assert.deepEqual(
    authorizeRuntimeTranscriptRequest({
      rawBody: `${BODY} `,
      timestampHeader: TIMESTAMP,
      signatureHeader: signature,
      livekitApiSecret: SECRET,
      nowSeconds: Number(TIMESTAMP),
    }),
    { authorized: false, reason: "invalid_signature" }
  );
});

test("runtime transcript authorization fails closed for stale or weak credentials", () => {
  const signature = signRuntimeTranscriptBody({
    livekitApiSecret: SECRET,
    timestamp: TIMESTAMP,
    rawBody: BODY,
  });
  assert.deepEqual(
    authorizeRuntimeTranscriptRequest({
      rawBody: BODY,
      timestampHeader: TIMESTAMP,
      signatureHeader: signature,
      livekitApiSecret: SECRET,
      nowSeconds: Number(TIMESTAMP) + 301,
    }),
    { authorized: false, reason: "stale_request" }
  );
  assert.deepEqual(
    authorizeRuntimeTranscriptRequest({
      rawBody: BODY,
      timestampHeader: TIMESTAMP,
      signatureHeader: signature,
      livekitApiSecret: "short",
      nowSeconds: Number(TIMESTAMP),
    }),
    { authorized: false, reason: "missing_configuration" }
  );
});
