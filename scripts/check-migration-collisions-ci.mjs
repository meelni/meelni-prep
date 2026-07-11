import { fileURLToPath } from "node:url";

import {
  evaluateMigrationInventories,
  inventoryPullRequestMigrations,
} from "./check-migration-collisions.mjs";
import { githubApi } from "./check-stacked-pr-ci.mjs";

export const MIGRATION_COLLISION_CHECK_NAME = "Migration Collision / Verify";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GITHUB_PULL_FILES_LIMIT = 3_000;

function appendQuery(path, query) {
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

export async function paginateGithubApi({
  token,
  repository,
  path,
  fetchImpl,
  api = githubApi,
  perPage = 100,
  maxPages = 100,
}) {
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
    throw new Error("migration_collision_page_size_invalid");
  }
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error("migration_collision_page_limit_invalid");
  }

  const values = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await api({
      token,
      repository,
      path: appendQuery(path, `per_page=${perPage}&page=${page}`),
      fetchImpl,
    });
    if (!Array.isArray(response)) {
      throw new Error("migration_collision_page_invalid");
    }
    values.push(...response);
    if (response.length < perPage) return values;
  }
  throw new Error("migration_collision_pagination_limit_exceeded");
}

function validatePullRequest(pullRequest) {
  if (
    !Number.isInteger(pullRequest?.number) ||
    pullRequest.number < 1 ||
    pullRequest.state !== "open" ||
    !SHA_PATTERN.test(pullRequest?.head?.sha ?? "") ||
    typeof pullRequest?.head?.ref !== "string" ||
    typeof pullRequest?.head?.repo?.full_name !== "string" ||
    typeof pullRequest?.base?.ref !== "string"
  ) {
    throw new Error("migration_collision_pull_request_invalid");
  }
  return pullRequest;
}

function pullRequestIdentity(pullRequest) {
  return `${pullRequest.number}:${pullRequest.head.sha}:${pullRequest.head.ref}:${pullRequest.base.ref}`;
}

export async function inventoryOpenMigrationPullRequests({
  token,
  repository,
  fetchImpl,
  api = githubApi,
  paginate = paginateGithubApi,
  perPage = 100,
  maxPages = 100,
}) {
  const pullRequests = await paginate({
    token,
    repository,
    path: "/pulls?state=open",
    fetchImpl,
    api,
    perPage,
    maxPages,
  });
  const sameRepositoryPullRequests = pullRequests
    .map(validatePullRequest)
    .filter((pullRequest) => pullRequest.head.repo.full_name === repository)
    .sort((left, right) => left.number - right.number);
  if (
    new Set(sameRepositoryPullRequests.map((pullRequest) => pullRequest.number))
      .size !== sameRepositoryPullRequests.length
  ) {
    throw new Error("migration_collision_duplicate_pull_request");
  }

  const inventories = [];
  const errors = [];
  for (const pullRequest of sameRepositoryPullRequests) {
    try {
      const files = await paginate({
        token,
        repository,
        path: `/pulls/${pullRequest.number}/files`,
        fetchImpl,
        api,
        perPage,
        maxPages,
      });
      if (files.length >= GITHUB_PULL_FILES_LIMIT) {
        throw new Error("migration_collision_file_inventory_limit_exceeded");
      }
      const currentPullRequest = validatePullRequest(
        await api({
          token,
          repository,
          path: `/pulls/${pullRequest.number}`,
          fetchImpl,
        })
      );
      if (
        currentPullRequest.head.sha !== pullRequest.head.sha ||
        currentPullRequest.head.ref !== pullRequest.head.ref ||
        currentPullRequest.head.repo.full_name !==
          pullRequest.head.repo.full_name ||
        currentPullRequest.base.ref !== pullRequest.base.ref
      ) {
        throw new Error("migration_collision_pr_moved_during_inventory");
      }
      inventories.push(inventoryPullRequestMigrations({ pullRequest, files }));
    } catch (error) {
      errors.push({
        pr: pullRequest.number,
        error:
          error instanceof Error
            ? error.message
            : "migration_collision_inventory_failed",
      });
    }
  }

  try {
    const finalPullRequests = (
      await paginate({
        token,
        repository,
        path: "/pulls?state=open",
        fetchImpl,
        api,
        perPage,
        maxPages,
      })
    )
      .map(validatePullRequest)
      .filter((pullRequest) => pullRequest.head.repo.full_name === repository)
      .sort((left, right) => left.number - right.number);
    if (
      finalPullRequests.length !== sameRepositoryPullRequests.length ||
      finalPullRequests.some(
        (pullRequest, index) =>
          pullRequestIdentity(pullRequest) !==
          pullRequestIdentity(sameRepositoryPullRequests[index])
      )
    ) {
      throw new Error("migration_collision_open_pr_set_moved_during_inventory");
    }
  } catch (error) {
    errors.push({
      pr: null,
      error:
        error instanceof Error
          ? error.message
          : "migration_collision_open_pr_recheck_failed",
    });
  }

  return {
    pullRequests: sameRepositoryPullRequests,
    inventories,
    errors,
    snapshot: sameRepositoryPullRequests.map(pullRequestIdentity),
  };
}

