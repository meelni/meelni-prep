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

function assertMergeState(pullRequest, binding) {
  const expected = binding.pullRequest;
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

function inspectPublisherQueue(runs) {
  if (runs.length === 0) fail("registry_merge_publisher_history_missing");
  if (runs.some((run) => run?.status !== "completed")) {
    fail("registry_merge_publisher_queue_active");
  }
  const ordered = [...runs].sort((left, right) => {
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

async function proveRegistryGeneration({
  eventContent,
  env,
  repo,
  remote,
  api,
  fetchImpl,
  resolveStack,
}) {
  const classification = await classifyRegistryOnlyPullRequest({
    eventContent,
    env,
    api,
    fetchImpl,
  });
  if (!classification.eligible) fail("registry_merge_not_registry_only");
  const current = await api({
    token: env.GITHUB_TOKEN,
    repository: classification.binding.repository.fullName,
    path: `/pulls/${classification.binding.pullRequest.number}`,
    fetchImpl,
  });
  assertMergeState(current, classification.binding);
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
} = {}) {
  const first = await proveRegistryGeneration({
    eventContent,
    env,
    repo,
    remote,
    api,
    fetchImpl,
    resolveStack,
  });
  const binding = first.classification.binding;
  const protection = await api({
    token: env.GITHUB_TOKEN,
    repository: binding.repository.fullName,
    path: `/branches/${encodeURIComponent(binding.defaultBranch)}/protection`,
    fetchImpl,
  });
  const requiredApps = inspectProtection(protection);
  const firstQueue = inspectPublisherQueue(
    await listPublisherRuns({ env, api, fetchImpl })
  );
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
  });
  if (
    registryProofGeneration(fresh.proof) !==
    registryProofGeneration(first.proof)
  ) {
    fail("registry_merge_generation_changed");
  }
  const freshQueue = inspectPublisherQueue(
    await listPublisherRuns({ env, api, fetchImpl })
  );
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
        "Read-only evidence only; this result is not merge authorization. Run the explicit trusted --merge command so the final live barrier and exact-head protected merge happen in one operator flow.",
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
  const finalQueue = inspectPublisherQueue(
    await listPublisherRuns({ env, api, fetchImpl })
  );
  if (stable(finalQueue.generation) !== stable(freshQueue.generation)) {
    fail("registry_merge_publisher_queue_changed");
  }

  const immediateFreshness = assertValidateFreshness({
    completedAt: finalValidate.completedAt,
    now,
    maxAgeMs,
  });
  const mergeResult = await mergeExactPullRequest({
    classification: final.classification,
    env,
    api,
    fetchImpl,
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
    instructions:
      "The exact registry PR head was merged through normal protected GitHub merge semantics. No auto-merge or admin bypass was used.",
  };
}

function parsePrNumber(argv) {
  const index = argv.indexOf("--pr");
  const number = Number(argv[index + 1]);
  if (index < 0 || !Number.isSafeInteger(number) || number < 1) {
    fail("registry_merge_pr_required");
  }
  return number;
}

function mergeRequested(argv) {
  return argv.includes("--merge");
}

async function main() {
  const repositoryName = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!repositoryName || !token) fail("registry_merge_environment_required");
  const argv = process.argv.slice(2);
  const prNumber = parsePrNumber(argv);
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
    path: `/pulls/${prNumber}`,
  });
  const env = {
    ...process.env,
    GITHUB_EVENT_NAME: "workflow_dispatch",
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
    merge: mergeRequested(argv),
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
