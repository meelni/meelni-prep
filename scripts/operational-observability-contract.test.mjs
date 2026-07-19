import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const ROOT = process.cwd();
const APP_API_ROUTE_FILES = await listRouteFiles(path.join(ROOT, "app/api"));
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
  ["app/api/checkout/status/route.ts", "checkout_confirmation"],
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

const DEPLOYED_SERVER_ERROR_BOUNDARIES = [
  ...new Set([
    ...APP_API_ROUTE_FILES,
    "app/auth/callback/route.ts",
    ...CRITICAL_BOUNDARIES.map(([file]) => file),
    "lib/analytics/posthog-server.ts",
    "lib/db/questions.ts",
    "lib/evaluation/scorer.ts",
  ]),
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

const CHECKOUT_CONFIRMATION_ERROR_CODES = [
  "checkout_confirmation_auth_failed",
  "checkout_confirmation_settlement_read_failed",
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

test("deployed server boundaries never write raw caught exceptions", async () => {
  const violations = [];
  for (const file of DEPLOYED_SERVER_ERROR_BOUNDARIES) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    violations.push(...findRawCaughtExceptionLogs(source, file));
  }
  assert.deepEqual(violations, []);
});

test("raw-exception guard permits fixed codes and the closed safe classifier only", () => {
  const unsafe = findRawCaughtExceptionLogs(
    `try { work(); } catch (error) {
      console.error("raw", error);
      console.warn("message", error.message);
      console.info("wrapped", getErrorMessage(error));
    }
    try { work(); } catch ({ message }) {
      console.debug("destructured", message);
    }`,
    "unsafe.ts"
  );
  assert.deepEqual(unsafe, [
    "unsafe.ts:2",
    "unsafe.ts:3",
    "unsafe.ts:4",
    "unsafe.ts:7",
  ]);

  const safe = findRawCaughtExceptionLogs(
    `try { work(); } catch (error) {
      console.error("stable_failure_code");
      console.error("classified_failure", { ...toSafeErrorLog(error) });
    }`,
    "safe.ts"
  );
  assert.deepEqual(safe, []);
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

test("checkout confirmation retains its fixed boundary error codes", async () => {
  const source = await readFile(
    path.join(ROOT, "app/api/checkout/status/route.ts"),
    "utf8"
  );
  const missing = CHECKOUT_CONFIRMATION_ERROR_CODES.filter(
    (errorCode) => !source.includes(`"${errorCode}"`)
  );
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

async function listRouteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return listRouteFiles(absolute);
      return entry.isFile() && entry.name === "route.ts"
        ? [path.relative(ROOT, absolute)]
        : [];
    })
  );
  return files.flat().sort();
}

function findRawCaughtExceptionLogs(source, filename) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const violations = [];

  function visit(node, caughtNames) {
    if (ts.isCatchClause(node)) {
      const nextNames = new Set(caughtNames);
      const binding = node.variableDeclaration?.name;
      if (binding) addBindingNames(binding, nextNames);
      visit(node.block, nextNames);
      return;
    }

    if (
      caughtNames.size > 0 &&
      ts.isCallExpression(node) &&
      isConsoleCall(node.expression) &&
      node.arguments.some((argument) =>
        containsRawCaughtReference(argument, caughtNames)
      )
    ) {
      const line =
        sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      violations.push(`${filename}:${line}`);
    }

    ts.forEachChild(node, (child) => visit(child, caughtNames));
  }

  visit(sourceFile, new Set());
  return violations;
}

function addBindingNames(binding, names) {
  if (ts.isIdentifier(binding)) {
    names.add(binding.text);
    return;
  }

  for (const element of binding.elements) {
    if (ts.isBindingElement(element)) addBindingNames(element.name, names);
  }
}

function containsRawCaughtReference(node, caughtNames) {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "toSafeErrorLog"
  ) {
    return false;
  }
  if (ts.isIdentifier(node) && caughtNames.has(node.text)) return true;

  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && containsRawCaughtReference(child, caughtNames)) found = true;
  });
  return found;
}

function isConsoleCall(expression) {
  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "console" &&
    ["error", "warn", "log", "info", "debug"].includes(expression.name.text)
  );
}
