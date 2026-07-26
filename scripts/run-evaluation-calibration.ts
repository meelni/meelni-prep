import { createHash, randomBytes } from "node:crypto";
import {
  link,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { closeSync, constants, createReadStream, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import {
  createDeterministicCalibrationEvaluator,
  finalizeCalibrationReportWithSemanticReview,
  finalizeCalibrationReportWithSemanticReviewFailure,
  runEvaluationCalibration,
  validateCalibrationRunBudget,
  type CalibrationExecutionKind,
  type EvaluationCalibrationReport,
} from "@/lib/evaluation/calibration";
import { getFeedbackEvaluationModel } from "@/lib/evaluation/model-config";
import {
  CALIBRATION_MAX_COMPLETION_TOKENS,
  CALIBRATION_REQUEST_TIMEOUT_MS,
  CalibrationSpendGuard,
} from "@/lib/evaluation/calibration-budget";
import {
  assertCalibrationOpenAIEnvironment,
  generateFeedbackWithUsage,
} from "@/lib/evaluation/scorer";
import { buildCalibrationEvidenceHints } from "@/lib/evaluation/calibration-evidence-hints";
import {
  activateCalibrationRun,
  assertCalibrationSpendAuthorizationExecutable,
  buildCalibrationActivatedPlan,
  resumeDelegatedActivatedCalibrationRun,
  SAV_248_V32_SPEND_AUTHORIZATION,
} from "@/lib/evaluation/calibration-run-ledger";
import {
  assertCalibrationOwnerAuthorizationMatchesPlan,
  loadCalibrationOwnerAuthorization,
  type VerifiedCalibrationOwnerAuthorization,
} from "@/lib/evaluation/calibration-owner-authorization";
import { assertCalibrationReviewedSourceCheckout } from "@/lib/evaluation/calibration-source-attestation";
import {
  capturePrivateSyntheticOutput,
  cleanupPrivateSemanticCapture,
  completePrivateSemanticReviewAfterTerminalReport,
  finalizePrivateSemanticCapture,
  initializePrivateSemanticCapture,
  publishPrivateSemanticReviewBeforeTerminalReport,
  semanticAdjudicationReportSha256,
  type PrivateSemanticCaptureHandle,
} from "@/lib/evaluation/calibration-semantic-capture";
import {
  parsePlanCallKey,
  prepareCalibrationSemanticReviewPaths,
  waitForSemanticReviewArtifacts,
  type CalibrationSemanticReviewPaths,
} from "@/lib/evaluation/calibration-live-semantic-review";
import { getCalibrationCliExitCode } from "@/lib/evaluation/calibration-cli";
import {
  assertCalibrationLiveStartupState,
  CALIBRATION_LIVE_RUNTIME_READY,
  readCalibrationLiveCredentials,
} from "@/lib/evaluation/calibration-live-startup.mjs";
import { verifyDelegatedAgentAuthorization } from "@/lib/operations/delegated-agent-authorization";

const LIVE_ACKNOWLEDGEMENT = "I_UNDERSTAND_THIS_CALLS_A_PAID_MODEL";
const SELF_TEST_MODEL = "deterministic-calibration-self-test.v1";
const MAX_SEMANTIC_REVIEW_TIMEOUT_SECONDS = 7_200;
const CALIBRATION_PROVIDER_RUN_OVERHEAD_MS = 10 * 60 * 1_000;

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
  const repetitions = args.repetitions ?? 2;
  if (executionKind !== "preflight") {
    validateCalibrationRunBudget(repetitions);
  }
  let modelVersion: string | null = null;
  let evaluator;
  let spendGuard: CalibrationSpendGuard | undefined;
  let runAuthority:
    | Awaited<ReturnType<typeof activateCalibrationRun>>
    | undefined;
  let semanticCapture: PrivateSemanticCaptureHandle | undefined;
  let semanticPaths: CalibrationSemanticReviewPaths | undefined;
  let report: EvaluationCalibrationReport | undefined;
  let ownerAuthorization: VerifiedCalibrationOwnerAuthorization | undefined;
  let semanticReviewPassed = executionKind !== "live_provider";
  let semanticTerminalReportPublished = false;
  let terminationStarted = false;
  const handleTermination = (signal: NodeJS.Signals) => {
    if (terminationStarted) return;
    terminationStarted = true;
    void (async () => {
      try {
        await persistTerminalSemanticFailureIfPending();
      } catch {}
      if (semanticCapture && semanticTerminalReportPublished) {
        try {
          cleanupPrivateSemanticCapture(semanticCapture);
          semanticCapture = undefined;
        } catch {}
      }
      runAuthority?.release();
      process.exit(signal === "SIGINT" ? 130 : 143);
    })();
  };
  process.once("SIGINT", handleTermination);
  process.once("SIGTERM", handleTermination);
  const adjudicationApproval = args.approval
    ? JSON.parse(await readFile(resolve(process.cwd(), args.approval), "utf8"))
    : undefined;

  if (executionKind === "deterministic_self_test") {
    modelVersion = SELF_TEST_MODEL;
    evaluator = createDeterministicCalibrationEvaluator(modelVersion);
  }
  if (executionKind === "live_provider") {
    assertCalibrationLiveStartupState();
    if (
      Boolean(args.ownerAuthorization) === Boolean(args.delegatedAuthorization)
    ) {
      throw new Error("live_calibration_requires_exactly_one_authorization");
    }
    assertCalibrationOpenAIEnvironment(process.env);
    modelVersion = getFeedbackEvaluationModel();
    if (adjudicationApproval === undefined) {
      throw new Error("Live calibration requires an adjudication approval");
    }
    const semantic = requireSemanticReviewArgs(args);
    const delegatedAuthorization = args.delegatedAuthorization
      ? verifyDelegatedAgentAuthorization({
          artifact: JSON.parse(
            await readFile(
              resolve(process.cwd(), args.delegatedAuthorization),
              "utf8"
            )
          ),
        })
      : undefined;
    if (delegatedAuthorization) {
      if (!args.previousTerminalReport) {
        throw new Error("delegated_retry_requires_previous_terminal_report");
      }
      assertPreviousTerminalReportAllowsDelegatedRetry(
        JSON.parse(
          await readFile(
            resolve(process.cwd(), args.previousTerminalReport),
            "utf8"
          )
        )
      );
    }
    if (args.ownerAuthorization) {
      ownerAuthorization = await loadCalibrationOwnerAuthorization({
        authorizationPath: args.ownerAuthorization,
        repositoryRoot: process.cwd(),
      });
      assertCalibrationSpendAuthorizationExecutable(
        ownerAuthorization.authorization
      );
      assertCalibrationReviewedSourceCheckout(
        ownerAuthorization.authorization.reviewedSourceCommit
      );
    }
    const planned = buildCalibrationActivatedPlan({
      authorization:
        ownerAuthorization?.authorization ?? SAV_248_V32_SPEND_AUTHORIZATION,
      adjudicationApproval,
      model: modelVersion,
      repetitions,
      now: new Date(),
    });
    if (ownerAuthorization) {
      assertCalibrationOwnerAuthorizationMatchesPlan(
        ownerAuthorization,
        planned,
        new Date()
      );
    }
    semanticPaths = await prepareCalibrationSemanticReviewPaths({
      cwd: process.cwd(),
      ...semantic,
    });
    writeFileSync(4, `${CALIBRATION_LIVE_RUNTIME_READY}\n`);
    closeSync(4);
    const liveCredentials = await readCalibrationLiveCredentials(
      createReadStream("/dev/null", { fd: 3, autoClose: true })
    );
    if (liveCredentials.acknowledgement !== LIVE_ACKNOWLEDGEMENT) {
      throw new Error("calibration_live_credential_acknowledgement_mismatch");
    }
    if (delegatedAuthorization) {
      runAuthority = await resumeDelegatedActivatedCalibrationRun(
        {
          delegatedAuthorization,
          model: modelVersion,
          repetitions,
        },
        { githubToken: liveCredentials.githubToken }
      );
    }
    semanticCapture = initializePrivateSemanticCapture({
      directory: semanticPaths.captureDirectory,
      runId: runAuthority?.plan.runId ?? planned.runId,
      approvedPlan: {
        version: planned.contractVersion,
        sha256: runAuthority?.plan.planHash ?? planned.planHash,
      },
      corpus: {
        version: planned.goldSetVersion,
        sha256: planned.corpusHash,
      },
      prompt: {
        version: planned.promptVersion,
        sha256: planned.promptHash,
      },
      schema: {
        version: planned.responseFormatVersion,
        sha256: planned.responseFormatHash,
      },
      modelVersion: planned.model,
      caseRuns: (runAuthority?.plan.calls ?? planned.calls).map(({ callKey }) =>
        parsePlanCallKey(callKey)
      ),
      retentionExpiresAt: new Date(
        Date.now() +
          (runAuthority?.plan.calls.length ?? planned.calls.length) *
            CALIBRATION_REQUEST_TIMEOUT_MS +
          semanticPaths.timeoutSeconds * 1_000 +
          CALIBRATION_PROVIDER_RUN_OVERHEAD_MS
      ).toISOString(),
    });
    try {
      if (!runAuthority) {
        runAuthority = await activateCalibrationRun(
          {
            ownerAuthorization,
            authorization: ownerAuthorization!.authorization,
            adjudicationApproval,
            model: modelVersion,
            repetitions,
          },
          { githubToken: liveCredentials.githubToken }
        );
      }
    } catch (error) {
      cleanupPrivateSemanticCapture(semanticCapture);
      semanticCapture = undefined;
      throw error;
    }
    if (
      !delegatedAuthorization &&
      runAuthority.plan.planHash !== planned.planHash
    ) {
      runAuthority.release();
      cleanupPrivateSemanticCapture(semanticCapture);
      semanticCapture = undefined;
      throw new Error("calibration_v3_prepared_plan_changed_before_activation");
    }
    try {
      spendGuard = new CalibrationSpendGuard(
        modelVersion,
        () => new Date(),
        runAuthority
      );
    } catch (error) {
      runAuthority.release();
      cleanupPrivateSemanticCapture(semanticCapture);
      semanticCapture = undefined;
      throw error;
    }
    evaluator = ({
      fixture,
      evaluationState,
      beforePhysicalRequest,
      onRawSyntheticOutput,
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
          onRawSyntheticOutput,
          calibrationCredentials: {
            openaiApiKey: liveCredentials.openaiKey,
          },
          calibrationEvidenceHints: buildCalibrationEvidenceHints(fixture),
        }
      );
  }

  try {
    report = await runEvaluationCalibration({
      executionKind,
      evaluator,
      modelVersion,
      repetitions,
      adjudicationApproval,
      spendGuard,
      captureRawSyntheticOutput:
        executionKind === "live_provider"
          ? ({ fixture, runIndex, rawResponse }) => {
              if (!semanticCapture) {
                throw new Error("calibration_private_capture_is_not_active");
              }
              capturePrivateSyntheticOutput(semanticCapture, {
                caseRef: fixture.id,
                runIndex,
                rawResponse,
              });
            }
          : undefined,
    });
    let serialized = `${JSON.stringify(report, null, 2)}\n`;
    await publishCalibrationReport({
      executionKind,
      output: args.output,
      semanticPaths,
      serialized,
    });
    process.stdout.write(serialized);
    if (executionKind === "live_provider") {
      if (!semanticPaths) {
        throw new Error("calibration_semantic_review_paths_are_not_prepared");
      }
      if (
        report.gate.calibrationEvidenceAcceptance !== "pending_semantic_review"
      ) {
        cleanupPrivateSemanticCapture(semanticCapture!);
        semanticCapture = undefined;
      } else {
        const reviewInput = finalizePrivateSemanticCapture(semanticCapture!);
        await writePrivateFileAtomicNew(
          semanticPaths.reviewRequest,
          `${JSON.stringify(reviewInput, null, 2)}\n`
        );
        const artifacts = await waitForSemanticReviewArtifacts({
          panelA: semanticPaths.panelA,
          panelB: semanticPaths.panelB,
          executionAuthority: semanticPaths.executionAuthority,
          reviewInputSha256: reviewInput.reviewInputSha256,
          timeoutSeconds: semanticPaths.timeoutSeconds,
        });
        const canonicalMismatchCaseRuns = report.failures
          .filter(({ code }) => code === "adjudicated_evidence_not_matched")
          .map(({ caseId, runIndex }) => ({
            caseRef: caseId,
            runIndex: runIndex ?? -1,
          }));
        const semanticReport = publishPrivateSemanticReviewBeforeTerminalReport(
          {
            capture: semanticCapture!,
            publicReportPath: semanticPaths.semanticPublicReport,
            canonicalMismatchCaseRuns,
            trustedExecutionAuthority: artifacts.executionAuthority,
            panels: [
              {
                taskPath:
                  artifacts.executionAuthority.verifiedExecutions[0].taskPath,
                decisions: artifacts.panels[0].decisions,
              },
              {
                taskPath:
                  artifacts.executionAuthority.verifiedExecutions[1].taskPath,
                decisions: artifacts.panels[1].decisions,
              },
            ],
          }
        );
        report = finalizeCalibrationReportWithSemanticReview(report, {
          gate: semanticReport.semanticAdjudication.gate,
          semanticAdjudicationSha256:
            semanticAdjudicationReportSha256(semanticReport),
          reviewedOutputCount:
            semanticReport.semanticAdjudication.summary.outputCount,
          reviewedLegitimateAlternativeCount:
            semanticReport.semanticAdjudication.summary
              .reviewedLegitimateAlternativeCount,
        });
        serialized = `${JSON.stringify(report, null, 2)}\n`;
        await writePrivateFileAtomicReplace(semanticPaths.output, serialized);
        semanticTerminalReportPublished = true;
        const terminalReportSha256 = createHash("sha256")
          .update(serialized)
          .digest("hex");
        completePrivateSemanticReviewAfterTerminalReport({
          capture: semanticCapture!,
          publicReportPath: semanticPaths.semanticPublicReport,
          report: semanticReport,
          terminalReportPath: semanticPaths.output,
          terminalReportSha256,
        });
        semanticCapture = undefined;
        process.stdout.write(serialized);
        semanticReviewPassed =
          semanticReport.semanticAdjudication.gate === "passed";
      }
    }
  } catch (error) {
    await persistTerminalSemanticFailureIfPending();
    throw error;
  } finally {
    if (semanticCapture && semanticTerminalReportPublished) {
      cleanupPrivateSemanticCapture(semanticCapture);
      semanticCapture = undefined;
    }
    runAuthority?.release();
    process.removeListener("SIGINT", handleTermination);
    process.removeListener("SIGTERM", handleTermination);
  }

  process.exitCode =
    report &&
    getCalibrationCliExitCode(executionKind, report) === 0 &&
    semanticReviewPassed
      ? 0
      : 1;

  async function persistTerminalSemanticFailureIfPending(): Promise<void> {
    if (
      executionKind !== "live_provider" ||
      !report ||
      !semanticPaths ||
      semanticTerminalReportPublished ||
      report.gate.calibrationEvidenceAcceptance !== "pending_semantic_review"
    ) {
      return;
    }
    const failed = finalizeCalibrationReportWithSemanticReviewFailure(report);
    const serialized = `${JSON.stringify(failed, null, 2)}\n`;
    await writePrivateFileAtomicReplace(semanticPaths.output, serialized);
    report = failed;
    semanticReviewPassed = false;
    semanticTerminalReportPublished = true;
    process.stdout.write(serialized);
  }
}

function parseArgs(argv: string[]): {
  mode: "preflight" | "self-test" | "live";
  output?: string;
  repetitions?: number;
  approval?: string;
  ownerAuthorization?: string;
  delegatedAuthorization?: string;
  previousTerminalReport?: string;
  semanticCaptureDirectory?: string;
  semanticPublicReport?: string;
  semanticReviewRequest?: string;
  semanticPanelA?: string;
  semanticPanelB?: string;
  semanticExecutionAuthority?: string;
  semanticReviewTimeoutSeconds?: number;
} {
  let mode: "preflight" | "self-test" | "live" = "preflight";
  let output: string | undefined;
  let repetitions: number | undefined;
  let approval: string | undefined;
  let ownerAuthorization: string | undefined;
  let delegatedAuthorization: string | undefined;
  let previousTerminalReport: string | undefined;
  let semanticCaptureDirectory: string | undefined;
  let semanticPublicReport: string | undefined;
  let semanticReviewRequest: string | undefined;
  let semanticPanelA: string | undefined;
  let semanticPanelB: string | undefined;
  let semanticExecutionAuthority: string | undefined;
  let semanticReviewTimeoutSeconds: number | undefined;

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
    } else if (argument === "--owner-authorization") {
      ownerAuthorization = argv[++index];
      if (!ownerAuthorization) {
        throw new Error("--owner-authorization requires a path");
      }
    } else if (argument === "--delegated-agent-authorization") {
      delegatedAuthorization = argv[++index];
      if (!delegatedAuthorization) {
        throw new Error("--delegated-agent-authorization requires a path");
      }
    } else if (argument === "--previous-terminal-report") {
      previousTerminalReport = argv[++index];
      if (!previousTerminalReport) {
        throw new Error("--previous-terminal-report requires a path");
      }
    } else if (argument === "--semantic-capture-dir") {
      semanticCaptureDirectory = argv[++index];
      if (!semanticCaptureDirectory) {
        throw new Error("--semantic-capture-dir requires a path");
      }
    } else if (argument === "--semantic-public-report") {
      semanticPublicReport = argv[++index];
      if (!semanticPublicReport) {
        throw new Error("--semantic-public-report requires a path");
      }
    } else if (argument === "--semantic-review-request") {
      semanticReviewRequest = argv[++index];
      if (!semanticReviewRequest) {
        throw new Error("--semantic-review-request requires a path");
      }
    } else if (argument === "--semantic-panel-a") {
      semanticPanelA = argv[++index];
      if (!semanticPanelA) {
        throw new Error("--semantic-panel-a requires a path");
      }
    } else if (argument === "--semantic-panel-b") {
      semanticPanelB = argv[++index];
      if (!semanticPanelB) {
        throw new Error("--semantic-panel-b requires a path");
      }
    } else if (argument === "--semantic-execution-authority") {
      semanticExecutionAuthority = argv[++index];
      if (!semanticExecutionAuthority) {
        throw new Error("--semantic-execution-authority requires a path");
      }
    } else if (argument === "--semantic-review-timeout-seconds") {
      semanticReviewTimeoutSeconds = Number(argv[++index]);
      if (
        !Number.isInteger(semanticReviewTimeoutSeconds) ||
        semanticReviewTimeoutSeconds < 1 ||
        semanticReviewTimeoutSeconds > MAX_SEMANTIC_REVIEW_TIMEOUT_SECONDS
      ) {
        throw new Error(
          `--semantic-review-timeout-seconds must be 1-${MAX_SEMANTIC_REVIEW_TIMEOUT_SECONDS}`
        );
      }
    } else {
      throw new Error(`Unknown calibration argument: ${argument}`);
    }
  }
  return {
    mode,
    output,
    repetitions,
    approval,
    ownerAuthorization,
    delegatedAuthorization,
    previousTerminalReport,
    semanticCaptureDirectory,
    semanticPublicReport,
    semanticReviewRequest,
    semanticPanelA,
    semanticPanelB,
    semanticExecutionAuthority,
    semanticReviewTimeoutSeconds,
  };
}

