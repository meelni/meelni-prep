import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const STORE = "lib/db/adaptive-interviewer-preview-shadow-control-plane";
const WORKFLOW =
  "lib/workflows/adaptive-interviewer-preview-shadow-control-plane";
const VERIFIER =
  "lib/security/adaptive-interviewer-preview-shadow-owner-decision";

test("durable Preview-shadow authority is reachable only through the dedicated internal worker route", () => {
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
  assert.deepEqual(grep(STORE, forbiddenConsumers), [
    "app/api/internal/preview-shadow/route.ts",
  ]);
  assert.deepEqual(grep(WORKFLOW, forbiddenConsumers), []);

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

test("Preview worker wiring cannot enter ordinary session-start or public package surfaces", () => {
  const runtimeConsumers = grep("preview_shadow_entrypoint", [
    "app",
    "components",
    "lib",
    "packages",
    "agent",
  ]);
  assert.deepEqual(runtimeConsumers, [
    "agent/interview/agent.py",
    "agent/shared/preview_shadow_entrypoint.py",
    "agent/test_preview_shadow_entrypoint.py",
  ]);
  for (const path of [
    "app/api/session/start/route.ts",
    "lib/workflows/start-session.ts",
    "packages/agent/src/index.ts",
    "packages/integrations/src/index.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /preview.shadow.(operator|entrypoint|worker)/i);
  }
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
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...roots],
    {
    encoding: "utf8",
    }
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter(
      (path) =>
        globs.length === 0 ||
        globs.some((glob) => {
          const suffix = glob.startsWith("**/") ? glob.slice(3) : glob;
          return path === suffix || path.endsWith(`/${suffix}`);
        })
    )
    .filter((path) => readFileSync(path, "utf8").includes(pattern))
    .sort();
}
