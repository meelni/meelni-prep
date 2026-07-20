import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { githubApi } from "./check-stacked-pr-ci.mjs";
import {
  classifyRegistryOnlyPullRequest,
  fetchProposedRegistryManifest,
  registryProofGeneration,
  registryValidateExternalId,
  REQUIRED_VALIDATE_CHECK_NAME,
  verifyProposedRegistryManifest,
} from "./registry-only-validate-ci.mjs";

export const REGISTRY_MERGE_SUCCESS_MAX_AGE_MS = 10 * 60 * 1000;

const MAX_PAGES = 30;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const CANONICAL_REPOSITORY = "meelni/meelni-prep";
const CANONICAL_DEFAULT_BRANCH = "main";
const TRUSTED_WORKFLOW_NAME = "Relaunch Integration Gates";
const TRUSTED_WORKFLOW_PATH = ".github/workflows/stack-topology.yml";
const TRUSTED_MERGE_JOB = "merge-registry";
const REQUIRED_CONTEXTS = [
  REQUIRED_VALIDATE_CHECK_NAME,
  "Trusted Publisher",
  "Migration Collision Publisher",
];

function fail(code) {
  throw new Error(code);
}

function stable(value) {
  return JSON.stringify(value);
}

function stableRequiredApps(requiredApps) {
  return stable([...requiredApps.entries()]);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function positiveInteger(value, code) {
  if (!/^[1-9][0-9]*$/.test(value ?? "")) fail(code);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) fail(code);
  return number;
}

function assertExpectedHead(actual, expected) {
  if (actual !== expected) fail("registry_merge_expected_head_changed");
}

export function assertTrustedMergeContext({ env, expectedHeadSha }) {
  if (!SHA_PATTERN.test(expectedHeadSha ?? "")) {
    fail("registry_merge_expected_head_required");
  }
  const expectedRef = `refs/heads/${CANONICAL_DEFAULT_BRANCH}`;
  const expectedWorkflowRef = `${CANONICAL_REPOSITORY}/${TRUSTED_WORKFLOW_PATH}@${expectedRef}`;
  if (
    env.GITHUB_ACTIONS !== "true" ||
    env.CI !== "true" ||
    env.RUNNER_ENVIRONMENT !== "github-hosted" ||
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    env.GITHUB_REPOSITORY !== CANONICAL_REPOSITORY ||
    env.GITHUB_DEFAULT_BRANCH !== CANONICAL_DEFAULT_BRANCH ||
    env.GITHUB_REF !== expectedRef ||
    env.GITHUB_REF_NAME !== CANONICAL_DEFAULT_BRANCH ||
    env.GITHUB_REF_TYPE !== "branch" ||
    env.GITHUB_REF_PROTECTED !== "true" ||
    env.GITHUB_WORKFLOW !== TRUSTED_WORKFLOW_NAME ||
    env.GITHUB_WORKFLOW_REF !== expectedWorkflowRef ||
    env.GITHUB_JOB !== TRUSTED_MERGE_JOB ||
    !SHA_PATTERN.test(env.GITHUB_SHA ?? "") ||
    env.GITHUB_WORKFLOW_SHA !== env.GITHUB_SHA
  ) {
    fail("registry_merge_trusted_context_required");
  }
  return {
    repository: CANONICAL_REPOSITORY,
    repositoryId: positiveInteger(
      env.GITHUB_REPOSITORY_ID,
      "registry_merge_trusted_context_required"
    ),
    defaultBranch: CANONICAL_DEFAULT_BRANCH,
    workflowName: TRUSTED_WORKFLOW_NAME,
    workflowPath: TRUSTED_WORKFLOW_PATH,
    headSha: env.GITHUB_SHA,
    runId: positiveInteger(
      env.GITHUB_RUN_ID,
      "registry_merge_trusted_context_required"
    ),
    runNumber: positiveInteger(
      env.GITHUB_RUN_NUMBER,
      "registry_merge_trusted_context_required"
    ),
    runAttempt: positiveInteger(
      env.GITHUB_RUN_ATTEMPT,
      "registry_merge_trusted_context_required"
    ),
    actorId: positiveInteger(
      env.GITHUB_ACTOR_ID,
      "registry_merge_trusted_context_required"
    ),
    expectedHeadSha,
  };
}

