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
const GITHUB_GET_MAX_ATTEMPTS = 3;
const GITHUB_GET_RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const GITHUB_GET_RETRY_BASE_DELAY_MS = 250;
const GITHUB_GET_RETRY_MAX_DELAY_MS = 5_000;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(response, now) {
  const value = response.headers?.get?.("retry-after")?.trim();
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

function retryDelayMilliseconds(response, attempt, now) {
  const requestedDelay =
    retryAfterMilliseconds(response, now) ??
    GITHUB_GET_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
  return Math.min(requestedDelay, GITHUB_GET_RETRY_MAX_DELAY_MS);
}

function sanitizeRequestMethod(method) {
  const value = String(method).toUpperCase();
  return /^[A-Z]+$/.test(value) ? value : "UNKNOWN";
}

function sanitizeRequestPath(path) {
  const value = String(path)
    .split("?", 1)[0]
    .replace(/[\u0000-\u001f\u007f]/g, "");
  return value.startsWith("/") ? value.slice(0, 500) : "unavailable";
}

function sanitizeRequestId(response) {
  const value = response.headers?.get?.("x-github-request-id")?.trim();
  return value && /^[A-Za-z0-9:-]{1,128}$/.test(value) ? value : "unavailable";
}

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
    { stdio: ["ignore", "pipe", "pipe"] }
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
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  return revision;
}