type CalibrationArgs = ReturnType<typeof parseArgs>;

function requireSemanticReviewArgs(args: CalibrationArgs) {
  const values = {
    captureDirectory: args.semanticCaptureDirectory,
    semanticPublicReport: args.semanticPublicReport,
    reviewRequest: args.semanticReviewRequest,
    panelA: args.semanticPanelA,
    panelB: args.semanticPanelB,
    executionAuthority: args.semanticExecutionAuthority,
    output: args.output,
    timeoutSeconds: args.semanticReviewTimeoutSeconds,
  };
  if (
    !values.captureDirectory ||
    !values.semanticPublicReport ||
    !values.reviewRequest ||
    !values.panelA ||
    !values.panelB ||
    !values.executionAuthority ||
    !values.output ||
    !values.timeoutSeconds
  ) {
    throw new Error("live_calibration_requires_complete_semantic_review_paths");
  }
  return values as {
    captureDirectory: string;
    semanticPublicReport: string;
    reviewRequest: string;
    panelA: string;
    panelB: string;
    executionAuthority: string;
    output: string;
    timeoutSeconds: number;
  };
}

function assertPreviousTerminalReportAllowsDelegatedRetry(
  report: unknown
): void {
  if (!report || typeof report !== "object") {
    throw new Error("delegated_retry_previous_report_invalid");
  }
  const execution = (report as { execution?: unknown }).execution;
  if (!execution || typeof execution !== "object") {
    throw new Error("delegated_retry_previous_report_invalid");
  }
  const cost = (execution as { cost?: unknown }).cost;
  if (!cost || typeof cost !== "object") {
    throw new Error("delegated_retry_previous_report_missing_cost");
  }
  const typedExecution = execution as {
    paidProviderCalled?: unknown;
  };
  const typedCost = cost as {
    completedCalls?: unknown;
    reconciledActualCostUsd?: unknown;
  };
  if (
    typedExecution.paidProviderCalled !== true ||
    typedCost.completedCalls !== 0 ||
    typedCost.reconciledActualCostUsd !== 0
  ) {
    throw new Error("delegated_retry_previous_report_has_spend_or_completion");
  }
}

