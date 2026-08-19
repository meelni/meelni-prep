import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  INTERVIEWER_BENCHMARK_ADJUDICATION_APPROVAL_PATH,
  INTERVIEWER_BENCHMARK_EVIDENCE_PATH,
  readInterviewerBenchmarkAdjudicationApproval,
  readInterviewerBenchmarkEvidence,
  writeInterviewerBenchmarkEvidence,
} from "./evidence-file";

test("evidence policy accepts only its exact repo-owned regular files", async () => {
  await withEvidenceRepo(async ({ approvalTarget, repoRoot, target }) => {
    assert.equal(
      await readInterviewerBenchmarkEvidence(
        repoRoot,
        INTERVIEWER_BENCHMARK_EVIDENCE_PATH
      ),
      "before\n"
    );
    await writeInterviewerBenchmarkEvidence(
      repoRoot,
      INTERVIEWER_BENCHMARK_EVIDENCE_PATH,
      "after\n"
    );
    assert.equal(
      await readInterviewerBenchmarkEvidence(
        repoRoot,
        INTERVIEWER_BENCHMARK_EVIDENCE_PATH
      ),
      "after\n"
    );
    assert.equal(
      await readInterviewerBenchmarkAdjudicationApproval(
        repoRoot,
        INTERVIEWER_BENCHMARK_ADJUDICATION_APPROVAL_PATH
      ),
      "approval\n"
    );
    assert.deepEqual(
      (await readdir(resolve(repoRoot, "docs/evidence"))).sort(),
      [approvalTarget.split("/").at(-1)!, target.split("/").at(-1)!].sort()
    );
  });
});

test("baseline and approval readers cannot be swapped", async () => {
  await withEvidenceRepo(async ({ repoRoot }) => {
    await assert.rejects(
      readInterviewerBenchmarkEvidence(
        repoRoot,
        INTERVIEWER_BENCHMARK_ADJUDICATION_APPROVAL_PATH
      ),
      /interviewer_benchmark_evidence_path_invalid/
    );
    await assert.rejects(
      readInterviewerBenchmarkAdjudicationApproval(
        repoRoot,
        INTERVIEWER_BENCHMARK_EVIDENCE_PATH
      ),
      /interviewer_benchmark_evidence_path_invalid/
    );
  });
});

test("evidence policy rejects absolute, traversal, and unrelated regular paths", async () => {
  await withEvidenceRepo(async ({ repoRoot, target }) => {
    await writeFile(resolve(repoRoot, "package.json"), "{}\n", "utf8");
    const rejected = [
      target,
      "docs/evidence/../evidence/sav-467-current-interviewer-baseline.json",
      "../sav-467-current-interviewer-baseline.json",
      "package.json",
    ];
    for (const path of rejected) {
      await assert.rejects(
        readInterviewerBenchmarkEvidence(repoRoot, path),
        /interviewer_benchmark_evidence_path_invalid/
      );
      await assert.rejects(
        writeInterviewerBenchmarkEvidence(repoRoot, path, "blocked\n"),
        /interviewer_benchmark_evidence_path_invalid/
      );
    }
  });
});

test("evidence policy rejects a symlink target for reads and writes", async () => {
  await withEvidenceRepo(async ({ repoRoot, target }) => {
    const outside = resolve(repoRoot, "outside.json");
    await writeFile(outside, "outside\n", "utf8");
    await rm(target);
    await symlink(outside, target);

    await assert.rejects(
      readInterviewerBenchmarkEvidence(
        repoRoot,
        INTERVIEWER_BENCHMARK_EVIDENCE_PATH
      ),
      /interviewer_benchmark_evidence_path_invalid/
    );
    await assert.rejects(
      writeInterviewerBenchmarkEvidence(
        repoRoot,
        INTERVIEWER_BENCHMARK_EVIDENCE_PATH,
        "blocked\n"
      ),
      /interviewer_benchmark_evidence_path_invalid/
    );
    assert.equal(await readFile(outside, "utf8"), "outside\n");
  });
});

test("evidence policy rejects a symlinked evidence directory", async () => {
  await withEvidenceRepo(async ({ repoRoot, target }) => {
    const evidenceDirectory = resolve(repoRoot, "docs/evidence");
    const outsideDirectory = resolve(repoRoot, "outside-evidence");
    const outside = resolve(
      outsideDirectory,
      INTERVIEWER_BENCHMARK_EVIDENCE_PATH.split("/").at(-1)!
    );
    await mkdir(outsideDirectory);
    await writeFile(outside, "outside\n", "utf8");
    await rm(evidenceDirectory, { recursive: true });
    await symlink(outsideDirectory, evidenceDirectory, "dir");

    await assert.rejects(
      readInterviewerBenchmarkEvidence(
        repoRoot,
        INTERVIEWER_BENCHMARK_EVIDENCE_PATH
      ),
      /interviewer_benchmark_evidence_path_invalid/
    );
    await assert.rejects(
      writeInterviewerBenchmarkEvidence(
        repoRoot,
        INTERVIEWER_BENCHMARK_EVIDENCE_PATH,
        "blocked\n"
      ),
      /interviewer_benchmark_evidence_path_invalid/
    );
    assert.equal(await readFile(target, "utf8"), "outside\n");
  });
});

async function withEvidenceRepo(
  run: (paths: {
    approvalTarget: string;
    repoRoot: string;
    target: string;
  }) => Promise<void>
): Promise<void> {
  const repoRoot = await mkdtemp(join(tmpdir(), "sav-467-evidence-"));
  const target = resolve(repoRoot, INTERVIEWER_BENCHMARK_EVIDENCE_PATH);
  const approvalTarget = resolve(
    repoRoot,
    INTERVIEWER_BENCHMARK_ADJUDICATION_APPROVAL_PATH
  );
  try {
    await mkdir(resolve(repoRoot, "docs/evidence"), { recursive: true });
    await writeFile(target, "before\n", "utf8");
    await writeFile(approvalTarget, "approval\n", "utf8");
    await run({ approvalTarget, repoRoot, target });
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}
