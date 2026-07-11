import { fileURLToPath } from "node:url";

import { loadStackManifest } from "./check-stacked-pr.mjs";
import { githubApi, runStackCiAndPublish } from "./check-stacked-pr-ci.mjs";

export async function revalidateRegisteredStacks({
  env = process.env,
  repo = process.cwd(),
  remote = "origin",
  fetchImpl,
  manifest = loadStackManifest(),
  manifestPath,
  api = githubApi,
  verifyAndPublish = runStackCiAndPublish,
} = {}) {
  const token = env.GITHUB_TOKEN;
  const results = [];
  for (const entry of manifest.stacks) {
    try {
      const pullRequest = await api({
        token,
        repository: manifest.repository,
        path: `/pulls/${entry.pr}`,
        fetchImpl,
      });
      if (pullRequest?.state !== "open") continue;
      const eventContent = JSON.stringify({
        number: pullRequest.number,
        repository: {
          full_name: manifest.repository,
          default_branch: env.GITHUB_DEFAULT_BRANCH ?? "main",
        },
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
      results.push(
        await verifyAndPublish({
          eventContent,
          env,
          repo,
          remote,
          fetchImpl,
          manifestPath,
        })
      );
    } catch (error) {
      results.push({
        status: "error",
        pr: entry.pr,
        errors: [
          error instanceof Error ? error.message : "stack_revalidation_failed",
        ],
      });
    }
  }
  return results;
}

async function main() {
  try {
    const results = await revalidateRegisteredStacks();
    console.log(JSON.stringify(results, null, 2));
    if (
      results.some(
        (result) => result.status === "fail" || result.status === "error"
      )
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "error",
        error:
          error instanceof Error ? error.message : "stack_revalidation_failed",
      })
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
