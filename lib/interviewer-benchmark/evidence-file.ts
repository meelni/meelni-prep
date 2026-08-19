import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const INTERVIEWER_BENCHMARK_EVIDENCE_PATH =
  "docs/evidence/sav-467-current-interviewer-baseline.json" as const;

export async function readInterviewerBenchmarkEvidence(
  repoRoot: string,
  requestedPath: string
): Promise<string> {
  const validated = await resolveEvidenceTarget(repoRoot, requestedPath);
  const handle = await open(
    validated.target,
    constants.O_RDONLY | constants.O_NOFOLLOW
  ).catch(() => {
    throw new Error("interviewer_benchmark_evidence_path_invalid");
  });
  try {
    const stats = await handle.stat();
    if (
      !isSafeRegularFile(stats) ||
      !isSameFile(stats, validated.targetIdentity)
    ) {
      throw new Error("interviewer_benchmark_evidence_path_invalid");
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

export async function writeInterviewerBenchmarkEvidence(
  repoRoot: string,
  requestedPath: string,
  contents: string
): Promise<void> {
  const validated = await resolveEvidenceTarget(repoRoot, requestedPath);
  const { directory, target } = validated;
  const temporary = resolve(
    directory,
    `.sav-467-interviewer-benchmark.${randomUUID()}.tmp`
  );
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(
      temporary,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o644
    );
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    const [directoryStats, targetStats] = await Promise.all([
      assertDirectoryNonSymlink(directory),
      assertRegularNonSymlink(target),
    ]);
    if (
      !isSameFile(directoryStats, validated.directoryIdentity) ||
      !isSameFile(targetStats, validated.targetIdentity)
    ) {
      throw new Error("interviewer_benchmark_evidence_path_invalid");
    }
    await rename(temporary, target);
    const directoryHandle = await open(directory, constants.O_RDONLY);
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    if (
      error instanceof Error &&
      error.message === "interviewer_benchmark_evidence_path_invalid"
    ) {
      throw error;
    }
    throw new Error("interviewer_benchmark_evidence_write_failed");
  }
}

async function resolveEvidenceTarget(
  repoRoot: string,
  requestedPath: string
): Promise<{
  directory: string;
  directoryIdentity: FileIdentity;
  target: string;
  targetIdentity: FileIdentity;
}> {
  if (
    !isAbsolute(repoRoot) ||
    isAbsolute(requestedPath) ||
    requestedPath !== INTERVIEWER_BENCHMARK_EVIDENCE_PATH
  ) {
    throw new Error("interviewer_benchmark_evidence_path_invalid");
  }

  const target = resolve(repoRoot, INTERVIEWER_BENCHMARK_EVIDENCE_PATH);
  const pathFromRoot = relative(resolve(repoRoot), target);
  if (
    pathFromRoot === "" ||
    pathFromRoot.startsWith(`..${sep}`) ||
    pathFromRoot === ".."
  ) {
    throw new Error("interviewer_benchmark_evidence_path_invalid");
  }

  await assertDirectoryNonSymlink(repoRoot);
  await assertDirectoryNonSymlink(resolve(repoRoot, "docs"));
  const directory = resolve(repoRoot, "docs/evidence");
  const directoryStats = await assertDirectoryNonSymlink(directory);
  const targetStats = await assertRegularNonSymlink(target);

  const [canonicalRoot, canonicalTarget] = await Promise.all([
    realpath(repoRoot),
    realpath(target),
  ]);
  if (
    canonicalTarget !==
    resolve(canonicalRoot, INTERVIEWER_BENCHMARK_EVIDENCE_PATH)
  ) {
    throw new Error("interviewer_benchmark_evidence_path_invalid");
  }
  return {
    directory,
    directoryIdentity: identityOf(directoryStats),
    target,
    targetIdentity: identityOf(targetStats),
  };
}

interface FileIdentity {
  dev: number;
  ino: number;
}

async function assertDirectoryNonSymlink(path: string): Promise<Stats> {
  const stats = await lstat(path).catch(() => null);
  if (!stats?.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("interviewer_benchmark_evidence_path_invalid");
  }
  return stats;
}

async function assertRegularNonSymlink(path: string): Promise<Stats> {
  const stats = await lstat(path).catch(() => null);
  if (!stats || stats.isSymbolicLink() || !isSafeRegularFile(stats)) {
    throw new Error("interviewer_benchmark_evidence_path_invalid");
  }
  return stats;
}

function isSafeRegularFile(stats: Stats): boolean {
  return (
    stats.isFile() &&
    stats.nlink === 1 &&
    (stats.mode & 0o022) === 0 &&
    (process.getuid?.() === undefined || stats.uid === process.getuid())
  );
}

function identityOf(stats: Stats): FileIdentity {
  return { dev: stats.dev, ino: stats.ino };
}

function isSameFile(stats: Stats, identity: FileIdentity): boolean {
  return stats.dev === identity.dev && stats.ino === identity.ino;
}
