import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const WORKFLOW = "lib/workflows/adaptive-interviewer-preview-shadow-rehearsal";
const PYTHON_BOOTSTRAP = "shared.preview_shadow_job";

test("Preview-shadow rehearsal wiring has no application or ordinary start consumer", () => {
  assert.deepEqual(
    grep(WORKFLOW, [
      "app",
      "components",
      "lib/workflows/start-session.ts",
      "lib/internal",
      "packages",
      "agent",
    ]),
    []
  );
  assert.deepEqual(
    grep(PYTHON_BOOTSTRAP, ["agent/interview", "agent/demo", "agent/agent.py"]),
    []
  );
  assert.deepEqual(
    grep("preview_shadow_job", [
      "agent/interview",
      "agent/demo",
      "agent/agent.py",
    ]),
    []
  );
});

test("rehearsal workflow and Python bootstrap have no ambient provider or flag lookup", () => {
  const sources = [`${WORKFLOW}.ts`, "agent/shared/preview_shadow_job.py"].map(
    (path) => readFileSync(path, "utf8")
  );
  const joined = sources.join("\n");
  for (const forbidden of [
    "process.env",
    "os.environ",
    "getenv(",
    "AsyncOpenAI(",
    "RoomServiceClient(",
    "AgentDispatchClient(",
    "setFeatureFlag",
    "deployPreview",
    "deployProduction",
  ]) {
    assert.equal(joined.includes(forbidden), false, forbidden);
  }
});

test("raw worker capability is isolated from room metadata and durable schema", () => {
  const livekit = readFileSync("packages/integrations/src/livekit.ts", "utf8");
  assert.match(livekit, /agentMetadata/);
  assert.doesNotMatch(livekit, /workerEvidenceCapability/);
  const schema = readFileSync("lib/db/schema-preview-shadow.ts", "utf8");
  assert.doesNotMatch(schema, /workerEvidenceCapability[^S]/);
  const roomMetadata = readFileSync(
    "packages/agent/src/room-metadata.ts",
    "utf8"
  );
  assert.doesNotMatch(roomMetadata, /worker_evidence_capability/);
});

function grep(pattern, roots) {
  const tracked = execFileSync("git", ["ls-files", "--", ...roots], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  return tracked
    .filter((path) => readFileSync(path, "utf8").includes(pattern))
    .sort();
}
