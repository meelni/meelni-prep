import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  createDeterministicCalibrationEvaluator,
  runEvaluationCalibration,
  validateCalibrationRunBudget,
  type CalibrationExecutionKind,
} from "@/lib/evaluation/calibration";
import { getFeedbackEvaluationModel } from "@/lib/evaluation/model-config";
import {
  CALIBRATION_MAX_COMPLETION_TOKENS,
  CalibrationSpendGuard,
} from "@/lib/evaluation/calibration-budget";
import {
  assertCalibrationOpenAIEnvironment,
  generateFeedbackWithUsage,
} from "@/lib/evaluation/scorer";
import {
  DurableCalibrationRunLedger,
  SAV_198_SPEND_AUTHORIZATION,
} from "@/lib/evaluation/calibration-run-ledger";
import { getCalibrationCliExitCode } from "@/lib/evaluation/calibration-cli";

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
  if (executionKind !== "preflight") {
    validateCalibrationRunBudget(repetitions);
  }
  let modelVersion: string | null = null;
  let evaluator;
  let spendGuard: CalibrationSpendGuard | undefined;
  let runLedger: DurableCalibrationRunLedger | undefined;
  const adjudicationApproval = args.approval
    ? JSON.parse(await readFile(resolve(process.cwd(), args.approval), "utf8"))
    : undefined;

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
    assertCalibrationOpenAIEnvironment(process.env);
    modelVersion = getFeedbackEvaluationModel();
    runLedger = DurableCalibrationRunLedger.open({
      authorization: SAV_198_SPEND_AUTHORIZATION,
    });
    try {
      spendGuard = new CalibrationSpendGuard(
        modelVersion,
        () => new Date(),
        runLedger
      );
    } catch (error) {
      runLedger.release();
      throw error;
    }
    evaluator = ({
      fixture,
      evaluationState,
      beforePhysicalRequest,
    }: Parameters<
      ReturnType<typeof createDeterministicCalibrationEvaluator>
    >[0]) =>
      generateFeedbackWithUsage(
        fixture.roundType,
        fixture.transcript,
        evaluationState,
        {
          maxCompletionTokens: CALIBRATION_MAX_COMPLETION_TOKENS,
          calibrationPaidMode: true,
          beforePhysicalRequest,
        }
      );
  }

  let report;
  try {
    report = await runEvaluationCalibration({
      executionKind,
      evaluator,
      modelVersion,
      repetitions,
      adjudicationApproval,
      spendGuard,
    });
  } finally {
    runLedger?.release();
  }
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) {
    const target = resolve(process.cwd(), args.output);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, serialized, { encoding: "utf8", mode: 0o600 });
  }
  process.stdout.write(serialized);

  process.exitCode = getCalibrationCliExitCode(executionKind, report);
}

function parseArgs(argv: string[]): {
  mode: "preflight" | "self-test" | "live";
  output?: string;
  repetitions?: number;
  approval?: string;
} {
  let mode: "preflight" | "self-test" | "live" = "preflight";
  let output: string | undefined;
  let repetitions: number | undefined;
  let approval: string | undefined;

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
    } else if (argument === "--approval") {
      approval = argv[++index];
      if (!approval) throw new Error("--approval requires a path");
    } else {
      throw new Error(`Unknown calibration argument: ${argument}`);
    }
  }
  return { mode, output, repetitions, approval };
}

function modeToExecutionKind(
  mode: "preflight" | "self-test" | "live"
): CalibrationExecutionKind {
  if (mode === "self-test") return "deterministic_self_test";
  if (mode === "live") return "live_provider";
  return "preflight";
}
