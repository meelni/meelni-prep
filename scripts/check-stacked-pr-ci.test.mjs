import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const adapter = join(repositoryRoot, "scripts/check-stacked-pr-ci.mjs");

function git(repo, ...args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function commit(repo, message) {
  git(repo, "commit", "--allow-empty", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "meelni-stack-adapter-"));
  const repo = join(root, "checkout");
  const remote = join(root, "origin.git");
  mkdirSync(repo);
  git(repo, "init", "--initial-branch=main");
  git(repo, "config", "user.email", "stack-test@example.invalid");
  git(repo, "config", "user.name", "Stack Test");
  commit(repo, "root");
  git(repo, "switch", "-c", "parent");
  const parent = commit(repo, "parent");
  git(repo, "switch", "-c", "child");
  const head = commit(repo, "child");
  execFileSync("git", ["init", "--bare", remote]);
  git(repo, "remote", "add", "origin", remote);
  git(repo, "push", "origin", "parent:refs/heads/parent");
  git(repo, "push", "origin", `child:refs/pull/999/head`);
  mkdirSync(join(repo, ".github"));
  writeFileSync(
    join(repo, ".github/stacked-prs.json"),
    `${JSON.stringify(
      {
        version: 1,
        repository: "saviii/meelni-prep",
        stacks: [
          {
            pr: 999,
            headRef: "child",
            parentRef: "parent",
            expectedParentHead: parent,
          },
        ],
      },
      null,
      2
    )}\n`
  );
  return { root, repo, remote, parent, head };
}

function event(state, overrides = {}) {
  const pullRequest = {
    number: 999,
    body: `<!-- meelni-stack-evidence\n${JSON.stringify({
      version: 1,
      headRef: "child",
      parentRef: "parent",
      head: state.head,
      parentHead: state.parent,
      mergeBase: state.parent,
    })}\n-->`,
    head: {
      ref: "child",
      sha: state.head,
      repo: { full_name: "saviii/meelni-prep" },
    },
    base: { ref: "parent" },
    ...overrides.pull_request,
  };
  return {
    number: pullRequest.number,
    repository: {
      full_name: "saviii/meelni-prep",
      default_branch: "main",
    },
    pull_request: pullRequest,
    ...overrides,
  };
}

function run(state, payload, eventName = "pull_request_target") {
  const eventPath = join(state.repo, "event.json");
  writeFileSync(eventPath, JSON.stringify(payload));
  return spawnSync(process.execPath, [adapter], {
    cwd: state.repo,
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: eventName,
      GITHUB_EVENT_PATH: eventPath,
    },
    encoding: "utf8",
  });
}

test("the trusted adapter fetches the exact PR and parent refs from a bare origin", (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  const result = run(state, event(state));
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout.slice(result.stdout.indexOf("{")));
  assert.equal(output.status, "pass");
  assert.equal(output.head, state.head);
  assert.equal(output.actualParentHead, state.parent);
});

test("a synthetic push event fails closed instead of executing an untrusted branch adapter", (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  const result = run(state, { ref: "refs/heads/child" }, "push");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stack_gate_requires_pull_request_target/);
});

test("a fork branch-name collision targeting main remains unrelated", (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  const payload = event(state);
  payload.number = 123;
  payload.pull_request.number = 123;
  payload.pull_request.head.repo.full_name = "contributor/meelni-prep";
  payload.pull_request.base.ref = "main";
  const result = run(state, payload);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"status": "not_stacked"/);
});

test("a same-repository PR cannot consume another PR number's declaration", (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  const payload = event(state);
  payload.number = 998;
  payload.pull_request.number = 998;
  const result = run(state, payload);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /github_pr_differs_from_manifest_entry/);
});

test("malformed event JSON and malformed evidence fail closed", (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  const eventPath = join(state.repo, "event.json");
  writeFileSync(eventPath, "{not json");
  let result = spawnSync(process.execPath, [adapter], {
    cwd: state.repo,
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "pull_request_target",
      GITHUB_EVENT_PATH: eventPath,
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);

  const payload = event(state);
  payload.pull_request.body = "<!-- meelni-stack-evidence\n{not json\n-->";
  result = run(state, payload);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unexpected token|property name/i);
});

test("the authoritative workflow checks out default-branch code and never PR code", () => {
  const workflow = readFileSync(
    join(repositoryRoot, ".github/workflows/stack-topology.yml"),
    "utf8"
  );
  const generalCi = readFileSync(
    join(repositoryRoot, ".github/workflows/ci.yml"),
    "utf8"
  );
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /persist-credentials: true/);
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/
  );
  assert.match(workflow, /run: node scripts\/check-stacked-pr-ci\.mjs/);
  assert.doesNotMatch(workflow, /pull_request\.head\.sha/);
  assert.doesNotMatch(workflow, /checkout[^]*pull_request\.head/);
  assert.doesNotMatch(generalCi, /check:stack:ci/);
});