function collisionSummary(result) {
  if (result.status === "error") {
    return (
      result.inventoryError ??
      "Open-PR migration inventory failed; collision absence cannot be proven."
    );
  }
  if (result.status === "not_applicable") {
    return "This exact PR head does not change a numeric Drizzle SQL migration.";
  }
  if (result.status === "pass") {
    const sequences = result.migrations
      .map((migration) => migration.sequence)
      .join(", ");
    return `This exact PR head owns migration sequence(s) ${sequences}; no other open same-repository PR owns them.`;
  }
  const violations = (result.violations ?? []).map((violation) =>
    violation.type === "migration_history_removed"
      ? `Committed migration history was removed: ${JSON.stringify(violation.path)}.`
      : `Committed migration history was renamed away: ${JSON.stringify(violation.path)} -> ${JSON.stringify(violation.replacementPath)}.`
  );
  const collisions = result.collisions.map((collision) => {
    const owners = collision.owners
      .map((owner) => `#${owner.pr} (${JSON.stringify(owner.path)})`)
      .join(", ");
    return `Sequence ${collision.sequence} has multiple open owners: ${owners}.`;
  });
  return [...violations, ...collisions].join("\n");
}

function conclusionForResult(result) {
  return result.status === "pass"
    ? "success"
    : result.status === "not_applicable"
      ? "neutral"
      : "failure";
}

export async function hasMatchingMigrationCheck({
  token,
  repository,
  result,
  fetchImpl,
  api = githubApi,
}) {
  const response = await api({
    token,
    repository,
    path: `/commits/${result.headSha}/check-runs?check_name=${encodeURIComponent(MIGRATION_COLLISION_CHECK_NAME)}&filter=latest&per_page=1`,
    fetchImpl,
  });
  if (
    !Number.isInteger(response?.total_count) ||
    !Array.isArray(response?.check_runs)
  ) {
    throw new Error("migration_collision_check_lookup_invalid");
  }
  const expectedSummary = collisionSummary(result).slice(0, 60_000);
  return response.check_runs.some(
    (check) =>
      check?.name === MIGRATION_COLLISION_CHECK_NAME &&
      check.app?.slug === "github-actions" &&
      check.status === "completed" &&
      check.conclusion === conclusionForResult(result) &&
      check.output?.summary === expectedSummary
  );
}