function isMissingRemoteRef(error) {
  const output = [error?.message, error?.stderr?.toString()]
    .filter(Boolean)
    .join("\n");
  return /couldn't find remote ref|remote ref does not exist|not our ref/i.test(
    output
  );
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
  sleepImpl = sleep,
  nowImpl = Date.now,
}) {
  if (!token) throw new Error("stack_gate_github_token_required");
  const requestMethod = sanitizeRequestMethod(method);
  const maxAttempts = requestMethod === "GET" ? GITHUB_GET_MAX_ATTEMPTS : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repository}${path}`,
      {
        method: requestMethod,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2022-11-28",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }
    );
    if (response.ok) {
      return response.status === 204 ? null : response.json();
    }

    const retryable =
      requestMethod === "GET" &&
      GITHUB_GET_RETRYABLE_STATUSES.has(response.status) &&
      attempt < maxAttempts;
    if (retryable) {
      await sleepImpl(retryDelayMilliseconds(response, attempt, nowImpl()));
      continue;
    }

    const requestPath = sanitizeRequestPath(path);
    const requestId = sanitizeRequestId(response);
    const error = new Error(
      `stack_gate_github_api_failed:${response.status};method=${requestMethod};path=${requestPath};attempt=${attempt}/${maxAttempts};request_id=${requestId}`
    );
    error.status = response.status;
    error.method = requestMethod;
    error.path = requestPath;
    error.attempt = attempt;
    error.requestId = requestId;
    throw error;
  }

  throw new Error("stack_gate_github_api_retry_state_invalid");
}

function pullRequestEvent({ repository, defaultBranch, pullRequest }) {
  return JSON.stringify({
    number: pullRequest.number,
    repository: { full_name: repository, default_branch: defaultBranch },
    pull_request: {
      number: pullRequest.number,
      body: pullRequest.body,
      head: {
        ref: pullRequest.head?.ref,
        sha: pullRequest.head?.sha,
        repo: { full_name: pullRequest.head?.repo?.full_name },
      },
      base: { ref: pullRequest.base?.ref },
    },
  });
}

function topologyFailure(entry, errors, pullRequest) {
  return {
    status: "fail",
    pr: entry.pr,
    parentPr: entry.parentPr,
    headRef: entry.headRef,
    head: pullRequest?.head?.sha,
    parentRef: entry.parentRef,
    errors,
  };
}

function validatePullRequestSnapshot({ pullRequest, entry, repository }) {
  const errors = [];
  if (pullRequest?.number !== entry.pr)
    errors.push("github_pr_differs_from_manifest_entry");
  if (pullRequest?.state !== "open") errors.push("child_pr_not_open");
  if (pullRequest?.head?.ref !== entry.headRef)
    errors.push("github_head_differs_from_manifest_entry");
  if (pullRequest?.head?.repo?.full_name !== repository)
    errors.push("stacked_pr_must_originate_from_manifest_repository");
  if (pullRequest?.base?.ref !== entry.parentRef)
    errors.push("github_base_differs_from_declared_parent");
  if (!/^[0-9a-f]{40}$/.test(pullRequest?.head?.sha ?? ""))
    errors.push("github_child_head_invalid");
  return errors;
}

function validateParentSnapshot({ pullRequest, entry, repository }) {
  const errors = [];
  if (pullRequest?.number !== entry.parentPr)
    errors.push("parent_pr_differs_from_manifest_entry");
  if (pullRequest?.state !== "open") errors.push("parent_pr_not_open");
  if (pullRequest?.head?.ref !== entry.parentRef)
    errors.push("parent_head_differs_from_manifest_entry");
  if (pullRequest?.head?.repo?.full_name !== repository)
    errors.push("parent_pr_must_originate_from_manifest_repository");
  if (!/^[0-9a-f]{40}$/.test(pullRequest?.head?.sha ?? ""))
    errors.push("github_parent_head_invalid");
  return errors;
}

export async function resolveRegisteredStack({
  prNumber,
  env = process.env,
  repo = process.cwd(),
  remote = "origin",
  manifestPath,
  api = githubApi,
  fetchImpl,
} = {}) {
  const manifest = loadStackManifest(manifestPath);
  const entry = manifest.stacks.find((candidate) => candidate.pr === prNumber);
  const token = env.GITHUB_TOKEN;
  const child = await api({
    token,
    repository: manifest.repository,
    path: `/pulls/${prNumber}`,
    fetchImpl,
  });
  if (!entry) {
    const errors = [];
    if (child?.number !== prNumber) errors.push("github_pr_number_invalid");
    if (child?.state !== "open") errors.push("github_pr_not_open");
    if (!/^[0-9a-f]{40}$/.test(child?.head?.sha ?? ""))
      errors.push("github_child_head_invalid");
    const isSameRepository =
      child?.head?.repo?.full_name === manifest.repository;
    const defaultBranch = env.GITHUB_DEFAULT_BRANCH ?? "main";
    if (child?.base?.ref !== defaultBranch) {
      errors.push(
        isSameRepository
          ? "stack_relationship_missing_from_manifest"
          : "stacked_pr_must_originate_from_manifest_repository"
      );
    }
    return {
      status: errors.length > 0 ? "fail" : "not_stacked",
      pr: prNumber,
      headRef: child?.head?.ref,
      head: child?.head?.sha,
      errors,
    };
  }
  const childErrors = validatePullRequestSnapshot({
    pullRequest: child,
    entry,
    repository: manifest.repository,
  });
  if (childErrors.length > 0) return topologyFailure(entry, childErrors, child);

  let parent;
  try {
    parent = await api({
      token,
      repository: manifest.repository,
      path: `/pulls/${entry.parentPr}`,
      fetchImpl,
    });
  } catch (error) {
    if (error?.status === 404 || error?.message?.endsWith(":404")) {
      return topologyFailure(entry, ["parent_pr_missing"], child);
    }
    throw error;
  }
  const parentErrors = validateParentSnapshot({
    pullRequest: parent,
    entry,
    repository: manifest.repository,
  });
  if (parentErrors.length > 0)
    return topologyFailure(entry, parentErrors, child);

  let headRevision;
  let parentRevision;
  try {
    headRevision = fetchExactPullRequest(repo, remote, entry.pr);
  } catch (error) {
    if (isMissingRemoteRef(error))
      return topologyFailure(entry, ["child_ref_missing"], child);
    throw error;
  }
  try {
    parentRevision = fetchParent(repo, remote, entry.parentRef);
  } catch (error) {
    if (isMissingRemoteRef(error))
      return topologyFailure(entry, ["parent_ref_missing"], child);
    throw error;
  }
  const fetchedHead = git(repo, [
    "rev-parse",
    "--verify",
    `${headRevision}^{commit}`,
  ]);
  const fetchedParent = git(repo, [
    "rev-parse",
    "--verify",
    `${parentRevision}^{commit}`,
  ]);
  const refErrors = [];
  if (fetchedHead !== child.head.sha)
    refErrors.push("github_child_head_is_stale");
  if (fetchedParent !== parent.head.sha)
    refErrors.push("github_parent_head_is_stale");
  if (refErrors.length > 0) return topologyFailure(entry, refErrors, child);

  return checkStackTopology({
    repo,
    manifest,
    headRef: entry.headRef,
    headRevision,
    parentRevision,
    evidence: extractStackEvidence(
      pullRequestEvent({
        repository: manifest.repository,
        defaultBranch: env.GITHUB_DEFAULT_BRANCH ?? "main",
        pullRequest: child,
      })
    ),
    requireEvidence: true,
  });
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

export async function refreshStackGeneration({
  prNumber,
  result,
  env = process.env,
  repo = process.cwd(),
  remote = "origin",
  manifestPath,
  api = githubApi,
  fetchImpl,
} = {}) {
  const current = await resolveRegisteredStack({
    prNumber,
    env,
    repo,
    remote,
    manifestPath,
    api,
    fetchImpl,
  });
  const errors = [];
  if (current.head && result.head && current.head !== result.head) {
    errors.push("child_moved_during_verification");
  }
  if (
    current.actualParentHead &&
    result.actualParentHead &&
    current.actualParentHead !== result.actualParentHead
  ) {
    errors.push("parent_moved_during_verification");
  }
  if (result.status === "not_stacked") {
    if (current.status === "not_stacked" && errors.length === 0) return current;
    return {
      ...result,
      status: "fail",
      errors: [
        ...new Set([
          ...errors,
          "topology_changed_during_verification",
          ...(current.errors ?? []),
        ]),
      ],
    };
  }
  if (result.status === "fail") {
    if (current.status !== result.status || current.status === "pass") {
      errors.push("topology_changed_during_verification");
    }
    return {
      ...result,
      status: "fail",
      errors: [...new Set([...errors, ...(current.errors ?? result.errors)])],
    };
  }
  if (current.status !== "pass") errors.push(...current.errors);
  return errors.length > 0
    ? { ...result, status: "fail", errors }
    : {
        ...result,
        generation: {
          child: current.head,
          parent: current.actualParentHead,
        },
      };
}

export async function runStackCiAndPublish({
  eventContent,
  env = process.env,
  repo = process.cwd(),
  remote = "origin",
  fetchImpl,
  manifestPath,
  api = githubApi,
  beforeFreshnessBarrier,
} = {}) {
  const event = JSON.parse(eventContent);
  const repository = event.repository?.full_name;
  const prNumber = event.pull_request?.number ?? event.number;
  const manifest = loadStackManifest(manifestPath);
  if (repository !== manifest.repository || !Number.isInteger(prNumber)) {
    throw new Error("stack_gate_event_invalid");
  }
  const token = env.GITHUB_TOKEN;
  let result = await resolveRegisteredStack({
    prNumber,
    env,
    repo,
    remote,
    manifestPath,
    api,
    fetchImpl,
  });
  const headSha = result.head;
  if (!/^[0-9a-f]{40}$/.test(headSha ?? "")) {
    throw new Error("stack_gate_current_head_invalid");
  }
  const checkId = await createStackCheck({
    token,
    repository,
    headSha,
    fetchImpl,
  });
  try {
    await beforeFreshnessBarrier?.();
    result = await refreshStackGeneration({
      prNumber,
      result,
      env,
      repo,
      remote,
      manifestPath,
      api,
      fetchImpl,
    });
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