function assertValidateFreshness({ completedAt, now, maxAgeMs }) {
  const completedAtMilliseconds = Date.parse(completedAt ?? "");
  const currentTime = now();
  const age = currentTime - completedAtMilliseconds;
  if (!Number.isFinite(completedAtMilliseconds) || age < 0 || age >= maxAgeMs) {
    fail("registry_merge_validate_stale");
  }
  return {
    completedAtMilliseconds,
    currentTime,
    expiresAt: new Date(completedAtMilliseconds + maxAgeMs).toISOString(),
  };
}

function matchesRepository(repository, expected) {
  return (
    repository?.full_name === expected.fullName &&
    repository?.id === expected.id
  );
}

function assertMergeState(pullRequest, binding, expectedHeadSha) {
  const expected = binding.pullRequest;
  if (expectedHeadSha)
    assertExpectedHead(pullRequest?.head?.sha, expectedHeadSha);
  if (
    pullRequest?.number !== expected.number ||
    pullRequest?.head?.sha !== expected.headSha ||
    pullRequest?.head?.ref !== expected.headRef ||
    !matchesRepository(pullRequest?.head?.repo, expected.headRepository) ||
    pullRequest?.base?.sha !== expected.baseSha ||
    pullRequest?.base?.ref !== expected.baseRef ||
    !matchesRepository(pullRequest?.base?.repo, expected.baseRepository)
  ) {
    fail("registry_merge_pull_request_snapshot_changed");
  }
  if (pullRequest?.auto_merge !== null) {
    fail("registry_merge_auto_merge_enabled");
  }
  if (
    pullRequest?.state !== "open" ||
    pullRequest?.draft !== false ||
    pullRequest?.mergeable !== true ||
    pullRequest?.mergeable_state !== "clean"
  ) {
    fail("registry_merge_pull_request_not_clean");
  }
}

function inspectProtection(payload) {
  const required = payload?.required_status_checks;
  const checks = required?.checks;
  if (
    required?.strict !== true ||
    !Array.isArray(checks) ||
    payload?.enforce_admins?.enabled !== true ||
    payload?.allow_force_pushes?.enabled !== false ||
    payload?.allow_deletions?.enabled !== false
  ) {
    fail("registry_merge_protection_invalid");
  }
  const expected = new Map();
  for (const context of REQUIRED_CONTEXTS) {
    const matches = checks.filter((check) => check?.context === context);
    if (
      matches.length !== 1 ||
      !Number.isSafeInteger(matches[0]?.app_id) ||
      matches[0].app_id < 1
    ) {
      fail("registry_merge_protection_invalid");
    }
    expected.set(context, matches[0].app_id);
  }
  return expected;
}

async function listPublisherRuns({ env, api, fetchImpl }) {
  const runs = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await api({
      token: env.GITHUB_TOKEN,
      repository: env.GITHUB_REPOSITORY,
      path:
        "/actions/workflows/stack-topology.yml/runs" +
        `?per_page=100&page=${page}`,
      fetchImpl,
    });
    if (!Array.isArray(payload?.workflow_runs)) {
      fail("registry_merge_publisher_queue_invalid");
    }
    runs.push(...payload.workflow_runs);
    if (payload.workflow_runs.length < 100) return runs;
  }
  fail("registry_merge_publisher_queue_incomplete");
}

function matchesRunRepository(repository, context) {
  return (
    repository?.full_name === context.repository &&
    repository?.id === context.repositoryId
  );
}

function assertCurrentWorkflowRun(run, context) {
  if (
    run?.id !== context.runId ||
    run?.run_number !== context.runNumber ||
    run?.run_attempt !== context.runAttempt ||
    run?.event !== "workflow_dispatch" ||
    run?.status !== "in_progress" ||
    run?.conclusion !== null ||
    run?.head_branch !== context.defaultBranch ||
    run?.head_sha !== context.headSha ||
    run?.path !== context.workflowPath ||
    run?.name !== context.workflowName ||
    !Number.isSafeInteger(run?.workflow_id) ||
    run.workflow_id < 1 ||
    !matchesRunRepository(run?.repository, context) ||
    !matchesRunRepository(run?.head_repository, context) ||
    run?.actor?.id !== context.actorId
  ) {
    fail("registry_merge_current_run_invalid");
  }
}