export async function assertMigrationResultFresh({
  token,
  repository,
  result,
  fetchImpl,
  api = githubApi,
}) {
  if (!Array.isArray(result.inventorySnapshot)) {
    throw new Error("migration_collision_snapshot_missing");
  }
  const currentPullRequests = (
    await paginateGithubApi({
      token,
      repository,
      path: "/pulls?state=open",
      fetchImpl,
      api,
    })
  )
    .map(validatePullRequest)
    .filter((pullRequest) => pullRequest.head.repo.full_name === repository)
    .sort((left, right) => left.number - right.number);
  const currentSnapshot = currentPullRequests.map(pullRequestIdentity);
  if (
    currentSnapshot.length !== result.inventorySnapshot.length ||
    currentSnapshot.some(
      (identity, index) => identity !== result.inventorySnapshot[index]
    )
  ) {
    throw new Error("migration_collision_global_snapshot_became_stale");
  }
  const pullRequest = currentPullRequests.find(
    (candidate) => candidate.number === result.pr
  );
  if (
    !pullRequest ||
    pullRequest.head.sha !== result.headSha ||
    pullRequest.head.ref !== result.headRef ||
    pullRequest.head.repo.full_name !== repository ||
    pullRequest.base.ref !== result.baseRef
  ) {
    throw new Error("migration_collision_result_became_stale");
  }
}

export async function createMigrationCheck({
  token,
  repository,
  headSha,
  fetchImpl,
  api = githubApi,
}) {
  const check = await api({
    token,
    repository,
    path: "/check-runs",
    method: "POST",
    body: {
      name: MIGRATION_COLLISION_CHECK_NAME,
      head_sha: headSha,
      status: "in_progress",
      started_at: new Date().toISOString(),
      output: {
        title: "Migration collision verification is running",
        summary:
          "Trusted default-branch code is inventorying open same-repository PR file diffs.",
      },
    },
    fetchImpl,
  });
  if (!Number.isInteger(check?.id)) {
    throw new Error("migration_collision_check_run_id_missing");
  }
  return check.id;
}

export async function completeMigrationCheck({
  token,
  repository,
  checkId,
  result,
  fetchImpl,
  api = githubApi,
}) {
  const conclusion = conclusionForResult(result);
  const summary = collisionSummary(result).slice(0, 60_000);
  await api({
    token,
    repository,
    path: `/check-runs/${checkId}`,
    method: "PATCH",
    body: {
      status: "completed",
      conclusion,
      completed_at: new Date().toISOString(),
      output: {
        title:
          conclusion === "success"
            ? "Migration sequence ownership is unique"
            : conclusion === "neutral"
              ? "PR does not own a Drizzle migration sequence"
              : "Migration collision verification failed",
        summary,
      },
    },
    fetchImpl,
  });
}

export async function publishMigrationResult({
  token,
  repository,
  result,
  fetchImpl,
  api = githubApi,
  reuseCheck = hasMatchingMigrationCheck,
  freshnessCheck = assertMigrationResultFresh,
}) {
  let freshnessFailed = false;
  try {
    await freshnessCheck({
      token,
      repository,
      result,
      fetchImpl,
      api,
    });
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
        : "migration_collision_freshness_check_failed";
    result = {
      ...result,
      status: "error",
      inventoryError: `Publication was deferred because the exact PR head could not be proven current (${code}); a failure replaces any stale success.`,
    };
    freshnessFailed = true;
  }
  try {
    if (
      !freshnessFailed &&
      (await reuseCheck({
        token,
        repository,
        result,
        fetchImpl,
        api,
      }))
    ) {
      return { ...result, publication: "reused" };
    }
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
        : "migration_collision_check_lookup_failed";
    result = {
      ...result,
      status: "error",
      inventoryError: `The latest exact-head collision check could not be read (${code}); a failure replaces any stale success.`,
    };
  }
  const checkId = await createMigrationCheck({
    token,
    repository,
    headSha: result.headSha,
    fetchImpl,
    api,
  });
  await completeMigrationCheck({
    token,
    repository,
    checkId,
    result,
    fetchImpl,
    api,
  });
  return { ...result, publication: "created" };
}

