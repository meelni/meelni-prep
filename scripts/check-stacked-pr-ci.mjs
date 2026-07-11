import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  checkStackTopology,
  extractStackEvidence,
  loadStackManifest,
  validatePullRequestDeclaration,
} from "./check-stacked-pr.mjs";

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fetchExactPullRequest(repo, remote, prNumber) {
  const revision = `refs/remotes/pull/${prNumber}/head`;
  execFileSync(
    "git",
    [
      "-C",
      repo,
      "fetch",
      "--no-tags",
      remote,
      `+refs/pull/${prNumber}/head:${revision}`,
    ],
    { stdio: "inherit" }
  );
  return revision;
}

function fetchParent(repo, remote, parentRef) {
  const revision = `refs/remotes/origin/${parentRef}`;
  execFileSync(
    "git",
    [
      "-C",
      repo,
      "fetch",
      "--no-tags",
      remote,
      `+refs/heads/${parentRef}:${revision}`,
    ],
    { stdio: "inherit" }
  );
  return revision;
}

export function runStackCi({
  env = process.env,
  repo = process.cwd(),
  remote = "origin",
} = {}) {
  if (env.GITHUB_EVENT_NAME !== "pull_request_target") {
    throw new Error("stack_gate_requires_pull_request_target");
  }
  if (!env.GITHUB_EVENT_PATH) {
    throw new Error("stack_gate_event_path_required");
  }

  const eventContent = readFileSync(env.GITHUB_EVENT_PATH, "utf8");
  const event = JSON.parse(eventContent);
  const pullRequest = event.pull_request;
  const prNumber = pullRequest?.number ?? event.number;
  if (!Number.isInteger(prNumber) || prNumber < 1) {
    throw new Error("stack_gate_pr_number_invalid");
  }

  const manifest = loadStackManifest();
  const headRef = pullRequest?.head?.ref;
  const headSha = pullRequest?.head?.sha;
  const headRepository = pullRequest?.head?.repo?.full_name;
  const baseRef = pullRequest?.base?.ref;
  const repository = event.repository?.full_name;
  if (
    repository !== manifest.repository ||
    typeof headRef !== "string" ||
    !/^[0-9a-f]{40}$/.test(headSha ?? "") ||
    typeof headRepository !== "string" ||
    typeof baseRef !== "string"
  ) {
    throw new Error("stack_gate_event_invalid");
  }

  const declaration = validatePullRequestDeclaration({
    manifest,
    prNumber,
    headRef,
    headRepository,
    baseRef,
    defaultBranch: event.repository?.default_branch ?? "main",
  });
  if (declaration.errors.length > 0) {
    return {
      status: "fail",
      pr: prNumber,
      headRef,
      errors: declaration.errors,
    };
  }
  if (!declaration.entry) {
    return { status: "not_stacked", pr: prNumber, headRef, errors: [] };
  }

  const headRevision = fetchExactPullRequest(repo, remote, prNumber);
  const fetchedHead = git(repo, [
    "rev-parse",
    "--verify",
    `${headRevision}^{commit}`,
  ]);
  if (fetchedHead !== headSha) {
    return {
      status: "fail",
      pr: prNumber,
      headRef,
      head: fetchedHead,
      errors: ["github_event_head_is_stale"],
    };
  }
  const parentRevision = fetchParent(repo, remote, declaration.entry.parentRef);
  return checkStackTopology({
    repo,
    manifest,
    headRef,
    headRevision,
    parentRevision,
    evidence: extractStackEvidence(eventContent),
    requireEvidence: true,
  });
}

function main() {
  try {
    const result = runStackCi();
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "fail") process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "error",
        error: error instanceof Error ? error.message : "stack_check_failed",
      })
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