function inspectPublisherQueue(runs, currentRunContext) {
  let inspectedRuns = runs;
  if (currentRunContext) {
    const selfRuns = runs.filter((run) => run?.id === currentRunContext.runId);
    if (selfRuns.length !== 1) fail("registry_merge_current_run_missing");
    assertCurrentWorkflowRun(selfRuns[0], currentRunContext);
    inspectedRuns = runs.filter((run) => run?.id !== currentRunContext.runId);
  }
  if (inspectedRuns.length === 0) {
    fail("registry_merge_publisher_history_missing");
  }
  if (inspectedRuns.some((run) => run?.status !== "completed")) {
    fail("registry_merge_publisher_queue_active");
  }
  const ordered = [...inspectedRuns].sort((left, right) => {
    const timeDifference =
      Date.parse(right?.created_at ?? "") - Date.parse(left?.created_at ?? "");
    return timeDifference || (right?.id ?? 0) - (left?.id ?? 0);
  });
  if (
    ordered.some((run) => !Number.isFinite(Date.parse(run?.created_at ?? "")))
  ) {
    fail("registry_merge_publisher_queue_invalid");
  }
  const latest = ordered[0];
  if (
    !Number.isSafeInteger(latest?.id) ||
    latest.id < 1 ||
    latest.conclusion !== "success"
  ) {
    fail("registry_merge_publisher_unhealthy");
  }
  return {
    latestRunId: latest.id,
    generation: ordered.map(
      ({ id, status, conclusion, created_at, updated_at }) => ({
        id,
        status,
        conclusion,
        createdAt: created_at,
        updatedAt: updated_at ?? null,
      })
    ),
  };
}

async function readPublisherQueue({ env, api, fetchImpl, mergeContext }) {
  if (mergeContext) {
    const currentRun = await api({
      token: env.GITHUB_TOKEN,
      repository: env.GITHUB_REPOSITORY,
      path: `/actions/runs/${mergeContext.runId}`,
      fetchImpl,
    });
    assertCurrentWorkflowRun(currentRun, mergeContext);
  }
  return inspectPublisherQueue(
    await listPublisherRuns({ env, api, fetchImpl }),
    mergeContext
  );
}

async function assertRequiredChecks({
  classification,
  proof,
  requiredApps,
  env,
  api,
  fetchImpl,
  now,
  maxAgeMs,
}) {
  const binding = classification.binding;
  const generation = registryProofGeneration(proof);
  const externalId = registryValidateExternalId(binding, generation);
  const payload = await api({
    token: env.GITHUB_TOKEN,
    repository: binding.repository.fullName,
    path: `/commits/${binding.pullRequest.headSha}/check-runs?filter=latest&per_page=100`,
    fetchImpl,
  });
  if (
    !Array.isArray(payload?.check_runs) ||
    !Number.isSafeInteger(payload?.total_count) ||
    payload.total_count !== payload.check_runs.length ||
    payload.check_runs.length >= 100
  ) {
    fail("registry_merge_validate_inventory_invalid");
  }
  let validate;
  for (const context of REQUIRED_CONTEXTS) {
    const matches = payload.check_runs.filter(
      (check) =>
        check?.name === context &&
        check?.head_sha === binding.pullRequest.headSha &&
        check?.app?.id === requiredApps.get(context)
    );
    if (matches.length !== 1) fail("registry_merge_required_check_missing");
    const check = matches[0];
    if (check.status !== "completed" || check.conclusion !== "success") {
      fail("registry_merge_required_check_not_successful");
    }
    if (context === REQUIRED_VALIDATE_CHECK_NAME) validate = check;
  }
  if (validate?.external_id !== externalId) {
    fail("registry_merge_validate_generation_missing");
  }
  assertValidateFreshness({
    completedAt: validate.completed_at,
    now,
    maxAgeMs,
  });
  return {
    checkId: validate.id,
    completedAt: validate.completed_at,
    generation,
  };
}

async function mergeExactPullRequest({ classification, env, api, fetchImpl }) {
  const binding = classification.binding;
  const result = await api({
    token: env.GITHUB_TOKEN,
    repository: binding.repository.fullName,
    path: `/pulls/${binding.pullRequest.number}/merge`,
    method: "PUT",
    body: {
      sha: binding.pullRequest.headSha,
      merge_method: "merge",
    },
    fetchImpl,
  });
  if (
    result?.merged !== true ||
    typeof result?.sha !== "string" ||
    !/^[0-9a-f]{40}$/.test(result.sha)
  ) {
    fail("registry_merge_response_invalid");
  }
  return result;
}

