import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evaluationCalibrationCases } from "@meelni/test-fixtures";

import {
  CALIBRATION_PRICING_CONTRACT,
  CALIBRATION_REQUEST_TIMEOUT_MS,
  CalibrationSpendGuard,
} from "./calibration-budget";
import {
  CALIBRATION_LEDGER_LEASE_TTL_MS,
  DurableCalibrationRunLedger,
  SAV_198_APPROVED_RUN_ID,
  SAV_198_SPEND_AUTHORIZATION,
  parseCalibrationSpendAuthorization,
} from "./calibration-run-ledger";

const MODEL = CALIBRATION_PRICING_CONTRACT.model;
const FIXTURE = evaluationCalibrationCases.find(
  ({ expectedCompletionState }) =>
    expectedCompletionState === "full" || expectedCompletionState === "partial"
)!;
const TEST_ROOT = mkdtempSync(join(tmpdir(), "meelni-sav198-ledger-"));

test.after(() => rmSync(TEST_ROOT, { recursive: true, force: true }));

test("authorization is bound to the one approved aggregate run", () => {
  assert.ok(CALIBRATION_LEDGER_LEASE_TTL_MS > CALIBRATION_REQUEST_TIMEOUT_MS);
  const checkedManifest = JSON.parse(
    readFileSync(
      join(process.cwd(), "docs/evidence/sav-198-paid-run-authorization.json"),
      "utf8"
    )
  );
  assert.deepEqual(
    parseCalibrationSpendAuthorization(checkedManifest),
    SAV_198_SPEND_AUTHORIZATION
  );
  assert.deepEqual(
    parseCalibrationSpendAuthorization(SAV_198_SPEND_AUTHORIZATION),
    SAV_198_SPEND_AUTHORIZATION
  );
  assert.throws(
    () =>
      parseCalibrationSpendAuthorization({
        ...SAV_198_SPEND_AUTHORIZATION,
        runId: "mint-another-budget",
      }),
    /runId_mismatch/
  );
  assert.equal(SAV_198_SPEND_AUTHORIZATION.runId, SAV_198_APPROVED_RUN_ID);
  assert.equal(SAV_198_SPEND_AUTHORIZATION.singleAggregateRun, true);
});

test("exclusive lease rejects a concurrent calibration process", () => {
  const stateDirectory = isolatedDirectory("concurrent");
  const clock = mutableClock("2026-07-12T07:00:00.000Z");
  const first = openLedger(stateDirectory, "owner-one", clock.read);
  try {
    assert.throws(
      () => openLedger(stateDirectory, "owner-two", clock.read),
      /already_has_active_process/
    );
  } finally {
    first.release();
  }
});

test("stale-lock recovery preserves the pre-request reservation and cumulative budget", () => {
  const stateDirectory = isolatedDirectory("crash-resume");
  const clock = mutableClock("2026-07-12T07:00:00.000Z");
  const crashedLedger = openLedger(stateDirectory, "crashed-owner", clock.read);
  const firstGuard = new CalibrationSpendGuard(
    MODEL,
    clock.read,
    crashedLedger
  );
  const reservation = firstGuard.reserve(FIXTURE, `${FIXTURE.id}:0`)!;
  const firstReport = firstGuard.report();
  assert.equal(firstReport.attemptedCalls, 1);
  assert.equal(firstReport.actualCostComplete, false);
  assert.ok(firstReport.unreconciledReservedCostUsd > 0);

  const checkpointText = readFileSync(crashedLedger.checkpointPath, "utf8");
  assert.equal(checkpointText.includes(FIXTURE.transcript[0].text), false);
  assert.equal(checkpointText.includes("OPENAI_API_KEY"), false);
  assert.equal(checkpointText.includes("Canonical transcript"), false);
  firstGuard.assertPhysicalRequestAllowed(reservation);
  assert.equal(firstGuard.report().physicalHttpAttemptCeiling, 1);

  clock.advance(CALIBRATION_LEDGER_LEASE_TTL_MS + 1);
  const staleMtime = new Date(
    clock.read().getTime() - CALIBRATION_LEDGER_LEASE_TTL_MS - 1
  );
  utimesSync(crashedLedger.leasePath, staleMtime, staleMtime);

  const recoveredLedger = openLedger(
    stateDirectory,
    "recovered-owner",
    clock.read
  );
  try {
    const recoveredGuard = new CalibrationSpendGuard(
      MODEL,
      clock.read,
      recoveredLedger
    );
    assert.equal(recoveredGuard.hasAttemptedCall(`${FIXTURE.id}:0`), true);
    assert.equal(recoveredGuard.report().attemptedCalls, 1);
    assert.equal(recoveredGuard.report().physicalHttpAttemptCeiling, 1);
    assert.equal(
      recoveredGuard.report().unreconciledReservedCostUsd,
      reservation.worstCaseNanoUsd / 1_000_000_000
    );

    recoveredGuard.recordResumedSkippedCall();
    const second = recoveredGuard.reserve(FIXTURE, `${FIXTURE.id}:1`)!;
    assert.ok(second);
    assert.equal(recoveredGuard.report().attemptedCalls, 2);
    assert.equal(recoveredGuard.report().resumedSkippedCalls, 1);
  } finally {
    recoveredLedger.release();
    crashedLedger.release();
  }
});

test("terminal authorized run cannot be reopened with the same manifest", () => {
  const stateDirectory = isolatedDirectory("terminal");
  const clock = mutableClock("2026-07-12T07:00:00.000Z");
  const first = openLedger(stateDirectory, "first-owner", clock.read);
  const guard = new CalibrationSpendGuard(MODEL, clock.read, first);
  guard.finishPlan();
  first.release();

  const second = openLedger(stateDirectory, "second-owner", clock.read);
  try {
    assert.throws(
      () => new CalibrationSpendGuard(MODEL, clock.read, second),
      /authorized_run_is_already_terminal/
    );
  } finally {
    second.release();
  }
});

test("checkpoint totals cannot disagree with durable reservations", () => {
  const stateDirectory = isolatedDirectory("inconsistent-totals");
  const clock = mutableClock("2026-07-12T07:00:00.000Z");
  const first = openLedger(stateDirectory, "first-owner", clock.read);
  const guard = new CalibrationSpendGuard(MODEL, clock.read, first);
  guard.reserve(FIXTURE, `${FIXTURE.id}:0`);
  const checkpointPath = first.checkpointPath;
  first.release();

  const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8"));
  checkpoint.spend.unresolvedReservedNanoUsd = 0;
  writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);

  const second = openLedger(stateDirectory, "second-owner", clock.read);
  try {
    assert.throws(
      () => new CalibrationSpendGuard(MODEL, clock.read, second),
      /checkpoint_is_inconsistent/
    );
  } finally {
    second.release();
  }
});

function openLedger(
  stateDirectory: string,
  ownerId: string,
  clock: () => Date
): DurableCalibrationRunLedger {
  return DurableCalibrationRunLedger.open({
    authorization: SAV_198_SPEND_AUTHORIZATION,
    ownerId,
    clock,
    stateDirectory,
  });
}

function isolatedDirectory(name: string): string {
  return join(TEST_ROOT, name);
}

function mutableClock(initial: string): {
  read: () => Date;
  advance: (milliseconds: number) => void;
} {
  let now = new Date(initial).getTime();
  return {
    read: () => new Date(now),
    advance: (milliseconds) => {
      now += milliseconds;
    },
  };
}
