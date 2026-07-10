import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const CRITICAL_BOUNDARIES = [
  ["app/auth/callback/route.ts", "auth_callback"],
  ["app/api/livekit/token/route.ts", "interview_token"],
  ["app/api/session/start/route.ts", "interview_start"],
  ["app/api/interview/end/route.ts", "interview_end"],
  ["app/api/feedback/[sessionId]/route.ts", "feedback_queue"],
  ["lib/inngest/functions/generate-feedback.ts", "feedback_queue"],
  ["app/api/webhooks/stripe/route.ts", "stripe_webhook"],
  ["lib/workflows/sync-question-bank.ts", "question_sync"],
  ["lib/inngest/functions/delete-account.ts", "account_deletion"],
];

test("every launch-critical boundary emits the closed operational contract", async () => {
  const missing = [];

  for (const [file, operation] of CRITICAL_BOUNDARIES) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    if (!source.includes("reportOperationalFailure"))
      missing.push(`${file}: reporter`);
    if (!source.includes(`operation: "${operation}"`)) {
      missing.push(`${file}: ${operation}`);
    }
  }

  assert.deepEqual(missing, []);
});

test("instrumented boundaries cannot bypass the redacted reporter with console output", async () => {
  const violations = [];

  for (const [file] of CRITICAL_BOUNDARIES) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    const sourceWithoutClosedOutcomeAudit =
      file === "lib/workflows/sync-question-bank.ts"
        ? source.replace("console.info(JSON.stringify(event));", "")
        : source;
    if (
      /console\.(?:error|warn|log|info|debug)\s*\(/.test(
        sourceWithoutClosedOutcomeAudit
      )
    )
      violations.push(file);
  }

  assert.deepEqual(violations, []);
});

test("the operational contract cannot accept arbitrary context or error objects", async () => {
  const source = await readFile(
    path.join(ROOT, "lib/operations/operational-events.ts"),
    "utf8"
  );

  assert.doesNotMatch(source, /context\s*[?:]/);
  assert.doesNotMatch(source, /error\s*[?:]\s*unknown/);
  assert.doesNotMatch(source, /stack\s*[?:]/);
  assert.match(source, /SAFE_CODE_PATTERN/);
  assert.match(source, /UUID_PATTERN/);
});
