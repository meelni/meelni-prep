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

import {
  runStackCiAndPublish,
  STACK_TOPOLOGY_CHECK_NAME,
} from "./check-stacked-pr-ci.mjs";
import {
  classifyRevalidationOutcome,
  revalidateAffectedStacksForEvent,
  revalidateRegisteredStacks,
} from "./revalidate-stacked-prs-ci.mjs";

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
        version: 2,
        repository: "meelni/meelni-prep",
        stacks: [
          {
            pr: 999,
            parentPr: 998,
            headRef: "child",
            parentRef: "parent",
          },
        ],
      },
      null,
      2
    )}\n`
  );
  return { root, repo, remote, parent, head };
}

function githubApiFor(state, overrides = {}) {
  return async ({ path }) => {
    const number = Number(path.split("/").at(-1));
    if (number === 999) {
      const head = git(
        state.repo,
        "ls-remote",
        state.remote,
        "refs/pull/999/head"
      ).split(/\s+/)[0];
      return {
        number: 999,
        state: "open",
        body: event(state).pull_request.body,
        head: {
          ref: "child",
          sha: head,
          repo: { full_name: "meelni/meelni-prep" },
        },
        base: { ref: "parent" },
        ...overrides.child,
      };
    }
    if (number === 998) {
      const parent = git(
        state.repo,
        "ls-remote",
        state.remote,
        "refs/heads/parent"
      ).split(/\s+/)[0];
      return {
        number: 998,
        state: "open",
        head: {
          ref: "parent",
          sha: parent,
          repo: { full_name: "meelni/meelni-prep" },
        },
        base: { ref: "main" },
        ...overrides.parent,
      };
    }
    if (overrides.other) return overrides.other(number);
    throw Object.assign(new Error("stack_gate_github_api_failed:404"), {
      status: 404,
    });
  };
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
      repo: { full_name: "meelni/meelni-prep" },
    },
    base: { ref: "parent" },
    ...overrides.pull_request,
  };
  return {
    number: pullRequest.number,
    repository: {
      full_name: "meelni/meelni-prep",
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

function checkApi(calls, responses = [{ id: 101 }, {}]) {
  return async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const payload = responses.shift();
    if (payload instanceof Error) {
      return {
        ok: false,
        status: 503,
        async json() {
          return {};
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return payload;
      },
    };
  };
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

test("the trusted publisher binds in-progress and success to the exact PR head", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  const calls = [];
  const result = await runStackCiAndPublish({
    eventContent: JSON.stringify(event(state)),
    env: { GITHUB_TOKEN: "token" },
    repo: state.repo,
    manifestPath: join(state.repo, ".github/stacked-prs.json"),
    fetchImpl: checkApi(calls),
    api: githubApiFor(state),
  });

  assert.equal(result.status, "pass");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body, {
    name: STACK_TOPOLOGY_CHECK_NAME,
    head_sha: state.head,
    status: "in_progress",
    started_at: calls[0].body.started_at,
    output: calls[0].body.output,
  });
  assert.equal(calls[1].body.status, "completed");
  assert.equal(calls[1].body.conclusion, "success");
  assert.match(calls[1].url, /check-runs\/101$/);
});

test("a moved parent supersedes a prior green head check with failure", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  git(state.repo, "switch", "parent");
  commit(state.repo, "parent moved");
  git(state.repo, "push", "--force", "origin", "parent:refs/heads/parent");

  const calls = [];
  const result = await runStackCiAndPublish({
    eventContent: JSON.stringify(event(state)),
    env: { GITHUB_TOKEN: "token" },
    repo: state.repo,
    manifestPath: join(state.repo, ".github/stacked-prs.json"),
    fetchImpl: checkApi(calls),
    api: githubApiFor(state),
  });

  assert.equal(result.status, "fail");
  assert.equal(calls[0].body.head_sha, state.head);
  assert.equal(calls[1].body.conclusion, "failure");
  assert.match(
    calls[1].body.output.summary,
    /head_does_not_contain_current_parent/
  );
});

test("a parent that moves after the initial fetch cannot publish success", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  const calls = [];

  const result = await runStackCiAndPublish({
    eventContent: JSON.stringify(event(state)),
    env: { GITHUB_TOKEN: "token" },
    repo: state.repo,
    manifestPath: join(state.repo, ".github/stacked-prs.json"),
    fetchImpl: checkApi(calls),
    api: githubApiFor(state),
    beforeFreshnessBarrier: async () => {
      git(state.repo, "switch", "parent");
      commit(state.repo, "parent moved during publication");
      git(state.repo, "push", "--force", "origin", "parent:refs/heads/parent");
    },
  });

  assert.equal(result.status, "fail");
  assert.ok(result.errors.includes("parent_moved_during_verification"));
  assert.equal(calls[1].body.conclusion, "failure");
  assert.match(
    calls[1].body.output.summary,
    /parent_moved_during_verification/
  );
});

test("a child that moves after the initial fetch cannot publish success", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  const calls = [];

  const result = await runStackCiAndPublish({
    eventContent: JSON.stringify(event(state)),
    env: { GITHUB_TOKEN: "token" },
    repo: state.repo,
    manifestPath: join(state.repo, ".github/stacked-prs.json"),
    fetchImpl: checkApi(calls),
    api: githubApiFor(state),
    beforeFreshnessBarrier: async () => {
      git(state.repo, "switch", "child");
      commit(state.repo, "child moved during publication");
      git(state.repo, "push", "--force", "origin", "child:refs/pull/999/head");
    },
  });

  assert.equal(result.status, "fail");
  assert.ok(result.errors.includes("child_moved_during_verification"));
  assert.equal(calls[1].body.conclusion, "failure");
});

test("an initially failing child repaired during the barrier cannot pass its old-head check", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  git(state.repo, "switch", "parent");
  commit(state.repo, "parent moved before verification");
  git(state.repo, "push", "--force", "origin", "parent:refs/heads/parent");
  const baseApi = githubApiFor(state);
  const api = async (input) => {
    const pullRequest = await baseApi(input);
    if (!input.path.endsWith("/999")) return pullRequest;
    const head = pullRequest.head.sha;
    const parentHead = (await baseApi({ ...input, path: "/pulls/998" })).head
      .sha;
    return {
      ...pullRequest,
      body: `<!-- meelni-stack-evidence\n${JSON.stringify({
        version: 1,
        headRef: "child",
        parentRef: "parent",
        head,
        parentHead,
        mergeBase: parentHead,
      })}\n-->`,
    };
  };
  const calls = [];
  const result = await runStackCiAndPublish({
    eventContent: JSON.stringify(event(state)),
    env: { GITHUB_TOKEN: "token" },
    repo: state.repo,
    manifestPath: join(state.repo, ".github/stacked-prs.json"),
    fetchImpl: checkApi(calls),
    api,
    beforeFreshnessBarrier: async () => {
      git(state.repo, "switch", "child");
      git(state.repo, "merge", "--no-edit", "parent");
      git(state.repo, "push", "--force", "origin", "child:refs/pull/999/head");
    },
  });
  assert.equal(result.status, "fail");
  assert.equal(result.head, state.head);
  assert.ok(result.errors.includes("child_moved_during_verification"));
  assert.ok(result.errors.includes("topology_changed_during_verification"));
  assert.equal(calls[0].body.head_sha, state.head);
  assert.equal(calls[1].body.conclusion, "failure");
});

test("unrelated main PRs receive an explicit successful head-bound result", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  const payload = event(state);
  payload.number = 123;
  payload.pull_request.number = 123;
  payload.pull_request.head.ref = "fork-feature";
  payload.pull_request.head.repo.full_name = "contributor/meelni-prep";
  payload.pull_request.base.ref = "main";
  const calls = [];

  const result = await runStackCiAndPublish({
    eventContent: JSON.stringify(payload),
    env: { GITHUB_TOKEN: "token" },
    repo: state.repo,
    fetchImpl: checkApi(calls),
    api: githubApiFor(state, {
      other: () => ({
        number: 123,
        state: "open",
        head: {
          ref: "fork-feature",
          sha: state.head,
          repo: { full_name: "contributor/meelni-prep" },
        },
        base: { ref: "main" },
      }),
    }),
  });

  assert.equal(result.status, "not_stacked");
  assert.equal(calls[0].body.head_sha, state.head);
  assert.equal(calls[1].body.conclusion, "success");
  assert.equal(
    calls[1].body.output.title,
    "PR is not a registered stack child"
  );
  assert.equal(
    calls[1].body.output.summary,
    "This exact PR head is not a registered stack child."
  );
});

test("an undeclared non-default PR fails the triggering stable context", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  const payload = event(state);
  payload.number = 123;
  payload.pull_request.number = 123;
  const calls = [];
  const result = await runStackCiAndPublish({
    eventContent: JSON.stringify(payload),
    env: { GITHUB_TOKEN: "token" },
    repo: state.repo,
    fetchImpl: checkApi(calls),
    api: githubApiFor(state, {
      other: () => ({
        number: 123,
        state: "open",
        head: {
          ref: "undeclared-child",
          sha: state.head,
          repo: { full_name: "meelni/meelni-prep" },
        },
        base: { ref: "parent" },
      }),
    }),
  });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.errors, ["stack_relationship_missing_from_manifest"]);
  assert.equal(
    classifyRevalidationOutcome({
      results: [result],
      triggerPr: 123,
      manifest: { version: 2, repository: "meelni/meelni-prep", stacks: [] },
    }),
    "fail"
  );
});

test("check API creation and completion failures fail closed", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  await assert.rejects(
    runStackCiAndPublish({
      eventContent: JSON.stringify(event(state)),
      env: { GITHUB_TOKEN: "token" },
      repo: state.repo,
      manifestPath: join(state.repo, ".github/stacked-prs.json"),
      fetchImpl: checkApi([], [new Error("unavailable")]),
      api: githubApiFor(state),
    }),
    /stack_gate_github_api_failed:503/
  );
  await assert.rejects(
    runStackCiAndPublish({
      eventContent: JSON.stringify(event(state)),
      env: { GITHUB_TOKEN: "token" },
      repo: state.repo,
      manifestPath: join(state.repo, ".github/stacked-prs.json"),
      fetchImpl: checkApi(
        [],
        [{ id: 102 }, new Error("unavailable"), new Error("unavailable")]
      ),
      api: githubApiFor(state),
    }),
    /stack_gate_github_api_failed:503/
  );
});

test("trusted publication ignores forged event metadata and resolves PR state server-side", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  const payload = event(state);
  payload.pull_request.head.sha = "f".repeat(40);
  payload.pull_request.head.repo.full_name = "attacker/fork";
  payload.pull_request.base.ref = "main";
  payload.pull_request.body = "forged";
  const calls = [];
  const result = await runStackCiAndPublish({
    eventContent: JSON.stringify(payload),
    env: { GITHUB_TOKEN: "token" },
    repo: state.repo,
    manifestPath: join(state.repo, ".github/stacked-prs.json"),
    fetchImpl: checkApi(calls),
    api: githubApiFor(state),
  });
  assert.equal(result.status, "pass");
  assert.equal(calls[0].body.head_sha, state.head);
});

test("wrong child repository and base are topology failures on the child check", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  for (const [child, expected] of [
    [
      {
        head: {
          ref: "child",
          sha: state.head,
          repo: { full_name: "attacker/fork" },
        },
      },
      "stacked_pr_must_originate_from_manifest_repository",
    ],
    [{ base: { ref: "main" } }, "github_base_differs_from_declared_parent"],
  ]) {
    const calls = [];
    const result = await runStackCiAndPublish({
      eventContent: JSON.stringify(event(state)),
      env: { GITHUB_TOKEN: "token" },
      repo: state.repo,
      manifestPath: join(state.repo, ".github/stacked-prs.json"),
      fetchImpl: checkApi(calls),
      api: githubApiFor(state, { child }),
    });
    assert.equal(result.status, "fail");
    assert.ok(result.errors.includes(expected));
    assert.equal(calls[1].body.conclusion, "failure");
  }
});

test("missing parent PR is topology invalidity, not an API infrastructure error", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  const api = githubApiFor(state);
  const calls = [];
  const result = await runStackCiAndPublish({
    eventContent: JSON.stringify(event(state)),
    env: { GITHUB_TOKEN: "token" },
    repo: state.repo,
    manifestPath: join(state.repo, ".github/stacked-prs.json"),
    fetchImpl: checkApi(calls),
    api: async (input) => {
      if (input.path.endsWith("/998")) {
        throw Object.assign(new Error("stack_gate_github_api_failed:404"), {
          status: 404,
        });
      }
      return api(input);
    },
  });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.errors, ["parent_pr_missing"]);
});

test("closed, wrong-repository, and wrong-ref parents fail through the real publisher", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  for (const [parent, expected] of [
    [{ state: "closed" }, "parent_pr_not_open"],
    [
      {
        head: {
          ref: "parent",
          sha: state.parent,
          repo: { full_name: "attacker/fork" },
        },
      },
      "parent_pr_must_originate_from_manifest_repository",
    ],
    [
      {
        head: {
          ref: "different-parent",
          sha: state.parent,
          repo: { full_name: "meelni/meelni-prep" },
        },
      },
      "parent_head_differs_from_manifest_entry",
    ],
  ]) {
    const calls = [];
    const result = await runStackCiAndPublish({
      eventContent: JSON.stringify(event(state)),
      env: { GITHUB_TOKEN: "token" },
      repo: state.repo,
      manifestPath: join(state.repo, ".github/stacked-prs.json"),
      fetchImpl: checkApi(calls),
      api: githubApiFor(state, { parent }),
    });
    assert.equal(result.status, "fail");
    assert.ok(result.errors.includes(expected));
    assert.equal(calls[1].body.conclusion, "failure");
  }
});

test("a deleted child pull ref is a topology failure on the known child head", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  git(state.repo, "push", "origin", ":refs/pull/999/head");
  const calls = [];
  const result = await runStackCiAndPublish({
    eventContent: JSON.stringify(event(state)),
    env: { GITHUB_TOKEN: "token" },
    repo: state.repo,
    manifestPath: join(state.repo, ".github/stacked-prs.json"),
    fetchImpl: checkApi(calls),
    api: async ({ path }) => {
      if (path.endsWith("/999"))
        return { ...event(state).pull_request, state: "open" };
      return githubApiFor(state)({ path });
    },
  });
  assert.equal(result.status, "fail");
  assert.ok(result.errors.includes("child_ref_missing"));
  assert.equal(calls[0].body.head_sha, state.head);
});

test("git transport failure remains infrastructure error and fails every mode", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  const manifest = JSON.parse(
    readFileSync(join(state.repo, ".github/stacked-prs.json"), "utf8")
  );
  const results = await revalidateRegisteredStacks({
    env: { GITHUB_TOKEN: "token" },
    repo: state.repo,
    remote: join(state.root, "unreachable-origin.git"),
    manifest,
    manifestPath: join(state.repo, ".github/stacked-prs.json"),
    api: githubApiFor(state),
    fetchImpl: checkApi([]),
  });
  assert.equal(results[0].status, "error");
  assert.equal(classifyRevalidationOutcome({ results, manifest }), "error");
});

test("stable outcome fails only for the triggering child or infrastructure errors", () => {
  const manifest = {
    version: 2,
    repository: "meelni/meelni-prep",
    stacks: [{ pr: 10, parentPr: 9, headRef: "child", parentRef: "parent" }],
  };
  assert.equal(
    classifyRevalidationOutcome({
      results: [{ status: "fail", pr: 10 }],
      triggerPr: 9,
      manifest,
    }),
    "success"
  );
  assert.equal(
    classifyRevalidationOutcome({
      results: [{ status: "fail", pr: 10 }],
      triggerPr: 10,
      manifest,
    }),
    "fail"
  );
  assert.equal(
    classifyRevalidationOutcome({
      results: [{ status: "error", pr: 10 }],
      triggerPr: 9,
      manifest,
    }),
    "error"
  );
  assert.equal(
    classifyRevalidationOutcome({
      results: [{ status: "fail", pr: 10 }],
      manifest,
    }),
    "success"
  );
});

test("scheduled revalidation is not capped at one GitHub page", async () => {
  const stacks = Array.from({ length: 65 }, (_, index) => ({
    pr: index + 100,
    parentPr: 99,
    headRef: `child-${index}`,
    parentRef: "parent",
  }));
  const manifest = { version: 2, repository: "meelni/meelni-prep", stacks };
  const results = await revalidateRegisteredStacks({
    manifest,
    api: async ({ path }) => {
      const number = Number(path.split("/").at(-1));
      return {
        number,
        state: "open",
        body: "",
        head: {
          ref: `child-${number - 100}`,
          sha: "a".repeat(40),
          repo: { full_name: manifest.repository },
        },
        base: { ref: "parent" },
      };
    },
    verifyAndPublish: async ({ eventContent }) => ({
      status: "pass",
      pr: JSON.parse(eventContent).pull_request.number,
      errors: [],
    }),
  });
  assert.equal(results.length, 65);
  assert.equal(results.at(-1).pr, 164);
});

test("scheduled revalidation fans out from the trusted current manifest", async () => {
  const manifest = {
    version: 2,
    repository: "meelni/meelni-prep",
    stacks: [
      {
        pr: 10,
        parentPr: 9,
        headRef: "child-a",
        parentRef: "parent",
      },
      {
        pr: 11,
        parentPr: 9,
        headRef: "child-b",
        parentRef: "parent",
      },
    ],
  };
  const published = [];
  const results = await revalidateRegisteredStacks({
    env: { GITHUB_TOKEN: "token", GITHUB_DEFAULT_BRANCH: "main" },
    manifest,
    api: async ({ path }) => ({
      number: Number(path.split("/").at(-1)),
      state: path.endsWith("/10") ? "open" : "closed",
      body: "evidence",
      head: {
        ref: "child-a",
        sha: "c".repeat(40),
        repo: { full_name: manifest.repository },
      },
      base: { ref: "parent" },
    }),
    verifyAndPublish: async (input) => {
      published.push(JSON.parse(input.eventContent));
      return {
        status: "fail",
        errors: ["head_does_not_contain_current_parent"],
      };
    },
  });

  assert.equal(published.length, 1);
  assert.equal(published[0].pull_request.number, 10);
  assert.deepEqual(results, [
    { status: "fail", errors: ["head_does_not_contain_current_parent"] },
  ]);
});

test("a same-repository parent event revalidates itself and every open registered child", async () => {
  const manifest = {
    version: 2,
    repository: "meelni/meelni-prep",
    stacks: [
      {
        pr: 999,
        parentPr: 888,
        headRef: "child",
        parentRef: "parent",
      },
      {
        pr: 1000,
        parentPr: 888,
        headRef: "closed-child",
        parentRef: "parent",
      },
      {
        pr: 1001,
        parentPr: 887,
        headRef: "other-child",
        parentRef: "other-parent",
      },
    ],
  };
  const parentEvent = {
    repository: { full_name: manifest.repository, default_branch: "main" },
    pull_request: {
      number: 888,
      head: {
        ref: "parent",
        sha: "a".repeat(40),
        repo: { full_name: manifest.repository },
      },
      base: { ref: "main" },
    },
  };
  const published = [];

  const results = await revalidateAffectedStacksForEvent({
    eventContent: JSON.stringify(parentEvent),
    env: { GITHUB_TOKEN: "token", GITHUB_DEFAULT_BRANCH: "main" },
    manifest,
    api: async ({ path }) => {
      const number = Number(path.split("/").at(-1));
      return {
        number,
        state: number === 1000 ? "closed" : "open",
        body: number === 999 ? "child evidence" : "parent body",
        head: {
          ref: number === 999 ? "child" : "parent",
          sha: number === 999 ? "c".repeat(40) : "a".repeat(40),
          repo: { full_name: manifest.repository },
        },
        base: { ref: number === 999 ? "parent" : "main" },
      };
    },
    verifyAndPublish: async ({ eventContent }) => {
      const payload = JSON.parse(eventContent);
      published.push(payload.pull_request.number);
      return {
        status:
          payload.pull_request.number === parentEvent.pull_request.number
            ? "not_stacked"
            : "pass",
        errors: [],
      };
    },
  });

  assert.deepEqual(published, [888, 999]);
  assert.deepEqual(
    results.map((result) => result.status),
    ["not_stacked", "pass"]
  );
});

test("a closed parent event still refreshes every open registered child", async () => {
  const manifest = {
    version: 2,
    repository: "meelni/meelni-prep",
    stacks: [
      {
        pr: 999,
        parentPr: 888,
        headRef: "child",
        parentRef: "parent",
      },
    ],
  };
  const published = [];
  const results = await revalidateAffectedStacksForEvent({
    eventContent: JSON.stringify({
      action: "closed",
      repository: { full_name: manifest.repository, default_branch: "main" },
      pull_request: {
        number: 888,
        head: {
          ref: "parent",
          sha: "a".repeat(40),
          repo: { full_name: manifest.repository },
        },
        base: { ref: "main" },
      },
    }),
    env: { GITHUB_TOKEN: "token", GITHUB_DEFAULT_BRANCH: "main" },
    manifest,
    api: async ({ path }) => {
      const number = Number(path.split("/").at(-1));
      return {
        number,
        state: number === 888 ? "closed" : "open",
        body: "evidence",
        head: {
          ref: number === 888 ? "parent" : "child",
          sha: number === 888 ? "a".repeat(40) : "c".repeat(40),
          repo: { full_name: manifest.repository },
        },
        base: { ref: number === 888 ? "main" : "parent" },
      };
    },
    verifyAndPublish: async ({ eventContent }) => {
      const payload = JSON.parse(eventContent);
      published.push(payload.pull_request.number);
      return { status: "fail", errors: ["parent_pr_closed"] };
    },
  });

  assert.deepEqual(published, [999]);
  assert.deepEqual(results, [{ status: "fail", errors: ["parent_pr_closed"] }]);
});

test("a closed event fails an open child when the parent branch was deleted", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  git(state.repo, "push", "origin", "--delete", "parent");
  const calls = [];

  const results = await revalidateAffectedStacksForEvent({
    eventContent: JSON.stringify({
      action: "closed",
      repository: {
        full_name: "meelni/meelni-prep",
        default_branch: "main",
      },
      pull_request: {
        number: 888,
        head: {
          ref: "parent",
          sha: state.parent,
          repo: { full_name: "meelni/meelni-prep" },
        },
        base: { ref: "main" },
      },
    }),
    env: { GITHUB_TOKEN: "token", GITHUB_DEFAULT_BRANCH: "main" },
    repo: state.repo,
    manifest: JSON.parse(
      readFileSync(join(state.repo, ".github/stacked-prs.json"), "utf8")
    ),
    manifestPath: join(state.repo, ".github/stacked-prs.json"),
    api: async ({ path }) => {
      if (path.endsWith("/888")) return { state: "closed" };
      if (path.endsWith("/998")) {
        return {
          number: 998,
          state: "open",
          head: {
            ref: "parent",
            sha: state.parent,
            repo: { full_name: "meelni/meelni-prep" },
          },
          base: { ref: "main" },
        };
      }
      return { ...event(state).pull_request, state: "open" };
    },
    fetchImpl: checkApi(calls),
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].status, "fail");
  assert.ok(results[0].errors.includes("parent_ref_missing"));
  assert.equal(results[0].pr, 999);
  assert.equal(calls[0].body.head_sha, state.head);
  assert.equal(calls[1].body.conclusion, "failure");
});

test("scheduled revalidation replaces stale success after parent movement", async (t) => {
  const state = fixture();
  t.after(() => rmSync(state.root, { recursive: true, force: true }));
  git(state.repo, "switch", "parent");
  commit(state.repo, "scheduled parent movement");
  git(state.repo, "push", "--force", "origin", "parent:refs/heads/parent");
  const calls = [];

  const results = await revalidateRegisteredStacks({
    env: { GITHUB_TOKEN: "token", GITHUB_DEFAULT_BRANCH: "main" },
    repo: state.repo,
    manifest: JSON.parse(
      readFileSync(join(state.repo, ".github/stacked-prs.json"), "utf8")
    ),
    manifestPath: join(state.repo, ".github/stacked-prs.json"),
    api: githubApiFor(state),
    fetchImpl: checkApi(calls),
  });

  assert.equal(results[0].status, "fail");
  assert.equal(calls[0].body.head_sha, state.head);
  assert.equal(calls[1].body.conclusion, "failure");
  assert.match(
    calls[1].body.output.summary,
    /head_does_not_contain_current_parent/
  );
});

test("scheduled revalidation records API failure and continues to later PRs", async () => {
  const manifest = {
    version: 2,
    repository: "meelni/meelni-prep",
    stacks: [
      {
        pr: 20,
        parentPr: 19,
        headRef: "child-a",
        parentRef: "parent",
      },
      {
        pr: 21,
        parentPr: 19,
        headRef: "child-b",
        parentRef: "parent",
      },
    ],
  };
  const published = [];
  const results = await revalidateRegisteredStacks({
    env: { GITHUB_TOKEN: "token" },
    manifest,
    api: async ({ path }) => {
      if (path.endsWith("/20")) throw new Error("github_pr_read_failed");
      return {
        number: 21,
        state: "open",
        body: "evidence",
        head: {
          ref: "child-b",
          sha: "c".repeat(40),
          repo: { full_name: manifest.repository },
        },
        base: { ref: "parent" },
      };
    },
    verifyAndPublish: async (input) => {
      published.push(input);
      return { status: "pass", errors: [] };
    },
  });

  assert.deepEqual(results[0], {
    status: "error",
    pr: 20,
    errors: ["github_pr_read_failed"],
  });
  assert.equal(results[1].status, "pass");
  assert.equal(published.length, 1);
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
  assert.match(
    workflow,
    /verify-stack:[^]*?permissions:\n      contents: read\n      checks: write/
  );
  assert.match(workflow, /verify-stack:[^]*?name: Trusted Publisher/);
  assert.match(
    workflow,
    /verify-migrations:[^]*?permissions:\n      contents: read\n      checks: write\n      pull-requests: read/
  );
  assert.doesNotMatch(workflow, /\bschedule:/);
  assert.doesNotMatch(workflow, /\bcron:/);
  assert.match(workflow, /group: stack-topology-publisher/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /queue: max/);
  assert.match(workflow, /pull_request_target:[^]*types:[^]*closed/);
  assert.match(workflow, /push:[^]*branches: \[main\][^]*stacked-prs\.json/);
  assert.match(
    workflow,
    /verify-stack:[^]*?github\.event\.pull_request\.draft == false[^]*?github\.event\.changes\.body != null[^]*?github\.event\.changes\.base != null/
  );
  assert.match(
    workflow,
    /verify-migrations:[^]*?github\.event\.pull_request\.draft == false[^]*?github\.event\.changes\.base != null/
  );
  assert.match(
    workflow,
    /audit-draft-impact:[^]*?github\.event\.pull_request\.draft == true[^]*?github\.event\.action == 'synchronize'[^]*?github\.event\.changes\.base != null/
  );
  assert.match(
    workflow,
    /revalidate-all:[^]*?github\.event_name == 'workflow_dispatch' \|\| github\.event_name == 'push'/
  );
  assert.equal(workflow.match(/continue-on-error: true/g)?.length, 4);
  assert.match(
    workflow,
    /audit-draft-impact:[^]*?steps\.stack_audit\.outcome != 'success'[^]*?steps\.migration_audit\.outcome != 'success'/
  );
  assert.match(
    workflow,
    /revalidate-all:[^]*?steps\.stack_audit\.outcome != 'success'[^]*?steps\.migration_audit\.outcome != 'success'/
  );
  assert.match(workflow, /persist-credentials: true/);
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/
  );
  assert.match(
    workflow,
    /run: node scripts\/revalidate-stacked-prs-ci\.mjs --event-path "\$GITHUB_EVENT_PATH"/
  );
  assert.match(workflow, /run: node scripts\/revalidate-stacked-prs-ci\.mjs/);
  assert.doesNotMatch(workflow, /pull_request\.head\.sha/);
  assert.doesNotMatch(workflow, /checkout[^]*pull_request\.head/);
  assert.doesNotMatch(generalCi, /check:stack:ci/);
});