function postMergeStateIsValid({
  commit,
  defaultBranchRef,
  pullRequest,
  classification,
  mergeSha,
  expectedHeadSha,
}) {
  const binding = classification.binding;
  return (
    commit?.sha === mergeSha &&
    SHA_PATTERN.test(commit?.tree?.sha ?? "") &&
    defaultBranchRef?.ref === `refs/heads/${binding.defaultBranch}` &&
    defaultBranchRef?.object?.type === "commit" &&
    defaultBranchRef?.object?.sha === mergeSha &&
    pullRequest?.number === binding.pullRequest.number &&
    pullRequest?.state === "closed" &&
    pullRequest?.merged === true &&
    pullRequest?.merge_commit_sha === mergeSha &&
    pullRequest?.head?.sha === expectedHeadSha &&
    pullRequest?.base?.ref === binding.defaultBranch &&
    matchesRepository(
      pullRequest?.head?.repo,
      binding.pullRequest.headRepository
    ) &&
    matchesRepository(
      pullRequest?.base?.repo,
      binding.pullRequest.baseRepository
    )
  );
}

async function verifyPostMerge({
  classification,
  mergeResult,
  expectedHeadSha,
  env,
  api,
  fetchImpl,
  sleepImpl,
}) {
  const binding = classification.binding;
  const mergeSha = mergeResult.sha;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const [commit, defaultBranchRef, pullRequest] = await Promise.all([
        api({
          token: env.GITHUB_TOKEN,
          repository: binding.repository.fullName,
          path: `/git/commits/${mergeSha}`,
          fetchImpl,
        }),
        api({
          token: env.GITHUB_TOKEN,
          repository: binding.repository.fullName,
          path: `/git/ref/heads/${encodeURIComponent(binding.defaultBranch)}`,
          fetchImpl,
        }),
        api({
          token: env.GITHUB_TOKEN,
          repository: binding.repository.fullName,
          path: `/pulls/${binding.pullRequest.number}`,
          fetchImpl,
        }),
      ]);
      if (
        postMergeStateIsValid({
          commit,
          defaultBranchRef,
          pullRequest,
          classification,
          mergeSha,
          expectedHeadSha,
        })
      ) {
        return;
      }
    } catch {
      // A valid merge response means recovery must proceed even if these
      // bounded read-after-write checks remain uncertain.
    }
    if (attempt < 3) await sleepImpl(250 * attempt);
  }
  fail("registry_merge_post_merge_verification_failed");
}

async function proveRegistryGeneration({
  eventContent,
  env,
  repo,
  remote,
  api,
  fetchImpl,
  resolveStack,
  expectedHeadSha,
}) {
  const classification = await classifyRegistryOnlyPullRequest({
    eventContent,
    env,
    api,
    fetchImpl,
  });
  if (!classification.eligible) fail("registry_merge_not_registry_only");
  if (expectedHeadSha) {
    assertExpectedHead(
      classification.binding.pullRequest.headSha,
      expectedHeadSha
    );
  }
  const current = await api({
    token: env.GITHUB_TOKEN,
    repository: classification.binding.repository.fullName,
    path: `/pulls/${classification.binding.pullRequest.number}`,
    fetchImpl,
  });
  assertMergeState(current, classification.binding, expectedHeadSha);
  const manifestContent = await fetchProposedRegistryManifest({
    classification,
    env,
    api,
    fetchImpl,
  });
  const proof = await verifyProposedRegistryManifest({
    manifestContent,
    classification,
    env,
    repo,
    remote,
    api,
    fetchImpl,
    resolveStack,
  });
  return { classification, proof };
}

