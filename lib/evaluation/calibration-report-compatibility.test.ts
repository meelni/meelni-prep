import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const HISTORICAL_V7_REPORTS = {
  "docs/evidence/sav-198-evaluation-calibration-live.json":
    "8fe935df4fa40c6102e6869d8d829eeb5d06064471814fd55e799adb602f5027",
  "docs/evidence/sav-198-evaluation-calibration-preflight.json":
    "6e6cdd3c4b1eb7219fff3bc3f41ef5724dbcbc7543eed335a20569181a682cdc",
  "docs/evidence/sav-198-evaluation-calibration-self-test.json":
    "3b29470bc38872b77d1e6e382399b06c03225302da0c28f6770c39957d440793",
  "docs/evidence/sav-248-evaluation-calibration-live.json":
    "37eca3a05b960e963bfe90ee490bb15eabac0752077cd60934c4bed64b96524b",
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
