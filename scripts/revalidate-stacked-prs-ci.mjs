import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

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
  entries = manifest.stacks,
} = {}) {
  const token = env.GITHUB_TOKEN;
  const results = [];
  for (const entry of entries) {
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

export async function revalidateAffectedStacksForEvent({
  eventContent,
  env = process.env,
  manifest = loadStackManifest(),
  api = githubApi,
  ...options
} = {}) {
  const event = JSON.parse(eventContent);
  const pullRequest = event.pull_request;
  const repository = event.repository?.full_name;
  if (
    repository !== manifest.repository ||
    !Number.isInteger(pullRequest?.number) ||
    typeof pullRequest?.head?.ref !== "string"
  ) {
    throw new Error("stack_gate_event_invalid");
  }

  const targets = new Map();
  targets.set(pullRequest.number, {
    pr: pullRequest.number,
    headRef: pullRequest.head.ref,
  });
  if (pullRequest.head.repo?.full_name === manifest.repository) {
    for (const entry of manifest.stacks) {
      if (entry.parentRef === pullRequest.head.ref)
        targets.set(entry.pr, entry);
    }
  }

  return revalidateRegisteredStacks({
    env,
    manifest,
    api,
    entries: [...targets.values()],
    ...options,
  });
}

async function main() {
  try {
    const eventPathIndex = process.argv.indexOf("--event-path");
    const results =
      eventPathIndex === -1
        ? await revalidateRegisteredStacks()
        : await revalidateAffectedStacksForEvent({
            eventContent: readFileSync(
              process.argv[eventPathIndex + 1],
              "utf8"
            ),
          });
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
