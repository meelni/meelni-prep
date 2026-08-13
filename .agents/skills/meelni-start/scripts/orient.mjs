#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = resolve(dirname(scriptPath), "../../../..");
const repoRoot = resolve(process.argv[2] ?? defaultRepoRoot);
const OUTPUT_MAX_BYTES = 8_192;
const TEXT_LIMITS = Object.freeze({
  branch: 160,
  changedPath: 256,
  openSpecChange: 128,
  decisionTitle: 160,
  decisionPath: 240,
  decisionSummary: 320,
  skillName: 128,
});

for (const required of [
  "AGENTS.md",
  ".agents/skills",
  "docs/decisions/current.md",
]) {
  if (!existsSync(resolve(repoRoot, required))) {
    throw new Error(`not_a_meelni_repository:${required}`);
  }
}

const head = git(["rev-parse", "HEAD"]);
const branchSource = git(["branch", "--show-current"]);
const branch = branchSource
  ? boundedText(branchSource, TEXT_LIMITS.branch)
  : { value: null, truncated: false };
const originMain = optionalGit(["rev-parse", "origin/main"]);
const statusLines = gitRaw(["status", "--porcelain=v1"])
  .split("\n")
  .filter(Boolean);
const changedPaths = statusLines.map((line) => line.slice(3));
const [behind, ahead] = originMain
  ? (optionalGit(["rev-list", "--left-right", "--count", "origin/main...HEAD"])
      ?.split(/\s+/)
      .map(Number) ?? [null, null])
  : [null, null];

const skillsRoot = resolve(repoRoot, ".agents/skills");
const skills = readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => readSkill(resolve(skillsRoot, entry.name, "SKILL.md")))
  .filter(Boolean)
  .sort((left, right) => left.name.localeCompare(right.name));

const decisions = readFileSync(
  resolve(repoRoot, "docs/decisions/current.md"),
  "utf8"
)
  .split("\n")
  .flatMap((line) => {
    const match = line.match(/^- \[([^\]]+)\]\(([^)]+)\):\s*(.+)$/);
    return match
      ? [
          {
            title: match[1],
            path: `docs/decisions/${match[2]}`,
            summary: match[3],
          },
        ]
      : [];
  });

const openSpecRoot = resolve(repoRoot, "openspec/changes");
const activeOpenSpecChanges = existsSync(openSpecRoot)
  ? readdirSync(openSpecRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "archive")
      .map((entry) => entry.name)
      .sort()
  : [];

const output = {
  contract: "meelni.start-orientation.v1",
  repository: {
    head,
    branch: branch.value,
    branchTruncated: branch.truncated,
    detached: branch.value === null,
    originMain,
    aheadOfOriginMain: ahead,
    behindOriginMain: behind,
    clean: statusLines.length === 0,
    changedPaths: boundedList(changedPaths, 32, (path) =>
      boundedText(path, TEXT_LIMITS.changedPath)
    ),
  },
  productTruth: {
    category: "live PM interview practice",
    primaryUser: "PM candidates actively preparing for interviews",
    primaryLoop:
      "question discovery -> live mock interview -> grounded feedback -> focused next practice",
    sources: [".claude/PRD.md", "docs/decisions/current.md"],
  },
  activeOpenSpecChanges: boundedList(activeOpenSpecChanges, 24, (change) =>
    boundedText(change, TEXT_LIMITS.openSpecChange)
  ),
  currentDecisions: boundedList(decisions, 12, (decision) => {
    const title = boundedText(decision.title, TEXT_LIMITS.decisionTitle);
    const path = boundedText(decision.path, TEXT_LIMITS.decisionPath);
    const summary = boundedText(decision.summary, TEXT_LIMITS.decisionSummary);
    return {
      value: {
        title: title.value,
        path: path.value,
        summary: summary.value,
      },
      truncated: title.truncated || path.truncated || summary.truncated,
    };
  }),
  skills: boundedList(
    skills.map(({ name }) => name),
    32,
    (name) => boundedText(name, TEXT_LIMITS.skillName)
  ),
  requiredIntake: "docs/templates/AGENT_TASK_INTAKE.md",
  serialization: {
    maxBytes: OUTPUT_MAX_BYTES,
    truncated: false,
  },
};

process.stdout.write(serializeWithinBudget(output));

function git(args) {
  const result = spawnSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`git_orientation_failed:${args[0]}`);
  }
  return result.stdout.trim();
}

function gitRaw(args) {
  const result = spawnSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`git_orientation_failed:${args[0]}`);
  }
  return result.stdout;
}

function optionalGit(args) {
  const result = spawnSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function readSkill(path) {
  if (!existsSync(path)) return null;
  const source = readFileSync(path, "utf8");
  const match = source.match(
    /^---\n[\s\S]*?^name:\s*["']?([^\n"']+)["']?\s*$[\s\S]*?^description:\s*["']?([^\n"']+)["']?\s*$[\s\S]*?^---$/m
  );
  return match ? { name: match[1].trim(), description: match[2].trim() } : null;
}

function boundedList(
  items,
  limit,
  normalize = (value) => ({
    value,
    truncated: false,
  })
) {
  const normalized = items.slice(0, limit).map(normalize);
  return {
    count: items.length,
    items: normalized.map(({ value }) => value),
    truncated:
      items.length > limit || normalized.some(({ truncated }) => truncated),
    valuesTruncated: normalized.filter(({ truncated }) => truncated).length,
  };
}

function boundedText(value, maxBytes) {
  const source = String(value);
  if (Buffer.byteLength(source) <= maxBytes) {
    return { value: source, truncated: false };
  }

  const suffix = "…";
  const suffixBytes = Buffer.byteLength(suffix);
  let result = "";
  let resultBytes = 0;
  for (const character of source) {
    const characterBytes = Buffer.byteLength(character);
    if (resultBytes + characterBytes + suffixBytes > maxBytes) break;
    result += character;
    resultBytes += characterBytes;
  }
  return { value: `${result}${suffix}`, truncated: true };
}

function serializeWithinBudget(value) {
  const lists = [
    value.repository.changedPaths,
    value.activeOpenSpecChanges,
    value.currentDecisions,
    value.skills,
  ];
  value.serialization.truncated =
    value.repository.branchTruncated ||
    lists.some(({ truncated }) => truncated);

  let serialized = `${JSON.stringify(value, null, 2)}\n`;
  while (Buffer.byteLength(serialized) > OUTPUT_MAX_BYTES) {
    const candidate = lists
      .filter(({ items }) => items.length > 0)
      .map((list, index) => ({
        list,
        index,
        bytes: Buffer.byteLength(JSON.stringify(list.items.at(-1))),
      }))
      .sort(
        (left, right) => right.bytes - left.bytes || left.index - right.index
      )[0];

    if (!candidate) {
      throw new Error("orientation_output_budget_unachievable");
    }

    candidate.list.items.pop();
    candidate.list.truncated = true;
    value.serialization.truncated = true;
    serialized = `${JSON.stringify(value, null, 2)}\n`;
  }

  return serialized;
}
