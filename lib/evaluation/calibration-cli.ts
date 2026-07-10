import type {
  CalibrationExecutionKind,
  EvaluationCalibrationReport,
} from "./calibration";

export function getCalibrationCliExitCode(
  executionKind: CalibrationExecutionKind,
  report: EvaluationCalibrationReport
): 0 | 1 {
  if (executionKind === "live_provider") {
    return report.gate.launchAcceptance === "passed" ? 0 : 1;
  }
  if (executionKind === "deterministic_self_test") {
    return report.gate.deterministicHarness === "passed" ? 0 : 1;
  }
  return report.corpus.expectedStateMismatches === 0 &&
    report.corpus.invalidEvidenceAnchors === 0 &&
    report.metrics.insufficientHandlingRate === 1
    ? 0
    : 1;
}