export async function preflightRegistryOnlyMerge({
  eventContent,
  env = process.env,
  repo = process.cwd(),
  remote = "origin",
  api = githubApi,
  fetchImpl,
  resolveStack,
  now = Date.now,
  maxAgeMs = REGISTRY_MERGE_SUCCESS_MAX_AGE_MS,
  merge = false,
  expectedHeadSha,
  sleepImpl = sleep,
  onBeforeMerge = async () => {},
  onMergePerformed = async () => {},
} = {}) {
  const mergeContext = merge
    ? assertTrustedMergeContext({ env, expectedHeadSha })
    : null;
  const first = await proveRegistryGeneration({
    eventContent,
    env,
    repo,
    remote,
    api,
    fetchImpl,
    resolveStack,
    expectedHeadSha: mergeContext?.expectedHeadSha,
  });
  const binding = first.classification.binding;
  if (
    mergeContext &&
    (binding.repository.fullName !== mergeContext.repository ||
      binding.repository.id !== mergeContext.repositoryId ||
      binding.defaultBranch !== mergeContext.defaultBranch)
  ) {
    fail("registry_merge_trusted_context_required");
  }
  const protection = await api({
    token: env.GITHUB_TOKEN,
    repository: binding.repository.fullName,
    path: `/branches/${encodeURIComponent(binding.defaultBranch)}/protection`,
    fetchImpl,
  });
  const requiredApps = inspectProtection(protection);
  const firstQueue = await readPublisherQueue({
    env,
    api,
    fetchImpl,
    mergeContext,
  });
  const validate = await assertRequiredChecks({
    classification: first.classification,
    proof: first.proof,
    requiredApps,
    env,
    api,
    fetchImpl,
    now,
    maxAgeMs,
  });

  const fresh = await proveRegistryGeneration({
    eventContent,
    env,
    repo,
    remote,
    api,
    fetchImpl,
    resolveStack,
    expectedHeadSha: mergeContext?.expectedHeadSha,
  });
  if (
    registryProofGeneration(fresh.proof) !==
    registryProofGeneration(first.proof)
  ) {
    fail("registry_merge_generation_changed");
  }
  const freshQueue = await readPublisherQueue({
    env,
    api,
    fetchImpl,
    mergeContext,
  });
  if (stable(freshQueue.generation) !== stable(firstQueue.generation)) {
    fail("registry_merge_publisher_queue_changed");
  }

  if (!merge) {
    const freshness = assertValidateFreshness({
      completedAt: validate.completedAt,
      now,
      maxAgeMs,
    });
    return {
      status: "advisory",
      mergeAuthorized: false,
      pr: binding.pullRequest.number,
      headSha: binding.pullRequest.headSha,
      baseSha: binding.pullRequest.baseSha,
      generation: validate.generation,
      validateCheckId: validate.checkId,
      validateCompletedAt: validate.completedAt,
      publisherRunId: freshQueue.latestRunId,
      evidenceExpiresAt: freshness.expiresAt,
      instructions:
        "Read-only evidence only; this result is not merge authorization. Dispatch the trusted default-branch merge_registry workflow operation with the exact expected head SHA.",
    };
  }

  // The merge-owning path performs a third, final live barrier. This is
  // intentionally redundant: the first two reads detect movement during the
  // longer proof, while these reads minimize the remaining cross-PR interval
  // before the expected-head protected merge request.
  const final = await proveRegistryGeneration({
    eventContent,
    env,
    repo,
    remote,
    api,
    fetchImpl,
    resolveStack,
    expectedHeadSha: mergeContext.expectedHeadSha,
  });
  if (
    registryProofGeneration(final.proof) !==
    registryProofGeneration(fresh.proof)
  ) {
    fail("registry_merge_generation_changed");
  }
  const finalProtection = inspectProtection(
    await api({
      token: env.GITHUB_TOKEN,
      repository: binding.repository.fullName,
      path: `/branches/${encodeURIComponent(binding.defaultBranch)}/protection`,
      fetchImpl,
    })
  );
  if (
    stableRequiredApps(finalProtection) !== stableRequiredApps(requiredApps)
  ) {
    fail("registry_merge_protection_changed");
  }
  const finalValidate = await assertRequiredChecks({
    classification: final.classification,
    proof: final.proof,
    requiredApps: finalProtection,
    env,
    api,
    fetchImpl,
    now,
    maxAgeMs,
  });
  const finalQueue = await readPublisherQueue({
    env,
    api,
    fetchImpl,
    mergeContext,
  });
  if (stable(finalQueue.generation) !== stable(freshQueue.generation)) {
    fail("registry_merge_publisher_queue_changed");
  }

  const immediateFreshness = assertValidateFreshness({
    completedAt: finalValidate.completedAt,
    now,
    maxAgeMs,
  });
  await onBeforeMerge();
  const mergeResult = await mergeExactPullRequest({
    classification: final.classification,
    env,
    api,
    fetchImpl,
  });
  await onMergePerformed({ mergeCommitSha: mergeResult.sha });
  await verifyPostMerge({
    classification: final.classification,
    mergeResult,
    expectedHeadSha: mergeContext.expectedHeadSha,
    env,
    api,
    fetchImpl,
    sleepImpl,
  });

  return {
    status: "merged",
    mergeAuthorized: true,
    pr: binding.pullRequest.number,
    headSha: binding.pullRequest.headSha,
    baseSha: binding.pullRequest.baseSha,
    generation: finalValidate.generation,
    validateCheckId: finalValidate.checkId,
    validateCompletedAt: finalValidate.completedAt,
    publisherRunId: finalQueue.latestRunId,
    evidenceExpiresAt: immediateFreshness.expiresAt,
    mergeCommitSha: mergeResult.sha,
    postMergeVerified: true,
    instructions:
      "The exact registry PR head was merged through normal protected GitHub merge semantics. No auto-merge or admin bypass was used.",
  };
}

