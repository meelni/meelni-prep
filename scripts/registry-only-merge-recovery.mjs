import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { githubApi } from "./check-stacked-pr-ci.mjs";
import {
  assertTrustedDispatchEvent,
  assertTrustedMergeContext,
} from "./registry-only-merge-preflight.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function fail(code) {
  throw new Error(code);
}

export function parseRegistryMergeRecoveryArguments(argv) {
  if (!Array.isArray(argv)) fail("registry_merge_recovery_arguments_invalid");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (
      !new Set(["--pr", "--expected-head-sha"]).has(argument) ||
      values.has(argument) ||
      typeof value !== "string" ||
      value.startsWith("--")
    ) {
      fail("registry_merge_recovery_arguments_invalid");
    }
    values.set(argument, value);
  }
  const pr = values.get("--pr");
  const expectedHeadSha = values.get("--expected-head-sha");
  if (
    !/^[1-9][0-9]*$/.test(pr ?? "") ||
    !SHA_PATTERN.test(expectedHeadSha ?? "")
  ) {
    fail("registry_merge_recovery_arguments_invalid");
  }
  const prNumber = Number(pr);
  if (!Number.isSafeInteger(prNumber)) {
    fail("registry_merge_recovery_arguments_invalid");
  }
  return { prNumber, expectedHeadSha };
}

function sameRepository(repository, expected) {
  return (
    repository?.full_name === expected.full_name &&
    repository?.id === expected.id
  );
}

export async function recoverRegistryMerge({
  prNumber,
  expectedHeadSha,
  env = process.env,
  api = githubApi,
  fetchImpl,
} = {}) {
  assertTrustedMergeContext({ env, expectedHeadSha });
  const repository = await api({
    token: env.GITHUB_TOKEN,
    repository: env.GITHUB_REPOSITORY,
    path: "",
    fetchImpl,
  });
  if (
    repository?.full_name !== env.GITHUB_REPOSITORY ||
    repository?.id !== Number(env.GITHUB_REPOSITORY_ID) ||
    repository?.default_branch !== env.GITHUB_DEFAULT_BRANCH
  ) {
    fail("registry_merge_recovery_repository_invalid");
  }
  const pullRequest = await api({
    token: env.GITHUB_TOKEN,
    repository: repository.full_name,
    path: `/pulls/${prNumber}`,
    fetchImpl,
  });
  if (
    pullRequest?.number !== prNumber ||
    pullRequest?.head?.sha !== expectedHeadSha ||
    !sameRepository(pullRequest?.head?.repo, repository) ||
    !sameRepository(pullRequest?.base?.repo, repository) ||
    pullRequest?.base?.ref !== repository.default_branch
  ) {
    fail("registry_merge_recovery_pull_request_invalid");
  }
  if (pullRequest.state === "open" && pullRequest.merged === false) {
    return { status: "not_merged", mergePerformed: false };
  }
  const mergeCommitSha = pullRequest.merge_commit_sha;
  if (
    pullRequest.state !== "closed" ||
    pullRequest.merged !== true ||
    !SHA_PATTERN.test(mergeCommitSha ?? "")
  ) {
    fail("registry_merge_recovery_state_uncertain");
  }
  const [commit, defaultBranchRef] = await Promise.all([
    api({
      token: env.GITHUB_TOKEN,
      repository: repository.full_name,
      path: `/git/commits/${mergeCommitSha}`,
      fetchImpl,
    }),
    api({
      token: env.GITHUB_TOKEN,
      repository: repository.full_name,
      path: `/git/ref/heads/${encodeURIComponent(repository.default_branch)}`,
      fetchImpl,
    }),
  ]);
  if (
    commit?.sha !== mergeCommitSha ||
    !SHA_PATTERN.test(commit?.tree?.sha ?? "")
  ) {
    fail("registry_merge_recovery_commit_invalid");
  }
  return {
    status: "merged",
    mergePerformed: true,
    mergeCommitSha,
    defaultBranchHeadMatches:
      defaultBranchRef?.ref === `refs/heads/${repository.default_branch}` &&
      defaultBranchRef?.object?.type === "commit" &&
      defaultBranchRef?.object?.sha === mergeCommitSha,
  };
}

async function main() {
  const args = parseRegistryMergeRecoveryArguments(process.argv.slice(2));
  assertTrustedDispatchEvent({ env: process.env, args });
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_OUTPUT) {
    fail("registry_merge_recovery_environment_required");
  }
  const result = await recoverRegistryMerge({ ...args, env: process.env });
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    result.mergePerformed
      ? `merge_performed=true\nmerge_commit_sha=${result.mergeCommitSha}\n`
      : "merge_performed=false\n",
    "utf8"
  );
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "registry_merge_recovery_failed",
      })
    );
    process.exitCode = 1;
  });
}
