import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { lstat, mkdir, readFile, realpath, rm } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

const execFile = promisify(execFileCallback);

const CONSUMPTION_RECEIPT_CONTRACT =
  "meelni.production-action-consumption-receipt.v1";
const LIVEKIT_INTERVIEW_DEPLOY_ACTION = "livekit-production-interview-deploy";
const RECEIPT_KEYS = [
  "action",
  "artifactSha256",
  "authorizationId",
  "candidateSha",
  "contract",
];

export async function snapshotLiveKitProductionDeploySource({
  receiptFile,
  outputDirectory,
  repoRoot = process.cwd(),
  runCommand = execFile,
} = {}) {
  const canonicalRepoRoot = await realpath(repoRoot);
  const canonicalReceiptPath = await assertRegularNonSymlinkFile(
    receiptFile,
    "livekit_deploy_receipt"
  );
  if (!isAbsolute(outputDirectory)) {
    throw new Error("livekit_deploy_source_output_invalid");
  }

  const outputPath = resolve(outputDirectory);
  try {
    await lstat(outputPath);
    throw new Error("livekit_deploy_source_output_exists");
  } catch (error) {
    if (error?.message === "livekit_deploy_source_output_exists") throw error;
    if (error?.code !== "ENOENT") {
      throw new Error("livekit_deploy_source_output_invalid");
    }
  }

  const receipt = parseConsumptionReceipt(
    await readFile(canonicalReceiptPath, "utf8")
  );
  const archivePath = join(outputPath, "agent-source.tar");

  await mkdir(outputPath, { recursive: false, mode: 0o700 });
  try {
    await runCommand(
      "/usr/bin/git",
      [
        "archive",
        "--format=tar",
        `--output=${archivePath}`,
        receipt.candidateSha,
        "agent",
      ],
      {
        cwd: canonicalRepoRoot,
        env: gitEnvironment(),
      }
    );
    await runCommand("/usr/bin/tar", ["-xf", archivePath, "-C", outputPath], {
      cwd: canonicalRepoRoot,
      env: gitEnvironment(),
    });
    await Promise.all([
      assertRegularNonSymlinkFile(
        join(outputPath, "agent", "Dockerfile"),
        "livekit_deploy_dockerfile"
      ),
      assertRegularNonSymlinkFile(
        join(outputPath, "agent", "interview", "agent.py"),
        "livekit_deploy_entrypoint"
      ),
    ]);
  } catch (error) {
    await rm(outputPath, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(archivePath, { force: true });
  }

  return {
    agentDirectory: join(outputPath, "agent"),
    candidateSha: receipt.candidateSha,
  };
}

export function parseConsumptionReceipt(receiptText) {
  let receipt;
  try {
    receipt = JSON.parse(receiptText);
  } catch {
    throw new Error("livekit_deploy_receipt_invalid");
  }
  if (
    !receipt ||
    typeof receipt !== "object" ||
    Array.isArray(receipt) ||
    Object.keys(receipt).sort().join(",") !== RECEIPT_KEYS.join(",") ||
    receipt.contract !== CONSUMPTION_RECEIPT_CONTRACT ||
    receipt.action !== LIVEKIT_INTERVIEW_DEPLOY_ACTION ||
    !/^[a-f0-9]{40}$/.test(receipt.candidateSha) ||
    !/^[a-f0-9]{64}$/.test(receipt.artifactSha256) ||
    typeof receipt.authorizationId !== "string" ||
    receipt.authorizationId.length === 0
  ) {
    throw new Error("livekit_deploy_receipt_invalid");
  }
  return receipt;
}

async function assertRegularNonSymlinkFile(path, label) {
  if (typeof path !== "string" || !isAbsolute(path)) {
    throw new Error(`${label}_path_invalid`);
  }
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    throw new Error(`${label}_path_invalid`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label}_path_invalid`);
  }
  return realpath(path);
}

function gitEnvironment() {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))
  );
  environment.LC_ALL = "C";
  return environment;
}
