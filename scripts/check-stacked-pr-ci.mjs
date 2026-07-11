import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  checkStackTopology,
  extractStackEvidence,
  loadStackManifest,
  validatePullRequestDeclaration,
} from "./check-stacked-pr.mjs";

export const STACK_TOPOLOGY_CHECK_NAME = "Stack Topology / Verify";

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

export function parseStackEvent(eventContent) {
  const event = JSON.parse(eventContent);
  const pullRequest = event.pull_request;
  const prNumber = pullRequest?.number ?? event.number;
  if (!Number.isInteger(prNumber) || prNumber < 1) {
    throw new Error("stack_gate_pr_number_invalid");
  }
  const headSha = pullRequest?.head?.sha;
  const repository = event.repository?.full_name;
  if (!/^[0-9a-f]{40}$/.test(headSha ?? "") || typeof repository !== "string") {
    throw new Error("stack_gate_event_invalid");
  }
  return { event, pullRequest, prNumber, headSha, repository };
}

export function runStackCiForEvent({
  eventContent,
  repo = process.cwd(),
  remote = "origin",
  manifestPath,
} = {}) {
  const { event, pullRequest, prNumber, headSha, repository } =
    parseStackEvent(eventContent);

  const manifest = loadStackManifest(manifestPath);
  const headRef = pullRequest?.head?.ref;
  const headRepository = pullRequest?.head?.repo?.full_name;
  const baseRef = pullRequest?.base?.ref;
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
  return runStackCiForEvent({
    eventContent: readFileSync(env.GITHUB_EVENT_PATH, "utf8"),
    repo,
    remote,
  });
}

export async function githubApi({
  token,
  repository,
  path,
  method = "GET",
  body,
  fetchImpl = fetch,
}) {
  if (!token) throw new Error("stack_gate_github_token_required");
  const response = await fetchImpl(
    `https://api.github.com/repos/${repository}${path}`,
    {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }
  );
  if (!response.ok) {
    throw new Error(`stack_gate_github_api_failed:${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

export async function createStackCheck({
  token,
  repository,
  headSha,
  fetchImpl,
}) {
  const check = await githubApi({
    token,
    repository,
    path: "/check-runs",
    method: "POST",
    body: {
      name: STACK_TOPOLOGY_CHECK_NAME,
      head_sha: headSha,
      status: "in_progress",
      started_at: new Date().toISOString(),
      output: {
        title: "Stack topology verification is running",
        summary:
          "Trusted default-branch code is verifying the exact PR and parent refs.",
      },
    },
    fetchImpl,
  });
  if (!Number.isInteger(check?.id)) {
    throw new Error("stack_gate_check_run_id_missing");
  }
  return check.id;
}

export async function completeStackCheck({
  token,
  repository,
  checkId,
  conclusion,
  result,
  error,
  fetchImpl,
}) {
  const errors = result?.errors ?? (error ? [error] : []);
  const isNotStacked = result?.status === "not_stacked";
  await githubApi({
    token,
    repository,
    path: `/check-runs/${checkId}`,
    method: "PATCH",
    body: {
      status: "completed",
      conclusion,
      completed_at: new Date().toISOString(),
      output: {
        title: isNotStacked
          ? "PR is not a registered stack child"
          : conclusion === "success"
            ? "Exact stack topology verified"
            : "Stack topology verification failed",
        summary:
          errors.length > 0
            ? errors.join("\n")
            : isNotStacked
              ? "This exact PR head is not a registered stack child."
              : `The exact child ${result.head} contains parent ${result.actualParentHead}; both refs were refreshed immediately before publication and the PR-body evidence is current.`,
      },
    },
    fetchImpl,
  });
}

export function refreshStackGeneration({
  eventContent,
  result,
  repo = process.cwd(),
  remote = "origin",
  manifestPath,
} = {}) {
  const { pullRequest, prNumber, headSha } = parseStackEvent(eventContent);
  if (result.status !== "pass") return result;

  const manifest = loadStackManifest(manifestPath);
  const declaration = validatePullRequestDeclaration({
    manifest,
    prNumber,
    headRef: pullRequest.head.ref,
    headRepository: pullRequest.head.repo.full_name,
    baseRef: pullRequest.base.ref,
    defaultBranch:
      JSON.parse(eventContent).repository?.default_branch ?? "main",
  });
  if (declaration.errors.length > 0 || !declaration.entry) {
    return {
      ...result,
      status: "fail",
      errors: [
        ...declaration.errors,
        "stack_declaration_changed_during_verification",
      ],
    };
  }

  const currentHead = git(repo, [
    "rev-parse",
    "--verify",
    `${fetchExactPullRequest(repo, remote, prNumber)}^{commit}`,
  ]);
  const currentParent = git(repo, [
    "rev-parse",
    "--verify",
    `${fetchParent(repo, remote, declaration.entry.parentRef)}^{commit}`,
  ]);
  const errors = [];
  if (currentHead !== headSha || currentHead !== result.head) {
    errors.push("child_moved_during_verification");
  }
  if (
    currentParent !== declaration.entry.expectedParentHead ||
    currentParent !== result.actualParentHead
  ) {
    errors.push("parent_moved_during_verification");
  }
  return errors.length > 0
    ? { ...result, status: "fail", errors }
    : {
        ...result,
        generation: { child: currentHead, parent: currentParent },
      };
}

export async function runStackCiAndPublish({
  eventContent,
  env = process.env,
  repo = process.cwd(),
  remote = "origin",
  fetchImpl,
  manifestPath,
  beforeFreshnessBarrier,
} = {}) {
  const { repository, headSha } = parseStackEvent(eventContent);
  const token = env.GITHUB_TOKEN;
  const checkId = await createStackCheck({
    token,
    repository,
    headSha,
    fetchImpl,
  });
  try {
    let result = runStackCiForEvent({
      eventContent,
      repo,
      remote,
      manifestPath,
    });
    if (result.status === "pass") {
      await beforeFreshnessBarrier?.();
      result = refreshStackGeneration({
        eventContent,
        result,
        repo,
        remote,
        manifestPath,
      });
    }
    await completeStackCheck({
      token,
      repository,
      checkId,
      conclusion:
        result.status === "pass"
          ? "success"
          : result.status === "not_stacked"
            ? "success"
            : "failure",
      result,
      fetchImpl,
    });
    return result;
  } catch (error) {
    const code = error instanceof Error ? error.message : "stack_check_failed";
    await completeStackCheck({
      token,
      repository,
      checkId,
      conclusion: "failure",
      error: code,
      fetchImpl,
    });
    throw error;
  }
}

async function main() {
  try {
    const publish = process.argv.includes("--publish-check");
    const eventContent = process.env.GITHUB_EVENT_PATH
      ? readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")
      : null;
    const result = publish
      ? await runStackCiAndPublish({ eventContent })
      : runStackCi();
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

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
