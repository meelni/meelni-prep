import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  createDeterministicCalibrationEvaluator,
  runEvaluationCalibration,
  type CalibrationExecutionKind,
} from "@/lib/evaluation/calibration";
import { getFeedbackEvaluationModel } from "@/lib/evaluation/model-config";
import { generateFeedback } from "@/lib/evaluation/scorer";

const LIVE_ACKNOWLEDGEMENT = "I_UNDERSTAND_THIS_CALLS_A_PAID_MODEL";
const SELF_TEST_MODEL = "deterministic-calibration-self-test.v1";

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "blocked",
      error: error instanceof Error ? error.message : "calibration_failed",
    })
  );
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const executionKind = modeToExecutionKind(args.mode);
  const repetitions = args.repetitions ?? 3;
  let modelVersion: string | null = null;
  let evaluator;

  if (executionKind === "deterministic_self_test") {
    modelVersion = SELF_TEST_MODEL;
    evaluator = createDeterministicCalibrationEvaluator(modelVersion);
  }
  if (executionKind === "live_provider") {
    if (process.env.MEELNI_ALLOW_PAID_CALIBRATION !== LIVE_ACKNOWLEDGEMENT) {
      throw new Error(
        `Live calibration is disabled. Set MEELNI_ALLOW_PAID_CALIBRATION=${LIVE_ACKNOWLEDGEMENT} only after explicit spend authorization.`
      );
    }
    if (!process.env.OPENAI_API_KEY?.trim()) {
      throw new Error("OPENAI_API_KEY is required for an authorized live run");
    }
    modelVersion = getFeedbackEvaluationModel();
    evaluator = ({
      fixture,
      evaluationState,
    }: Parameters<
      ReturnType<typeof createDeterministicCalibrationEvaluator>
    >[0]) =>
      generateFeedback(fixture.roundType, fixture.transcript, evaluationState);
  }

  const report = await runEvaluationCalibration({
    executionKind,
    evaluator,
    modelVersion,
    repetitions,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) {
    const target = resolve(process.cwd(), args.output);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, serialized, { encoding: "utf8", mode: 0o600 });
  }
  process.stdout.write(serialized);

  if (
    executionKind === "live_provider" &&
    report.gate.liveProviderAcceptance !== "passed"
  ) {
    process.exitCode = 1;
  }
  if (
    executionKind === "deterministic_self_test" &&
    report.gate.deterministicHarness !== "passed"
  ) {
    process.exitCode = 1;
  }
  if (
    executionKind === "preflight" &&
    (report.corpus.expectedStateMismatches > 0 ||
      report.corpus.invalidEvidenceAnchors > 0 ||
      report.metrics.insufficientHandlingRate !== 1)
  ) {
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): {
  mode: "preflight" | "self-test" | "live";
  output?: string;
  repetitions?: number;
} {
  let mode: "preflight" | "self-test" | "live" = "preflight";
  let output: string | undefined;
  let repetitions: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--mode") {
      const value = argv[++index];
      if (value !== "preflight" && value !== "self-test" && value !== "live") {
        throw new Error("--mode must be preflight, self-test, or live");
      }
      mode = value;
    } else if (argument === "--output") {
      output = argv[++index];
      if (!output) throw new Error("--output requires a path");
    } else if (argument === "--repetitions") {
      repetitions = Number(argv[++index]);
      if (!Number.isInteger(repetitions) || repetitions < 1) {
        throw new Error("--repetitions must be a positive integer");
      }
    } else {
      throw new Error(`Unknown calibration argument: ${argument}`);
    }
  }
  return { mode, output, repetitions };
}

function modeToExecutionKind(
  mode: "preflight" | "self-test" | "live"
): CalibrationExecutionKind {
  if (mode === "self-test") return "deterministic_self_test";
  if (mode === "live") return "live_provider";
  return "preflight";
}
