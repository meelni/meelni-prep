import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const STORE = "lib/db/adaptive-interviewer-preview-shadow-control-plane";
const WORKFLOW =
  "lib/workflows/adaptive-interviewer-preview-shadow-control-plane";
const VERIFIER =
  "lib/security/adaptive-interviewer-preview-shadow-owner-decision";

test("durable Preview-shadow authority remains server-owned and unwired", () => {
  const forbiddenConsumers = [
    "app",
    "components",
    "packages/agent",
    "packages/core",
    "packages/integrations",
    "agent",
    "lib/interview",
    "lib/livekit",
  ];
  for (const moduleName of [STORE, WORKFLOW]) {
    const matches = grep(moduleName, forbiddenConsumers);
    assert.deepEqual(
      matches,
      [],
      `${moduleName} must not be imported by app/session/runtime/provider surfaces`
    );
  }

  const publicIndexes = grep(
    "adaptive-interviewer-preview-shadow-control-plane",
    ["packages", "lib"],
    ["**/index.ts", "**/index.tsx"]
  );
  assert.deepEqual(publicIndexes, []);
  assert.deepEqual(
    grep("adaptive-interviewer-preview-shadow-owner-keys.json", [
      "app",
      "lib",
      "packages",
      "agent",
    ]),
    []
  );
});

test("durable authority has no ambient secret, provider, room, flag, or log seam", () => {
  const sources = [`${STORE}.ts`, `${WORKFLOW}.ts`, `${VERIFIER}.ts`].map(
    (path) => readFileSync(path, "utf8")
  );
  const joined = sources.join("\n");
  for (const forbidden of [
    "process.env",
    "Deno.env",
    "fetch(",
    "AsyncOpenAI",
    "LiveKit",
    "RoomServiceClient",
    "startInterviewRoom",
    "adapter=None",
    "console.log",
    "console.error",
  ]) {
    assert.equal(
      joined.includes(forbidden),
      false,
      `durable authority must not contain ${forbidden}`
    );
  }
  assert.doesNotMatch(
    joined,
    /setFeatureFlag|mutateFlag|deployPreview|deployProduction/
  );
});

test("durable schema persists digests and closed evidence, never raw trust material", () => {
  const schema = readFileSync("lib/db/schema-preview-shadow.ts", "utf8");
  for (const forbidden of [
    "signatureValue",
    "signature_value",
    "publicKeyPem",
    "public_key_pem",
    "runControlCapability:",
    "workerEvidenceCapability:",
    "terminationCapability:",
    "transcriptText",
    "interview_content",
    "room_name",
    "participant_identity",
  ]) {
    assert.equal(schema.includes(forbidden), false);
  }
  for (const required of [
    "runControlCapabilitySha256",
    "workerEvidenceCapabilitySha256",
    "terminationCapabilitySha256",
    "ownerDecisionArtifactSha256",
  ]) {
    assert.equal(schema.includes(required), true);
  }
});

function grep(pattern, roots, globs = []) {
  const args = ["-l", "--fixed-strings", pattern];
  for (const glob of globs) args.push("--glob", glob);
  args.push(...roots);
  try {
    return execFileSync("rg", args, { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean)
      .sort();
  } catch (error) {
    if (error && typeof error === "object" && error.status === 1) return [];
    throw error;
  }
}
