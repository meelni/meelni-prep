import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const HISTORICAL_V7_REPORTS = {
  "docs/evidence/sav-198-evaluation-calibration-preflight.json":
    "3d143774ac5501639dc865cef6c3370dccb081131c2f16a10f7fad61ed3781da",
  "docs/evidence/sav-198-evaluation-calibration-self-test.json":
    "f41d2ceeb19747d8d567605f14c4e9618b4f6bdf3c2eb7f9d279ac05c7697740",
} as const;

test("historical v7 calibration reports remain byte-for-byte immutable technical evidence", () => {
  for (const [path, expectedHash] of Object.entries(HISTORICAL_V7_REPORTS)) {
    const bytes = readFileSync(path);
    const report = JSON.parse(bytes.toString("utf8")) as {
      contractVersion?: unknown;
      gate?: Record<string, unknown>;
    };

    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      expectedHash
    );
    assert.equal(report.contractVersion, "evaluation-calibration-report.v7");
    assert.equal(typeof report.gate?.launchAcceptance, "string");
    assert.equal("calibrationEvidenceAcceptance" in (report.gate ?? {}), false);
  }
});

test("the SAV-250 audit remains bound to its panel signoffs", () => {
  const signoffs = JSON.parse(
    readFileSync("docs/evidence/sav-250-agent-panel-signoffs.json", "utf8")
  ) as {
    auditArtifact?: { path?: unknown; sha256?: unknown };
    panels?: Array<{ auditArtifactHash?: unknown }>;
  };
  const auditPath = signoffs.auditArtifact?.path;
  const auditHash = signoffs.auditArtifact?.sha256;

  assert.equal(
    auditPath,
    "docs/evidence/sav-250-adjudicated-evidence-anchor-audit.md"
  );
  assert.equal(
    createHash("sha256")
      .update(readFileSync(auditPath as string))
      .digest("hex"),
    auditHash
  );
  assert.deepEqual(
    signoffs.panels?.map(({ auditArtifactHash }) => auditArtifactHash),
    [auditHash, auditHash]
  );
});
