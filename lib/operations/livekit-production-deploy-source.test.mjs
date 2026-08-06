import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  parseConsumptionReceipt,
  snapshotLiveKitProductionDeploySource,
} from "./livekit-production-deploy-source.mjs";

function receipt(candidateSha, overrides = {}) {
  return {
    action: "livekit-production-interview-deploy",
    artifactSha256: "a".repeat(64),
    authorizationId: "authorization-id",
    candidateSha,
    contract: "meelni.production-action-consumption-receipt.v1",
    ...overrides,
  };
}

async function createAgentFixture(repoRoot) {
  await mkdir(join(repoRoot, "agent", "interview"), { recursive: true });
  await mkdir(join(repoRoot, "agent", "demo"), { recursive: true });
  await writeFile(
    join(repoRoot, "agent", "Dockerfile"),
    "FROM python:3.12-slim\n"
  );
  await writeFile(
    join(repoRoot, "agent", "interview", "agent.py"),
    'SOURCE = "authorized"\n'
  );
  await writeFile(
    join(repoRoot, "agent", "demo", "agent.py"),
    'SOURCE = "authorized-demo"\n'
  );
}

test("Production LiveKit source snapshot uses the authorized commit bytes", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "meelni-livekit-source-snapshot-")
  );
  const repoRoot = join(directory, "repo");
  const receiptPath = join(directory, "receipt.json");
  const outputDirectory = join(directory, "snapshot");

  try {
    await createAgentFixture(repoRoot);
    execFileSync("/usr/bin/git", ["init", "--quiet"], { cwd: repoRoot });
    execFileSync(
      "/usr/bin/git",
      ["config", "user.email", "tests@meelni.invalid"],
      { cwd: repoRoot }
    );
    execFileSync("/usr/bin/git", ["config", "user.name", "Meelni Tests"], {
      cwd: repoRoot,
    });
    execFileSync("/usr/bin/git", ["add", "agent"], { cwd: repoRoot });
    execFileSync("/usr/bin/git", ["commit", "--quiet", "-m", "fixture"], {
      cwd: repoRoot,
    });
    const candidateSha = execFileSync("/usr/bin/git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    await writeFile(receiptPath, `${JSON.stringify(receipt(candidateSha))}\n`, {
      mode: 0o600,
    });

    await writeFile(
      join(repoRoot, "agent", "interview", "agent.py"),
      'SOURCE = "later-working-tree-bytes"\n'
    );

    const result = await snapshotLiveKitProductionDeploySource({
      outputDirectory,
      receiptFile: receiptPath,
      repoRoot,
    });

    assert.equal(result.candidateSha, candidateSha);
    assert.equal(result.agentDirectory, join(outputDirectory, "agent"));
    assert.equal(
      await readFile(
        join(outputDirectory, "agent", "interview", "agent.py"),
        "utf8"
      ),
      'SOURCE = "authorized"\n'
    );
    await assert.rejects(lstat(join(outputDirectory, "agent-source.tar")), {
      code: "ENOENT",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Production LiveKit source snapshot accepts the guarded demo action", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "meelni-livekit-demo-source-snapshot-")
  );
  const repoRoot = join(directory, "repo");
  const receiptPath = join(directory, "receipt.json");
  const outputDirectory = join(directory, "snapshot");

  try {
    await createAgentFixture(repoRoot);
    execFileSync("/usr/bin/git", ["init", "--quiet"], { cwd: repoRoot });
    execFileSync(
      "/usr/bin/git",
      ["config", "user.email", "tests@meelni.invalid"],
      { cwd: repoRoot }
    );
    execFileSync("/usr/bin/git", ["config", "user.name", "Meelni Tests"], {
      cwd: repoRoot,
    });
    execFileSync("/usr/bin/git", ["add", "agent"], { cwd: repoRoot });
    execFileSync("/usr/bin/git", ["commit", "--quiet", "-m", "fixture"], {
      cwd: repoRoot,
    });
    const candidateSha = execFileSync("/usr/bin/git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    await writeFile(
      receiptPath,
      `${JSON.stringify(
        receipt(candidateSha, { action: "livekit-production-demo-deploy" })
      )}\n`,
      { mode: 0o600 }
    );

    const result = await snapshotLiveKitProductionDeploySource({
      outputDirectory,
      receiptFile: receiptPath,
      repoRoot,
    });

    assert.equal(result.candidateSha, candidateSha);
    assert.equal(
      await readFile(join(result.agentDirectory, "demo", "agent.py"), "utf8"),
      'SOURCE = "authorized-demo"\n'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Production LiveKit source snapshot rejects untrusted receipts", async () => {
  const candidateSha = "b".repeat(40);
  assert.throws(
    () =>
      parseConsumptionReceipt(
        JSON.stringify(receipt(candidateSha, { action: "wrong-action" }))
      ),
    /livekit_deploy_receipt_invalid/
  );
  assert.throws(
    () =>
      parseConsumptionReceipt(
        JSON.stringify({ ...receipt(candidateSha), unexpected: true })
      ),
    /livekit_deploy_receipt_invalid/
  );

  const directory = await mkdtemp(
    join(tmpdir(), "meelni-livekit-source-receipt-")
  );
  const receiptPath = join(directory, "receipt.json");
  const linkedReceiptPath = join(directory, "linked-receipt.json");
  try {
    await writeFile(receiptPath, JSON.stringify(receipt(candidateSha)), {
      mode: 0o600,
    });
    await symlink(receiptPath, linkedReceiptPath);
    await assert.rejects(
      snapshotLiveKitProductionDeploySource({
        outputDirectory: join(directory, "snapshot"),
        receiptFile: linkedReceiptPath,
        repoRoot: directory,
      }),
      /livekit_deploy_receipt_path_invalid/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
