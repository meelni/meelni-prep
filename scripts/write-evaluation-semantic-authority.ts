import { randomBytes } from "node:crypto";
import { link, open, realpath, stat, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import {
  buildSemanticReviewExecutionReceipt,
  buildTrustedSemanticExecutionAuthority,
  assertSemanticPathOutsideGitWorktree,
} from "@/lib/evaluation/calibration-semantic-capture";
import {
  readSemanticPanel,
  readSemanticReviewRequestHash,
} from "@/lib/evaluation/calibration-live-semantic-review";

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "blocked",
      error:
        error instanceof Error
          ? error.message
          : "semantic_authority_write_failed",
    })
  );
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reviewRequest = resolve(process.cwd(), args.reviewRequest);
  const panelAPath = resolve(process.cwd(), args.panelA);
  const panelBPath = resolve(process.cwd(), args.panelB);
  const output = resolve(process.cwd(), args.output);
  const reviewInputSha256 = await readSemanticReviewRequestHash(reviewRequest);
  const [panelA, panelB] = await Promise.all([
    readSemanticPanel(panelAPath, reviewInputSha256),
    readSemanticPanel(panelBPath, reviewInputSha256),
  ]);
  const authority = buildTrustedSemanticExecutionAuthority({
    reviewInputSha256,
    verifiedExecutions: [
      buildSemanticReviewExecutionReceipt({
        taskPath: args.taskA,
        executionId: args.executionA,
        completedAt: args.completedA,
        reviewInputSha256,
        decisions: panelA.decisions,
      }),
      buildSemanticReviewExecutionReceipt({
        taskPath: args.taskB,
        executionId: args.executionB,
        completedAt: args.completedB,
        reviewInputSha256,
        decisions: panelB.decisions,
      }),
    ],
  });
  await writePrivateAuthority(
    output,
    `${JSON.stringify(authority, null, 2)}\n`
  );
  process.stdout.write(
    `${JSON.stringify({
      status: "written",
      output,
      reviewInputSha256,
      authoritySha256: authority.authoritySha256,
    })}\n`
  );
}

interface SemanticAuthorityArgs {
  reviewRequest: string;
  panelA: string;
  panelB: string;
  taskA: string;
  taskB: string;
  executionA: string;
  executionB: string;
  completedA: string;
  completedB: string;
  output: string;
}

function parseArgs(argv: string[]): SemanticAuthorityArgs {
  const names = [
    "review-request",
    "panel-a",
    "panel-b",
    "task-a",
    "task-b",
    "execution-a",
    "execution-b",
    "completed-a",
    "completed-b",
    "output",
  ] as const;
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !value) {
      throw new Error("semantic_authority_requires_name_value_arguments");
    }
    const key = name.slice(2);
    if (!names.includes(key as (typeof names)[number]) || values.has(key)) {
      throw new Error(`semantic_authority_argument_invalid:${name}`);
    }
    values.set(key, value);
  }
  for (const name of names) {
    if (!values.has(name)) {
      throw new Error(`semantic_authority_argument_missing:--${name}`);
    }
  }
  return {
    reviewRequest: values.get("review-request")!,
    panelA: values.get("panel-a")!,
    panelB: values.get("panel-b")!,
    taskA: values.get("task-a")!,
    taskB: values.get("task-b")!,
    executionA: values.get("execution-a")!,
    executionB: values.get("execution-b")!,
    completedA: values.get("completed-a")!,
    completedB: values.get("completed-b")!,
    output: values.get("output")!,
  };
}

async function writePrivateAuthority(
  targetInput: string,
  contents: string
): Promise<void> {
  const requestedParent = dirname(targetInput);
  const parent = await realpath(requestedParent);
  assertSemanticPathOutsideGitWorktree(parent);
  const target = join(parent, basename(targetInput));
  const parentStat = await stat(parent);
  if (
    !parentStat.isDirectory() ||
    (parentStat.mode & 0o777) !== 0o700 ||
    parentStat.uid !== process.getuid?.()
  ) {
    throw new Error("semantic_authority_parent_is_not_private");
  }
  const temporary = join(
    parent,
    `.${basename(target)}.${randomBytes(16).toString("hex")}.tmp`
  );
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  await handle.close();
  try {
    await link(temporary, target);
    await unlink(temporary);
    const directory = await open(parent, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
