import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  checkStackTopology,
  extractStackEvidence,
  loadStackManifest,
  validatePullRequestDeclaration,
} from "./check-stacked-pr.mjs";

const manifest = loadStackManifest();
const eventPath = process.env.GITHUB_EVENT_PATH;
const event = eventPath ? JSON.parse(readFileSync(eventPath, "utf8")) : {};
const headRef = event.pull_request?.head?.ref ?? process.env.GITHUB_REF_NAME;
const headRevision =
  event.pull_request?.head?.sha ?? process.env.GITHUB_SHA ?? "HEAD";
const declaration = event.pull_request
  ? validatePullRequestDeclaration({
      manifest,
      headRef,
      baseRef: event.pull_request.base.ref,
      defaultBranch: event.repository?.default_branch ?? "main",
    })
  : {
      entry:
        manifest.stacks.find((candidate) => candidate.headRef === headRef) ??
        null,
      errors: [],
    };
const entry = declaration.entry;

if (declaration.errors.length > 0) {
  console.error(
    JSON.stringify({ status: "fail", headRef, errors: declaration.errors })
  );
  process.exit(1);
}

if (!entry) {
  console.log(JSON.stringify({ status: "not_stacked", headRef, errors: [] }));
  process.exit(0);
}

execFileSync(
  "git",
  [
    "fetch",
    "--no-tags",
    "origin",
    `+refs/heads/${entry.parentRef}:refs/remotes/origin/${entry.parentRef}`,
  ],
  { stdio: "inherit" }
);

const evidence = event.pull_request
  ? extractStackEvidence(readFileSync(eventPath, "utf8"))
  : null;
const result = checkStackTopology({
  manifest,
  headRef,
  headRevision,
  parentRevision: `refs/remotes/origin/${entry.parentRef}`,
  evidence,
  requireEvidence: Boolean(event.pull_request),
});
console.log(JSON.stringify(result, null, 2));
if (result.status === "fail") process.exitCode = 1;
