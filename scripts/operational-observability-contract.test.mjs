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
      const leaked = error;
      const { message: leakedMessage } = error;
      let assigned;
      assigned = leaked;
      console.log("aliased", leaked, leakedMessage, assigned);
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
    "unsafe.ts:9",
    "unsafe.ts:12",
  ]);

  const safe = findRawCaughtExceptionLogs(
    `import { toSafeErrorLog } from "@/lib/privacy/safe-error";
    try { work(); } catch (error) {
      console.error("stable_failure_code");
      console.error("classified_failure", { ...toSafeErrorLog(error) });
      const classified = toSafeErrorLog(error);
      console.error("aliased_classification", classified);
    }`,
    "safe.ts"
  );
  assert.deepEqual(safe, []);

  const shadowed = findRawCaughtExceptionLogs(
    `import { toSafeErrorLog } from "@/lib/privacy/safe-error";
    try { work(); } catch (error) {
      const toSafeErrorLog = (value) => value;
      console.error("shadowed", toSafeErrorLog(error));
      const disguised = toSafeErrorLog(error);
      console.error("shadowed_alias", disguised);
    }`,
    "shadowed.ts"
  );
  assert.deepEqual(shadowed, ["shadowed.ts:4", "shadowed.ts:6"]);

  const localOnly = findRawCaughtExceptionLogs(
    `const toSafeErrorLog = (value) => value;
    try { work(); } catch (error) {
      console.error("local", toSafeErrorLog(error));
      const disguised = toSafeErrorLog(error);
      console.error("local_alias", disguised);
    }`,
    "local-only.ts"
  );
  assert.deepEqual(localOnly, ["local-only.ts:3", "local-only.ts:5"]);
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
  const allowSafeClassifier = hasUnshadowedCanonicalSafeErrorImport(sourceFile);

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
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      isRawAliasExpression(node.initializer, caughtNames, allowSafeClassifier)
    ) {
      addBindingNames(node.name, caughtNames);
    }

    if (
      caughtNames.size > 0 &&
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isRawAliasExpression(node.right, caughtNames, allowSafeClassifier)
    ) {
      addAssignmentNames(node.left, caughtNames);
    }

    if (
      caughtNames.size > 0 &&
      ts.isCallExpression(node) &&
      isConsoleCall(node.expression) &&
      node.arguments.some((argument) =>
        containsRawCaughtReference(argument, caughtNames, allowSafeClassifier)
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

function addAssignmentNames(target, names) {
  if (ts.isIdentifier(target)) {
    names.add(target.text);
    return;
  }
  if (ts.isParenthesizedExpression(target)) {
    addAssignmentNames(target.expression, names);
    return;
  }
  if (ts.isArrayLiteralExpression(target)) {
    for (const element of target.elements) addAssignmentNames(element, names);
    return;
  }
  if (ts.isObjectLiteralExpression(target)) {
    for (const property of target.properties) {
      if (ts.isPropertyAssignment(property)) {
        addAssignmentNames(property.initializer, names);
      } else if (ts.isShorthandPropertyAssignment(property)) {
        names.add(property.name.text);
      } else if (ts.isSpreadAssignment(property)) {
        addAssignmentNames(property.expression, names);
      }
    }
  }
}

function containsRawCaughtReference(node, caughtNames, allowSafeClassifier) {
  if (
    allowSafeClassifier &&
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "toSafeErrorLog"
  ) {
    return false;
  }
  if (ts.isIdentifier(node) && caughtNames.has(node.text)) return true;

  let found = false;
  ts.forEachChild(node, (child) => {
    if (
      !found &&
      containsRawCaughtReference(child, caughtNames, allowSafeClassifier)
    ) {
      found = true;
    }
  });
  return found;
}

function isRawAliasExpression(node, caughtNames, allowSafeClassifier) {
  if (
    allowSafeClassifier &&
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "toSafeErrorLog"
  ) {
    return false;
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "toSafeErrorLog"
  ) {
    return node.arguments.some((argument) =>
      containsRawCaughtReference(argument, caughtNames, false)
    );
  }
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) return false;
  if (ts.isIdentifier(node) && caughtNames.has(node.text)) return true;

  let found = false;
  ts.forEachChild(node, (child) => {
    if (
      !found &&
      isRawAliasExpression(child, caughtNames, allowSafeClassifier)
    ) {
      found = true;
    }
  });
  return found;
}

function hasUnshadowedCanonicalSafeErrorImport(sourceFile) {
  let hasCanonicalImport = false;
  let hasShadow = false;

  function visit(node) {
    if (
      ts.isImportSpecifier(node) &&
      node.name.text === "toSafeErrorLog" &&
      !node.propertyName &&
      ts.isImportDeclaration(node.parent.parent.parent) &&
      ts.isStringLiteral(node.parent.parent.parent.moduleSpecifier) &&
      node.parent.parent.parent.moduleSpecifier.text ===
        "@/lib/privacy/safe-error"
    ) {
      hasCanonicalImport = true;
    } else if (declaresBinding(node, "toSafeErrorLog")) {
      hasShadow = true;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return hasCanonicalImport && !hasShadow;
}

function declaresBinding(node, name) {
  if (
    ts.isVariableDeclaration(node) ||
    ts.isParameter(node) ||
    ts.isBindingElement(node)
  ) {
    return bindingContainsName(node.name, name);
  }
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isClassDeclaration(node) ||
      ts.isClassExpression(node)) &&
    node.name
  ) {
    return node.name.text === name;
  }
  if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node)) {
    return node.name.text === name;
  }
  if (ts.isImportClause(node) && node.name) return node.name.text === name;
  return false;
}

function bindingContainsName(binding, name) {
  if (ts.isIdentifier(binding)) return binding.text === name;
  return binding.elements.some(
    (element) =>
      ts.isBindingElement(element) && bindingContainsName(element.name, name)
  );
}

function isConsoleCall(expression) {
  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "console" &&
    ["error", "warn", "log", "info", "debug"].includes(expression.name.text)
  );
}
