import { readFileSync } from "node:fs";

import { CALIBRATION_PRICING_CONTRACT } from "@/lib/evaluation/calibration-budget";
import {
  SAV_198_SPEND_AUTHORIZATION,
  activateCalibrationRun,
} from "@/lib/evaluation/calibration-run-ledger";

const [remoteUrl, approvalPath, activationId] = process.argv.slice(2);
if (!remoteUrl || !approvalPath || !activationId) {
  throw new Error("test_activation_worker_arguments_missing");
}

try {
  const authority = activateCalibrationRun({
    authorization: SAV_198_SPEND_AUTHORIZATION,
    adjudicationApproval: JSON.parse(readFileSync(approvalPath, "utf8")),
    model: CALIBRATION_PRICING_CONTRACT.model,
    repetitions: 3,
    remoteUrl,
    now: new Date("2026-07-12T07:00:00.000Z"),
    activationId,
  });
  process.stdout.write(`${authority.activationCommit}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "activation_failed"}\n`
  );
  process.exitCode = 1;
}
