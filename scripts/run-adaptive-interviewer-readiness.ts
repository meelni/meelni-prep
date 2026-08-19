import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAdaptiveInterviewerOwnerRequest } from "@meelni/agent";
import {
  ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE,
  buildAdaptiveInterviewerReadinessReport,
  serializeAdaptiveInterviewerReadinessReport,
} from "@/lib/operations/adaptive-interviewer-readiness";

export const ADAPTIVE_INTERVIEWER_READINESS_EVIDENCE_PATH =
  "docs/evidence/sav-477-adaptive-interviewer-readiness.json" as const;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function runAdaptiveInterviewerReadinessCli(
  args: readonly string[],
  io: {
    writeOut(value: string): void;
    writeError(value: string): void;
  },
  repoRoot = REPOSITORY_ROOT
): Promise<number> {
  try {
    if (args[0] === "owner-request") {
      if (args.length !== 3 || args[1] !== "--candidate-sha") {
        throw new Error("adaptive_interviewer_readiness_usage_invalid");
      }
      const report = buildAdaptiveInterviewerReadinessReport(
        await readFrozenEvidence(repoRoot)
      );
      const request = createAdaptiveInterviewerOwnerRequest({
        candidateGitSha: args[2]!,
        repositoryRolloutConfigurationSha256:
          report.rollout_policy.configuration_sha256,
      });
      io.writeOut(`${JSON.stringify(request, null, 2)}\n`);
      return 0;
    }
    const verifyPath = parseReportArgs(args);
    const report = buildAdaptiveInterviewerReadinessReport(
      await readFrozenEvidence(repoRoot)
    );
    const serialized = serializeAdaptiveInterviewerReadinessReport(report);
    if (verifyPath !== null) {
      if (
        isAbsolute(verifyPath) ||
        verifyPath !== ADAPTIVE_INTERVIEWER_READINESS_EVIDENCE_PATH
      ) {
        throw new Error("adaptive_interviewer_readiness_path_invalid");
      }
      const committed = await readRegularFile(
        resolve(repoRoot, ADAPTIVE_INTERVIEWER_READINESS_EVIDENCE_PATH)
      );
      if (committed !== serialized) {
        throw new Error("adaptive_interviewer_readiness_evidence_mismatch");
      }
      io.writeOut(
        `${report.report_sha256} ${ADAPTIVE_INTERVIEWER_READINESS_EVIDENCE_PATH}\n`
      );
      return 0;
    }
    io.writeOut(serialized);
    return 0;
  } catch (error) {
    io.writeError(
      `${error instanceof Error ? error.message : "adaptive_interviewer_readiness_failed"}\n`
    );
    return 1;
  }
}

async function readFrozenEvidence(repoRoot: string) {
  const [
    benchmarkJson,
    adjudicationJson,
    adaptiveFeedbackSource,
    observabilityJson,
  ] = await Promise.all([
    readRegularFile(
      resolve(repoRoot, ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE.benchmark.path)
    ),
    readRegularFile(
      resolve(repoRoot, ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE.adjudication.path)
    ),
    readRegularFile(
      resolve(
        repoRoot,
        ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE.adaptiveFeedback.path
      )
    ),
    readRegularFile(
      resolve(repoRoot, ADAPTIVE_INTERVIEWER_FROZEN_EVIDENCE.observability.path)
    ),
  ]);
  return {
    benchmarkJson,
    adjudicationJson,
    adaptiveFeedbackSource,
    observabilityJson,
  };
}

async function readRegularFile(path: string): Promise<string> {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW
  ).catch(() => {
    throw new Error("adaptive_interviewer_readiness_path_invalid");
  });
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new Error("adaptive_interviewer_readiness_path_invalid");
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

function parseReportArgs(args: readonly string[]): string | null {
  if (args.length === 0) return null;
  if (args.length === 2 && args[0] === "--verify") return args[1]!;
  throw new Error("adaptive_interviewer_readiness_usage_invalid");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void runAdaptiveInterviewerReadinessCli(process.argv.slice(2), {
    writeOut: (value) => process.stdout.write(value),
    writeError: (value) => process.stderr.write(value),
  }).then((code) => {
    process.exitCode = code;
  });
}
