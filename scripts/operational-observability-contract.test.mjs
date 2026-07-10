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

const CRITICAL_CALL_GRAPH_ROOTS = [
  ...CRITICAL_BOUNDARIES.map(([file]) => file),
  "app/api/feedback/generate/route.ts",
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
  const callGraphFiles = await collectLocalCallGraph(CRITICAL_CALL_GRAPH_ROOTS);
  for (const expected of [
    "lib/analytics/posthog-server.ts",
    "lib/db/questions.ts",
    "lib/evaluation/scorer.ts",
    "lib/google-sheets-api.ts",
    "lib/google-sheets-client.ts",
    "scripts/sync-questions-from-sheet.ts",
  ]) {
    assert.equal(
      callGraphFiles.includes(expected),
      true,
      `critical call graph omitted ${expected}`
    );
  }

  for (const file of callGraphFiles) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    const sourceWithoutApprovedSinks = stripComments(
      file === "lib/workflows/sync-question-bank.ts"
        ? source.replace("console.info(JSON.stringify(event));", "")
        : file === "lib/operations/operational-events.ts"
          ? source.replace(
              "write: (serialized) => console.error(serialized),",
              ""
            )
          : source
    );
    if (
      /console\.(?:error|warn|log|info|debug)\s*\(/.test(
        sourceWithoutApprovedSinks
      )
    )
      violations.push(file);
  }

  assert.deepEqual(violations, []);
});

test("Stripe durable observability stores only redacted payloads and stable failure codes", async () => {
  const source = await readFile(
    path.join(ROOT, "app/api/webhooks/stripe/route.ts"),
    "utf8"
  );

  assert.doesNotMatch(source, /payload:\s*JSON\.stringify\(event\)/);
  assert.doesNotMatch(source, /lastError:\s*error\s+instanceof\s+Error/);
  assert.match(source, /payload:\s*REDACTED_STRIPE_EVENT_PAYLOAD/);
  assert.match(source, /lastError:\s*STRIPE_WEBHOOK_PROCESSING_FAILURE_CODE/);
});

test("the operational contract cannot accept arbitrary context or error objects", async () => {
  const source = await readFile(
    path.join(ROOT, "lib/operations/operational-events.ts"),
    "utf8"
  );

  assert.doesNotMatch(source, /context\s*[?:]/);
  assert.doesNotMatch(source, /error\s*[?:]\s*unknown/);
  assert.doesNotMatch(source, /stack\s*[?:]/);
  assert.match(source, /OPERATIONAL_FAILURE_ERROR_CODES/);
  assert.match(source, /OPERATIONAL_FAILURE_ERROR_CODE_SET/);
  assert.match(source, /UUID_PATTERN/);
  assert.doesNotMatch(source, /readOpaqueCorrelationId/);
  assert.match(source, /InterviewSessionCorrelationSource/);
});

async function collectLocalCallGraph(entryFiles) {
  const visited = new Set();
  const queue = [...entryFiles];

  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const source = await readFile(path.join(ROOT, file), "utf8");
    const importPattern = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
    for (const match of source.matchAll(importPattern)) {
      const resolved = await resolveLocalImport(file, match[1]);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }

  return [...visited].sort();
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

async function resolveLocalImport(importer, specifier) {
  let unresolved;
  if (specifier.startsWith("@/")) {
    unresolved = specifier.slice(2);
  } else if (specifier.startsWith(".")) {
    unresolved = path.normalize(path.join(path.dirname(importer), specifier));
  } else {
    return null;
  }

  for (const candidate of [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    path.join(unresolved, "index.ts"),
    path.join(unresolved, "index.tsx"),
  ]) {
    try {
      await readFile(path.join(ROOT, candidate), "utf8");
      return candidate;
    } catch {
      // Try the next local TypeScript resolution candidate.
    }
  }
  return null;
}
