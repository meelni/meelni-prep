import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MANIFEST = ".github/stacked-prs.json";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const REF_PATTERN = /^(?!\/)(?!.*(?:\.\.|\/\/))[A-Za-z0-9._/-]+$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const EVIDENCE_PATTERN = /<!--\s*meelni-stack-evidence\s*\n([\s\S]*?)\n\s*-->/m;

export function loadStackManifest(path = DEFAULT_MANIFEST) {
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  if (
    manifest.version !== 1 ||
    !REPOSITORY_PATTERN.test(manifest.repository ?? "") ||
    !Array.isArray(manifest.stacks)
  ) {
    throw new Error("stack_manifest_invalid_shape");
  }
  const seen = new Set();
  for (const entry of manifest.stacks) {
    if (
      !Number.isInteger(entry.pr) ||
      entry.pr < 1 ||
      !REF_PATTERN.test(entry.headRef ?? "") ||
      !REF_PATTERN.test(entry.parentRef ?? "") ||
      !SHA_PATTERN.test(entry.expectedParentHead ?? "")
    ) {
      throw new Error("stack_manifest_invalid_entry");
    }
    if (seen.has(entry.headRef))
      throw new Error("stack_manifest_duplicate_head");
    seen.add(entry.headRef);
  }
  return manifest;
}

export function extractStackEvidence(content) {
  let body = content;
  try {
    const event = JSON.parse(content);
    if (typeof event?.pull_request?.body === "string") {
      body = event.pull_request.body;
    }
  } catch {
    // A raw PR body is also a supported evidence input.
  }
  const match = body.match(EVIDENCE_PATTERN);
  if (!match) return null;
  const evidence = JSON.parse(match[1]);
  if (
    evidence.version !== 1 ||
    !REF_PATTERN.test(evidence.headRef ?? "") ||
    !REF_PATTERN.test(evidence.parentRef ?? "") ||
    !SHA_PATTERN.test(evidence.head ?? "") ||
    !SHA_PATTERN.test(evidence.parentHead ?? "") ||
    !SHA_PATTERN.test(evidence.mergeBase ?? "")
  ) {
    throw new Error("stack_evidence_invalid");
  }
  return evidence;
}

export function validatePullRequestDeclaration({
  manifest,
  prNumber,
  headRef,
  headRepository,
  baseRef,
  defaultBranch = "main",
}) {
  const isManifestRepository = headRepository === manifest.repository;
  const entry = manifest.stacks.find(
    (candidate) => candidate.headRef === headRef
  );
  if (!isManifestRepository) {
    if (baseRef !== defaultBranch) {
      return {
        entry: null,
        errors: ["stacked_pr_must_originate_from_manifest_repository"],
      };
    }
    return { entry: null, errors: [] };
  }
  if (!entry && baseRef !== defaultBranch) {
    return {
      entry: null,
      errors: ["stack_relationship_missing_from_manifest"],
    };
  }
  if (entry && entry.pr !== prNumber) {
    return { entry, errors: ["github_pr_differs_from_manifest_entry"] };
  }
  if (entry && entry.parentRef !== baseRef) {
    return { entry, errors: ["github_base_differs_from_declared_parent"] };
  }
  return { entry: entry ?? null, errors: [] };
}

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function resolveCommit(repo, revision) {
  return git(repo, ["rev-parse", "--verify", `${revision}^{commit}`]);
}

export function checkStackTopology({
  repo = process.cwd(),
  manifest,
  headRef,
  headRevision = "HEAD",
  parentRevision,
  evidence = null,
  requireEvidence = true,
}) {
  const entry = manifest.stacks.find(
    (candidate) => candidate.headRef === headRef
  );
  if (!entry) {
    return { status: "not_stacked", headRef, errors: [] };
  }

  const resolvedParentRevision =
    parentRevision ?? `refs/remotes/origin/${entry.parentRef}`;
  const head = resolveCommit(repo, headRevision);
  const parentHead = resolveCommit(repo, resolvedParentRevision);
  const mergeBase = git(repo, ["merge-base", head, parentHead]);
  const [behind, ahead] = git(repo, [
    "rev-list",
    "--left-right",
    "--count",
    `${parentHead}...${head}`,
  ])
    .split(/\s+/)
    .map(Number);
  const errors = [];

  if (entry.expectedParentHead !== parentHead) {
    errors.push("declared_parent_head_is_stale");
  }
  if (mergeBase !== parentHead || behind !== 0) {
    errors.push("head_does_not_contain_current_parent");
  }
  if (requireEvidence && !evidence) {
    errors.push("current_topology_evidence_missing");
  }
  if (evidence) {
    const comparisons = {
      headRef,
      parentRef: entry.parentRef,
      head,
      parentHead,
      mergeBase,
    };
    for (const [field, actual] of Object.entries(comparisons)) {
      if (evidence[field] !== actual) {
        errors.push(`evidence_${field}_is_superseded`);
      }
    }
  }

  return {
    status: errors.length === 0 ? "pass" : "fail",
    pr: entry.pr,
    headRef,
    head,
    parentRef: entry.parentRef,
    declaredParentHead: entry.expectedParentHead,
    actualParentHead: parentHead,
    mergeBase,
    behind,
    ahead,
    evidence: evidence ? "present" : requireEvidence ? "missing" : "skipped",
    errors,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--skip-evidence" || token === "--print-parent-ref") {
      args[token.slice(2)] = true;
      continue;
    }
    if (!token.startsWith("--") || index + 1 >= argv.length) {
      throw new Error(`stack_check_unknown_argument:${token}`);
    }
    args[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

export function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const manifestPath = resolve(args.manifest ?? DEFAULT_MANIFEST);
  const manifest = loadStackManifest(manifestPath);
  const headRef = args["head-ref"];
  if (!headRef || !REF_PATTERN.test(headRef)) {
    throw new Error("stack_check_head_ref_required");
  }
  const entry = manifest.stacks.find(
    (candidate) => candidate.headRef === headRef
  );
  if (args["print-parent-ref"]) {
    if (entry) process.stdout.write(entry.parentRef);
    return 0;
  }
  const evidence = args["evidence-file"]
    ? extractStackEvidence(readFileSync(args["evidence-file"], "utf8"))
    : null;
  const result = checkStackTopology({
    repo: resolve(args.repo ?? process.cwd()),
    manifest,
    headRef,
    headRevision: args["head-revision"] ?? "HEAD",
    parentRevision: args["parent-revision"],
    evidence,
    requireEvidence: !args["skip-evidence"],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.status === "fail" ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runCli();
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