export async function auditOpenMigrationPullRequests({
  env = process.env,
  repository = env.GITHUB_REPOSITORY,
  fetchImpl,
  api = githubApi,
  inventory = inventoryOpenMigrationPullRequests,
  fallbackPullRequest,
  triggeringPrNumber,
  freshnessCheck = assertMigrationResultFresh,
} = {}) {
  if (!REPOSITORY_PATTERN.test(repository ?? "")) {
    throw new Error("migration_collision_repository_invalid");
  }
  const token = env.GITHUB_TOKEN;
  let inventoryResult;
  try {
    inventoryResult = await inventory({
      token,
      repository,
      fetchImpl,
      api,
    });
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message
        : "migration_collision_inventory_failed";
    const fallback = fallbackPullRequest
      ? validatePullRequest(fallbackPullRequest)
      : null;
    if (fallback?.head.repo.full_name === repository) {
      await publishMigrationResult({
        token,
        repository,
        result: {
          pr: fallback.number,
          headSha: fallback.head.sha,
          headRef: fallback.head.ref,
          baseRef: fallback.base.ref,
          migrations: [],
          collisions: [],
          status: "error",
          inventoryError: `Open-PR migration inventory failed (${code}). Collision absence cannot be proven.`,
        },
        fetchImpl,
        api,
        freshnessCheck,
      });
    }
    return {
      status: "error",
      errors: [{ pr: null, error: code }],
      results: [],
    };
  }
  const { pullRequests, inventories, errors } = inventoryResult;
  const inventorySnapshot =
    inventoryResult.snapshot ?? pullRequests.map(pullRequestIdentity);

  let results;
  if (errors.length > 0) {
    const detail = errors
      .map((entry) =>
        entry.pr === null
          ? `global: ${entry.error}`
          : `#${entry.pr}: ${entry.error}`
      )
      .join("; ");
    const inventoryByPr = new Map(
      inventories.map((inventory) => [inventory.pr, inventory])
    );
    const failedPrs = new Set(errors.map((entry) => entry.pr));
    results = pullRequests
      .filter((pullRequest) => {
        const partial = inventoryByPr.get(pullRequest.number);
        return (
          failedPrs.has(pullRequest.number) ||
          partial?.migrations.length > 0 ||
          partial?.violations?.length > 0 ||
          pullRequest.number === triggeringPrNumber
        );
      })
      .map((pullRequest) => {
        const partial = inventoryByPr.get(pullRequest.number);
        return {
          pr: pullRequest.number,
          headSha: pullRequest.head.sha,
          headRef: pullRequest.head.ref,
          baseRef: pullRequest.base.ref,
          migrations: partial?.migrations ?? [],
          violations: partial?.violations ?? [],
          collisions: [],
          inventorySnapshot,
          status: "error",
          inventoryError: `Open-PR migration inventory is incomplete (${detail}). Collision absence cannot be proven.`,
        };
      });
  } else {
    results = evaluateMigrationInventories(inventories)
      .filter(
        (result) =>
          result.migrations.length > 0 ||
          result.violations.length > 0 ||
          result.pr === triggeringPrNumber
      )
      .map((result) => ({ ...result, inventorySnapshot }));
  }

  const publishedResults = [];
  const publicationErrors = [];
  for (const result of results) {
    try {
      publishedResults.push(
        await publishMigrationResult({
          token,
          repository,
          result,
          fetchImpl,
          api,
          freshnessCheck,
        })
      );
    } catch (error) {
      publicationErrors.push({
        pr: result.pr,
        error:
          error instanceof Error
            ? error.message
            : "migration_collision_check_publish_failed",
      });
    }
  }
  return {
    status:
      errors.length > 0 ||
      publicationErrors.length > 0 ||
      publishedResults.some((result) => result.status === "error")
        ? "error"
        : publishedResults.some((result) => result.status === "fail")
          ? "fail"
          : "pass",
    errors: [...errors, ...publicationErrors],
    results: publishedResults,
  };
}

async function main() {
  try {
    const result = await auditOpenMigrationPullRequests();
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "pass") process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "migration_collision_check_failed",
      })
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