async function publishCalibrationReport(input: {
  executionKind: CalibrationExecutionKind;
  output: string | undefined;
  semanticPaths: CalibrationSemanticReviewPaths | undefined;
  serialized: string;
}): Promise<void> {
  if (input.executionKind === "live_provider") {
    if (!input.semanticPaths) {
      throw new Error("calibration_semantic_review_paths_are_not_prepared");
    }
    await writePrivateFileAtomicNew(
      input.semanticPaths.output,
      input.serialized
    );
    return;
  }
  if (!input.output) return;
  const target = resolve(process.cwd(), input.output);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, input.serialized, { encoding: "utf8", mode: 0o600 });
}

async function writePrivateFileAtomicNew(
  target: string,
  contents: string
): Promise<void> {
  const temporary = await writeSyncedPrivateTemporary(target, contents);
  try {
    await link(temporary, target);
    await unlink(temporary);
    await syncDirectory(dirname(target));
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function writePrivateFileAtomicReplace(
  target: string,
  contents: string
): Promise<void> {
  const current = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const currentStat = await current.stat();
    if (
      !currentStat.isFile() ||
      (currentStat.mode & 0o777) !== 0o600 ||
      currentStat.uid !== process.getuid?.() ||
      currentStat.nlink !== 1
    ) {
      throw new Error("calibration_report_replacement_target_is_unsafe");
    }
  } finally {
    await current.close();
  }
  const temporary = await writeSyncedPrivateTemporary(target, contents);
  try {
    await rename(temporary, target);
    await syncDirectory(dirname(target));
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function writeSyncedPrivateTemporary(
  target: string,
  contents: string
): Promise<string> {
  const temporary = join(
    dirname(target),
    `.${basename(target)}.${randomBytes(16).toString("hex")}.tmp`
  );
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(contents, { encoding: "utf8" });
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  await handle.close();
  return temporary;
}

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

function modeToExecutionKind(
  mode: "preflight" | "self-test" | "live"
): CalibrationExecutionKind {
  if (mode === "self-test") return "deterministic_self_test";
  if (mode === "live") return "live_provider";
  return "preflight";
}
