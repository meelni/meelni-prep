import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const CRITICAL_BOUNDARIES = [
  ["app/auth/callback/route.ts", "auth_callback"],
  ["app/api/livekit/token/route.ts", "interview_token"],
  ["lib/workflows/join-interview-session.ts", "interview_token"],
  ["app/api/session/start/route.ts", "interview_start"],
  ["lib/workflows/start-session.ts", "interview_start"],
  ["app/api/interview/end/route.ts", "interview_end"],
  ["app/api/feedback/[sessionId]/route.ts", "feedback_dispatch"],
  ["lib/workflows/dispatch-feedback-generation.ts", "feedback_dispatch"],
  ["lib/inngest/functions/generate-feedback.ts", "feedback_dispatch"],
  ["app/api/webhooks/stripe/route.ts", "stripe_webhook"],
  ["lib/workflows/sync-question-bank.ts", "question_sync"],
  ["lib/inngest/functions/delete-account.ts", "account_deletion"],
  ["app/api/user/delete/route.ts", "account_deletion"],
  ["app/api/billing/credits/route.ts", "billing_read"],
  ["app/api/billing/payment-history/route.ts", "billing_read"],
  ["app/api/billing/subscription/route.ts", "billing_read"],
  ["app/api/billing/usage/route.ts", "billing_read"],
  ["app/api/billing/portal/route.ts", "billing_portal"],
  ["app/api/customer-portal/route.ts", "billing_portal"],
  ["lib/inngest/functions/enforce-interview-deadline.ts", "interview_recovery"],
  [
    "lib/inngest/functions/enforce-interview-reconnect.ts",
    "interview_recovery",
  ],
  [
    "lib/inngest/functions/reconcile-interview-presence.ts",
    "interview_recovery",
  ],
  ["lib/inngest/functions/cleanup-interview-rooms.ts", "interview_recovery"],
  ["lib/inngest/functions/recover-interview-starts.ts", "interview_recovery"],
  ["lib/inngest/functions/recover-interview-credits.ts", "interview_recovery"],
];

const BILLING_BOUNDARY_ERROR_CODES = [
  ["app/api/billing/credits/route.ts", ["billing_credit_read_failed"]],
  [
    "app/api/billing/payment-history/route.ts",
    ["billing_payment_history_read_failed"],
  ],
  [
    "app/api/billing/subscription/route.ts",
    ["billing_subscription_read_failed"],
  ],
  ["app/api/billing/usage/route.ts", ["billing_usage_read_failed"]],
  [
    "app/api/billing/portal/route.ts",
    [
      "billing_portal_subscription_read_failed",
      "billing_portal_customer_lookup_failed",
      "billing_portal_session_failed",
    ],
  ],
  [
    "app/api/customer-portal/route.ts",
    [
      "billing_portal_subscription_read_failed",
      "billing_portal_customer_lookup_failed",
      "billing_portal_session_failed",
    ],
  ],
];

test("every launch-critical boundary emits the closed operational contract", async () => {
  const missing = [];
  for (const [file, operation] of CRITICAL_BOUNDARIES) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    if (!source.includes("reportOperationalFailure")) {
      missing.push(`${file}: reporter`);
    }
    if (!source.includes(`operation: "${operation}"`)) {
      missing.push(`${file}: ${operation}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("critical boundaries cannot bypass the reporter with ad hoc console output", async () => {
  const violations = [];
  for (const [file] of CRITICAL_BOUNDARIES) {
    const source = stripComments(await readFile(path.join(ROOT, file), "utf8"));
    const approved =
      file === "lib/workflows/sync-question-bank.ts"
        ? source.replace(
            'console.info("question_sync_audit", JSON.stringify(event));',
            ""
          )
        : source;
    if (/console\.(?:error|warn|log|info|debug)\s*\(/.test(approved)) {
      violations.push(file);
    }
  }
  assert.deepEqual(violations, []);
});

test("billing boundaries retain their fixed route-level error codes", async () => {
  const missing = [];
  for (const [file, errorCodes] of BILLING_BOUNDARY_ERROR_CODES) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    for (const errorCode of errorCodes) {
      if (!source.includes(`errorCode: "${errorCode}"`)) {
        missing.push(`${file}: ${errorCode}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("the reporter interface cannot accept arbitrary failure data", async () => {
  const source = await readFile(
    path.join(ROOT, "lib/operations/operational-events.ts"),
    "utf8"
  );
  assert.doesNotMatch(source, /context\s*[?:]/);
  assert.doesNotMatch(source, /error\s*[?:]\s*unknown/);
  assert.doesNotMatch(source, /stack\s*[?:]/);
  assert.match(source, /OPERATIONAL_FAILURE_ERROR_CODES/);
  assert.match(source, /ERROR_CODE_SET/);
  assert.match(source, /OwnedInterviewSessionCorrelationSource/);
  assert.match(source, /requestId:\s*null/);
});

test("LiveKit join audits cannot retain raw user or requested session IDs", async () => {
  const source = await readFile(
    path.join(ROOT, "lib/workflows/join-interview-session.ts"),
    "utf8"
  );
  const contract = source.match(/audit\(event:\s*\{([\s\S]*?)\}\): void;/)?.[1];
  assert.ok(contract, "join audit contract must remain explicit");
  assert.doesNotMatch(contract, /\buserId\b/);
  assert.doesNotMatch(contract, /\bsessionId\b/);
  assert.match(contract, /correlationId/);
  assert.doesNotMatch(source, /LiveKitJoinAudit/);
});

test("Stripe durable observability remains payload and exception-text free", async () => {
  const source = await readFile(
    path.join(ROOT, "app/api/webhooks/stripe/route.ts"),
    "utf8"
  );
  assert.doesNotMatch(source, /payload:\s*JSON\.stringify\(event\)/);
  assert.doesNotMatch(source, /lastError:\s*error\s+instanceof\s+Error/);
  assert.match(source, /payload:\s*"\{\}"/);
  assert.match(source, /lastError:\s*safeStripeWebhookErrorCode\(error\)/);
});

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