export function parseRegistryMergeArguments(argv) {
  if (!Array.isArray(argv)) fail("registry_merge_arguments_invalid");
  let prNumber;
  let merge = false;
  let expectedHeadSha;
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!new Set(["--pr", "--merge", "--expected-head-sha"]).has(argument)) {
      fail("registry_merge_argument_unknown");
    }
    if (seen.has(argument)) fail("registry_merge_argument_duplicate");
    seen.add(argument);
    if (argument === "--merge") {
      merge = true;
      continue;
    }
    const value = argv[index + 1];
    if (typeof value !== "string" || value.startsWith("--")) {
      fail("registry_merge_argument_value_required");
    }
    index += 1;
    if (argument === "--pr") {
      prNumber = positiveInteger(value, "registry_merge_pr_required");
    } else {
      if (!SHA_PATTERN.test(value)) {
        fail("registry_merge_expected_head_required");
      }
      expectedHeadSha = value;
    }
  }
  if (!prNumber) fail("registry_merge_pr_required");
  if (merge && !expectedHeadSha) fail("registry_merge_expected_head_required");
  if (!merge && expectedHeadSha) {
    fail("registry_merge_expected_head_unexpected");
  }
  return { prNumber, merge, expectedHeadSha };
}

export function assertTrustedDispatchEvent({ env, args }) {
  if (!env.GITHUB_EVENT_PATH) fail("registry_merge_dispatch_event_required");
  let event;
  try {
    event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  } catch {
    fail("registry_merge_dispatch_event_invalid");
  }
  const inputKeys = Object.keys(event?.inputs ?? {}).sort();
  if (
    stable(inputKeys) !==
      stable(["expected_head_sha", "operation", "registry_pr"]) ||
    event.inputs.operation !== "merge_registry" ||
    event.inputs.registry_pr !== String(args.prNumber) ||
    event.inputs.expected_head_sha !== args.expectedHeadSha ||
    event.ref !== CANONICAL_DEFAULT_BRANCH ||
    event.repository?.full_name !== CANONICAL_REPOSITORY ||
    event.repository?.id !== Number(env.GITHUB_REPOSITORY_ID) ||
    event.sender?.id !== Number(env.GITHUB_ACTOR_ID)
  ) {
    fail("registry_merge_dispatch_event_invalid");
  }
}

async function main() {
  const args = parseRegistryMergeArguments(process.argv.slice(2));
  if (!args.merge) fail("registry_merge_cli_trusted_only");
  assertTrustedMergeContext({
    env: process.env,
    expectedHeadSha: args.expectedHeadSha,
  });
  assertTrustedDispatchEvent({ env: process.env, args });
  const repositoryName = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!token || !process.env.GITHUB_OUTPUT) {
    fail("registry_merge_environment_required");
  }
  const repository = await githubApi({
    token,
    repository: repositoryName,
    path: "",
  });
  if (
    repository?.full_name !== repositoryName ||
    !Number.isSafeInteger(repository?.id) ||
    typeof repository?.default_branch !== "string"
  ) {
    fail("registry_merge_repository_identity_invalid");
  }
  const pullRequest = await githubApi({
    token,
    repository: repositoryName,
    path: `/pulls/${args.prNumber}`,
  });
  const env = {
    ...process.env,
    GITHUB_REPOSITORY: repository.full_name,
    GITHUB_REPOSITORY_ID: String(repository.id),
    GITHUB_DEFAULT_BRANCH: repository.default_branch,
    GITHUB_TOKEN: token,
  };
  const eventContent = JSON.stringify({
    action: "operator_preflight",
    repository,
    pull_request: pullRequest,
  });
  const result = await preflightRegistryOnlyMerge({
    eventContent,
    env,
    merge: args.merge,
    expectedHeadSha: args.expectedHeadSha,
    onBeforeMerge: async () => {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        "merge_attempted=true\n",
        "utf8"
      );
    },
    onMergePerformed: async ({ mergeCommitSha }) => {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `merge_performed=true\nmerge_commit_sha=${mergeCommitSha}\n`,
        "utf8"
      );
    },
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        status: "error",
        error: error instanceof Error ? error.message : "registry_merge_failed",
      })
    );
    process.exitCode = 1;
  });
}
