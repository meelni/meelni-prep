import assert from "node:assert/strict";
import test from "node:test";

import {
  auditOpenMigrationPullRequests,
  buildMigrationResultSummary,
  inventoryOpenMigrationPullRequests,
  MIGRATION_COLLISION_CHECK_NAME,
  paginateGithubApi,
  publishMigrationResult,
} from "./check-migration-collisions-ci.mjs";

const repository = "meelni/meelni-prep";

function pullRequest(number, headRepository = repository) {
  return {
    number,
    state: "open",
    head: {
      sha: number.toString(16).padStart(40, "a").slice(-40),
      ref: `branch-${number}`,
      repo: { full_name: headRepository },
    },
    base: { ref: "main" },
  };
}

function checkApi(calls, { failCreate = false, failComplete = false } = {}) {
  let nextId = 100;
  return async (input) => {
    calls.push(input);
    if (input.path.startsWith("/commits/")) {
      return { total_count: 0, check_runs: [] };
    }
    const pullRequestMatch = input.path.match(/^\/pulls\/(\d+)$/);
    if (pullRequestMatch) return pullRequest(Number(pullRequestMatch[1]));
    if (input.path === "/check-runs") {
      if (failCreate) throw new Error("check_create_failed");
      nextId += 1;
      return { id: nextId };
    }
    if (input.path.startsWith("/check-runs/")) {
      if (failComplete) throw new Error("check_complete_failed");
      return {};
    }
    throw new Error(`unexpected_api_path:${input.path}`);
  };
}

test("GitHub pagination reads every page exactly once", async () => {
  const paths = [];
  const values = await paginateGithubApi({
    token: "token",
    repository,
    path: "/pulls?state=open",
    perPage: 2,
    api: async ({ path }) => {
      paths.push(path);
      if (path.endsWith("page=1")) return [{ id: 1 }, { id: 2 }];
      return [{ id: 3 }];
    },
  });
  assert.deepEqual(values, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.deepEqual(paths, [
    "/pulls?state=open&per_page=2&page=1",
    "/pulls?state=open&per_page=2&page=2",
  ]);
});

test("pagination fails closed on API, shape, and page-limit errors", async () => {
  await assert.rejects(
    paginateGithubApi({
      token: "token",
      repository,
      path: "/pulls",
      api: async () => {
        throw new Error("github_unavailable");
      },
    }),
    /github_unavailable/
  );
  await assert.rejects(
    paginateGithubApi({
      token: "token",
      repository,
      path: "/pulls",
      api: async () => ({}),
    }),
    /migration_collision_page_invalid/
  );
  await assert.rejects(
    paginateGithubApi({
      token: "token",
      repository,
      path: "/pulls",
      perPage: 1,
      maxPages: 2,
      api: async () => [{}],
    }),
    /migration_collision_pagination_limit_exceeded/
  );
});

test("inventory excludes forks but paginates every same-repository PR diff", async () => {
  const paths = [];
  const result = await inventoryOpenMigrationPullRequests({
    token: "token",
    repository,
    perPage: 2,
    api: async ({ path }) => {
      paths.push(path);
      if (path === "/pulls?state=open&per_page=2&page=1") {
        return [pullRequest(10), pullRequest(11, "contributor/fork")];
      }
      if (path === "/pulls?state=open&per_page=2&page=2") return [];
      if (path === "/pulls/10/files?per_page=2&page=1") {
        return [
          {
            filename: "lib/db/migrations/0008_first.sql",
            status: "added",
          },
          { filename: "app/page.tsx", status: "modified" },
        ];
      }
      if (path === "/pulls/10/files?per_page=2&page=2") return [];
      if (path === "/pulls/10") return pullRequest(10);
      throw new Error(`unexpected_path:${path}`);
    },
  });
  assert.deepEqual(
    result.pullRequests.map((pullRequest) => pullRequest.number),
    [10]
  );
  assert.deepEqual(
    result.inventories[0].migrations.map((migration) => migration.sequence),
    ["0008"]
  );
  assert.equal(result.errors.length, 0);
  assert.equal(
    paths.some((path) => path.includes("/pulls/11/files")),
    false
  );
});

test("inventory rejects a PR head that moves while its files are paginated", async () => {
  const initial = pullRequest(12);
  const moved = {
    ...initial,
    head: { ...initial.head, sha: "f".repeat(40) },
  };
  const result = await inventoryOpenMigrationPullRequests({
    token: "token",
    repository,
    api: async ({ path }) => {
      if (path.startsWith("/pulls?state=open")) return [initial];
      if (path.startsWith("/pulls/12/files")) return [];
      if (path === "/pulls/12") return moved;
      throw new Error(`unexpected_path:${path}`);
    },
  });
  assert.deepEqual(result.inventories, []);
  assert.deepEqual(result.errors, [
    { pr: 12, error: "migration_collision_pr_moved_during_inventory" },
  ]);
});

test("a final open-PR recheck failure retains known owners but marks the inventory incomplete", async () => {
  const owner = pullRequest(13);
  let pullListCalls = 0;
  const result = await inventoryOpenMigrationPullRequests({
    token: "token",
    repository,
    paginate: async ({ path }) => {
      if (path === "/pulls?state=open") {
        pullListCalls += 1;
        if (pullListCalls === 2) throw new Error("github_recheck_failed");
        return [owner];
      }
      return [
        {
          filename: "lib/db/migrations/0013_owner.sql",
          status: "modified",
        },
      ];
    },
    api: async ({ path }) => {
      assert.equal(path, "/pulls/13");
      return owner;
    },
  });
  assert.equal(result.inventories[0].pr, 13);
  assert.deepEqual(result.errors, [
    { pr: null, error: "github_recheck_failed" },
  ]);
});

test("the GitHub 3000-file diff ceiling fails closed", async () => {
  const owner = pullRequest(14);
  let listCalls = 0;
  const result = await inventoryOpenMigrationPullRequests({
    token: "token",
    repository,
    paginate: async ({ path }) => {
      if (path === "/pulls?state=open") {
        listCalls += 1;
        return [owner];
      }
      return Array.from({ length: 3_000 }, (_, index) => ({
        filename: `app/generated-${index}.ts`,
        status: "added",
      }));
    },
    api: async () => {
      throw new Error("head recheck must not run after a truncated diff");
    },
  });
  assert.equal(listCalls, 2);
  assert.deepEqual(result.inventories, []);
  assert.deepEqual(result.errors, [
    { pr: 14, error: "migration_collision_file_inventory_limit_exceeded" },
  ]);
});

test("audit publishes exact-head failure to every collision owner and neutral to unrelated PRs", async () => {
  const prs = [pullRequest(20), pullRequest(21), pullRequest(22)];
  const calls = [];
  const result = await auditOpenMigrationPullRequests({
    env: { GITHUB_TOKEN: "token" },
    repository,
    api: checkApi(calls),
    freshnessCheck: async () => {},
    triggeringPrNumber: 22,
    inventory: async () => ({
      pullRequests: prs,
      errors: [],
      inventories: [
        {
          pr: 20,
          headSha: prs[0].head.sha,
          headRef: prs[0].head.ref,
          baseRef: "main",
          migrations: [
            {
              sequence: "0008",
              path: "lib/db/migrations/0008_demo.sql",
            },
          ],
        },
        {
          pr: 21,
          headSha: prs[1].head.sha,
          headRef: prs[1].head.ref,
          baseRef: "main",
          migrations: [
            {
              sequence: "0008",
              path: "lib/db/migrations/0008_contact.sql",
            },
          ],
        },
        {
          pr: 22,
          headSha: prs[2].head.sha,
          headRef: prs[2].head.ref,
          baseRef: "main",
          migrations: [],
        },
      ],
    }),
  });
  assert.equal(result.status, "fail");
  const creates = calls.filter((call) => call.path === "/check-runs");
  const completions = calls.filter((call) =>
    call.path.startsWith("/check-runs/")
  );
  assert.deepEqual(
    creates.map((call) => call.body.head_sha),
    prs.map((pr) => pr.head.sha)
  );
  assert.ok(
    creates.every((call) => call.body.name === MIGRATION_COLLISION_CHECK_NAME)
  );
  assert.deepEqual(
    completions.map((call) => call.body.conclusion),
    ["failure", "failure", "neutral"]
  );
  assert.match(completions[0].body.output.summary, /#20/);
  assert.match(completions[0].body.output.summary, /#21/);
});

test("one incomplete file inventory fails every known exact PR head", async () => {
  const prs = [pullRequest(30), pullRequest(31)];
  const calls = [];
  const result = await auditOpenMigrationPullRequests({
    env: { GITHUB_TOKEN: "token" },
    repository,
    api: checkApi(calls),
    freshnessCheck: async () => {},
    inventory: async () => ({
      pullRequests: prs,
      inventories: [
        {
          pr: 30,
          headSha: prs[0].head.sha,
          headRef: prs[0].head.ref,
          baseRef: "main",
          migrations: [
            {
              sequence: "0010",
              path: "lib/db/migrations/0010_known.sql",
              status: "added",
            },
          ],
          violations: [],
        },
      ],
      errors: [{ pr: 31, error: "stack_gate_github_api_failed:503" }],
    }),
  });
  assert.equal(result.status, "error");
  const completions = calls.filter((call) =>
    call.path.startsWith("/check-runs/")
  );
  assert.deepEqual(
    completions.map((call) => call.body.conclusion),
    ["failure", "failure"]
  );
  assert.ok(
    completions.every((call) =>
      call.body.output.summary.includes("inventory is incomplete")
    )
  );
});

test("scheduled audits publish only migration or immutable-history owners", async () => {
  const prs = [pullRequest(32), pullRequest(33)];
  const calls = [];
  const result = await auditOpenMigrationPullRequests({
    env: { GITHUB_TOKEN: "token" },
    repository,
    api: checkApi(calls),
    freshnessCheck: async () => {},
    inventory: async () => ({
      pullRequests: prs,
      errors: [],
      inventories: [
        {
          pr: 32,
          headSha: prs[0].head.sha,
          headRef: prs[0].head.ref,
          baseRef: "main",
          migrations: [
            {
              sequence: "0012",
              path: "lib/db/migrations/0012_owner.sql",
              status: "modified",
            },
          ],
          violations: [],
        },
        {
          pr: 33,
          headSha: prs[1].head.sha,
          headRef: prs[1].head.ref,
          baseRef: "main",
          migrations: [],
          violations: [],
        },
      ],
    }),
  });
  assert.equal(result.status, "pass");
  assert.deepEqual(
    result.results.map((entry) => entry.pr),
    [32]
  );
  assert.equal(calls.filter((call) => call.path === "/check-runs").length, 1);
});

test("a list failure on a PR event publishes failure to the triggering exact head", async () => {
  const fallbackPullRequest = pullRequest(40);
  const calls = [];
  const result = await auditOpenMigrationPullRequests({
    env: { GITHUB_TOKEN: "token" },
    repository,
    fallbackPullRequest,
    api: checkApi(calls),
    freshnessCheck: async () => {},
    inventory: async () => {
      throw new Error("github_pull_list_failed");
    },
  });
  assert.equal(result.status, "error");
  const create = calls.find((call) => call.path === "/check-runs");
  const complete = calls.find((call) => call.path.startsWith("/check-runs/"));
  assert.equal(create.body.head_sha, fallbackPullRequest.head.sha);
  assert.equal(complete.body.conclusion, "failure");
  assert.match(complete.body.output.summary, /github_pull_list_failed/);
});

test("check-run creation and completion failures fail closed", async () => {
  const result = {
    pr: 50,
    headSha: "f".repeat(40),
    headRef: "branch-50",
    migrations: [],
    collisions: [],
    status: "not_applicable",
  };
  await assert.rejects(
    publishMigrationResult({
      token: "token",
      repository,
      result,
      api: checkApi([], { failCreate: true }),
    }),
    /check_create_failed/
  );
  await assert.rejects(
    publishMigrationResult({
      token: "token",
      repository,
      result,
      api: checkApi([], { failComplete: true }),
    }),
    /check_complete_failed/
  );
});

test("an identical completed exact-head result is reused without a write", async () => {
  const result = {
    pr: 60,
    headSha: "a".repeat(40),
    headRef: "branch-60",
    migrations: [],
    violations: [],
    collisions: [],
    inventorySnapshot: [`60:${"a".repeat(40)}:branch-60:main`],
    status: "not_applicable",
  };
  const calls = [];
  const published = await publishMigrationResult({
    token: "token",
    repository,
    result,
    api: async (input) => {
      calls.push(input);
      return {
        total_count: 1,
        check_runs: [
          {
            name: MIGRATION_COLLISION_CHECK_NAME,
            app: { slug: "github-actions" },
            status: "completed",
            conclusion: "neutral",
            output: {
              summary: buildMigrationResultSummary(result),
            },
          },
        ],
      };
    },
    freshnessCheck: async () => {},
  });
  assert.equal(published.publication, "reused");
  assert.equal(calls.length, 1);
  assert.match(calls[0].path, new RegExp(`/commits/${result.headSha}/`));
});

test("check summaries bind reuse to the full inventory generation", () => {
  const base = {
    pr: 60,
    headSha: "a".repeat(40),
    headRef: "branch-60",
    migrations: [],
    violations: [],
    collisions: [],
    status: "not_applicable",
  };
  const first = buildMigrationResultSummary({
    ...base,
    inventorySnapshot: [`60:${"a".repeat(40)}:branch-60:main`],
  });
  const second = buildMigrationResultSummary({
    ...base,
    inventorySnapshot: [
      `60:${"a".repeat(40)}:branch-60:main`,
      `61:${"b".repeat(40)}:branch-61:main`,
    ],
  });
  assert.notEqual(first, second);
  assert.match(first, /Inventory generation: [0-9a-f]{64}\./);
  assert.match(second, /Inventory generation: [0-9a-f]{64}\./);
});

test("a check lookup error replaces possible stale success with failure", async () => {
  const result = {
    pr: 61,
    headSha: "b".repeat(40),
    headRef: "branch-61",
    migrations: [],
    violations: [],
    collisions: [],
    status: "not_applicable",
  };
  const calls = [];
  const published = await publishMigrationResult({
    token: "token",
    repository,
    result,
    api: async (input) => {
      calls.push(input);
      if (input.path.startsWith("/commits/")) {
        throw new Error("check_lookup_failed");
      }
      if (input.path === "/check-runs") return { id: 901 };
      return {};
    },
    freshnessCheck: async () => {},
  });
  assert.equal(published.status, "error");
  const completion = calls.find((call) => call.path.startsWith("/check-runs/"));
  assert.equal(completion.body.conclusion, "failure");
  assert.match(completion.body.output.summary, /check_lookup_failed/);
});

test("a deferred publication cannot emit stale success after the head moves", async () => {
  const result = {
    pr: 62,
    headSha: "c".repeat(40),
    headRef: "branch-62",
    baseRef: "main",
    migrations: [
      {
        sequence: "0012",
        path: "lib/db/migrations/0012_owner.sql",
        status: "added",
      },
    ],
    violations: [],
    collisions: [],
    inventorySnapshot: [`62:${"c".repeat(40)}:branch-62:main`],
    status: "pass",
  };
  let releaseFreshness;
  const deferredFreshness = new Promise((resolve) => {
    releaseFreshness = resolve;
  });
  const calls = [];
  let reuseCalls = 0;
  const movedPullRequest = {
    number: 62,
    state: "open",
    head: {
      sha: "d".repeat(40),
      ref: "branch-62",
      repo: { full_name: repository },
    },
    base: { ref: "main" },
  };
  const publication = publishMigrationResult({
    token: "token",
    repository,
    result,
    api: async (input) => {
      calls.push(input);
      if (input.path.startsWith("/pulls?")) {
        await deferredFreshness;
        return [movedPullRequest];
      }
      if (input.path === "/check-runs") return { id: 902 };
      if (input.path === "/check-runs/902") return {};
      throw new Error(`unexpected_api_path:${input.path}`);
    },
    reuseCheck: async () => {
      reuseCalls += 1;
      return true;
    },
  });

  await Promise.resolve();
  assert.equal(calls.length, 1);
  assert.match(calls[0].path, /^\/pulls\?/);
  assert.equal(
    calls.some((call) => call.path === "/check-runs"),
    false
  );
  releaseFreshness();
  const published = await publication;
  assert.equal(reuseCalls, 0);
  assert.equal(published.status, "error");
  const completion = calls.find((call) => call.path.startsWith("/check-runs/"));
  assert.equal(completion.body.conclusion, "failure");
  assert.doesNotMatch(completion.body.output.summary, /ownership is unique/i);
  assert.match(
    completion.body.output.summary,
    /migration_collision_global_snapshot_became_stale/
  );
});

test("a matching check is not reused when the snapshot moves during lookup", async () => {
  const result = {
    pr: 63,
    headSha: "e".repeat(40),
    headRef: "branch-63",
    baseRef: "main",
    migrations: [],
    violations: [],
    collisions: [],
    inventorySnapshot: [`63:${"e".repeat(40)}:branch-63:main`],
    status: "not_applicable",
  };
  let releaseLookup;
  const deferredLookup = new Promise((resolve) => {
    releaseLookup = resolve;
  });
  let markLookupStarted;
  const lookupStarted = new Promise((resolve) => {
    markLookupStarted = resolve;
  });
  let freshnessCalls = 0;
  const calls = [];
  const publication = publishMigrationResult({
    token: "token",
    repository,
    result,
    api: checkApi(calls),
    freshnessCheck: async () => {
      freshnessCalls += 1;
      if (freshnessCalls === 2) {
        throw new Error("snapshot_moved_during_lookup");
      }
    },
    reuseCheck: async () => {
      markLookupStarted();
      await deferredLookup;
      return true;
    },
  });

  await lookupStarted;
  assert.equal(freshnessCalls, 1);
  assert.equal(
    calls.some((call) => call.path === "/check-runs"),
    false
  );
  releaseLookup();
  const published = await publication;
  assert.equal(freshnessCalls, 2);
  assert.equal(published.status, "error");
  assert.equal(published.publication, "created");
  const completion = calls.find((call) => call.path.startsWith("/check-runs/"));
  assert.equal(completion.body.conclusion, "failure");
  assert.match(completion.body.output.summary, /post_lookup/);
  assert.match(completion.body.output.summary, /snapshot_moved_during_lookup/);
});

test("a snapshot move between check creation and completion patches failure", async () => {
  const result = {
    pr: 64,
    headSha: "f".repeat(40),
    headRef: "branch-64",
    baseRef: "main",
    migrations: [
      {
        sequence: "0014",
        path: "lib/db/migrations/0014_owner.sql",
        status: "added",
      },
    ],
    violations: [],
    collisions: [],
    inventorySnapshot: [`64:${"f".repeat(40)}:branch-64:main`],
    status: "pass",
  };
  let releaseCreate;
  const deferredCreate = new Promise((resolve) => {
    releaseCreate = resolve;
  });
  let markCreateStarted;
  const createStarted = new Promise((resolve) => {
    markCreateStarted = resolve;
  });
  let freshnessCalls = 0;
  const calls = [];
  const publication = publishMigrationResult({
    token: "token",
    repository,
    result,
    freshnessCheck: async () => {
      freshnessCalls += 1;
      if (freshnessCalls === 3) {
        throw new Error("snapshot_moved_after_create");
      }
    },
    reuseCheck: async () => false,
    api: async (input) => {
      calls.push(input);
      if (input.path === "/check-runs") {
        markCreateStarted();
        await deferredCreate;
        return { id: 903 };
      }
      if (input.path === "/check-runs/903") return {};
      throw new Error(`unexpected_api_path:${input.path}`);
    },
  });

  await createStarted;
  assert.equal(freshnessCalls, 2);
  assert.equal(calls.length, 1);
  releaseCreate();
  const published = await publication;
  assert.equal(freshnessCalls, 3);
  assert.equal(published.status, "error");
  const completion = calls.find((call) => call.path === "/check-runs/903");
  assert.equal(completion.body.conclusion, "failure");
  assert.match(completion.body.output.summary, /pre_completion/);
  assert.match(completion.body.output.summary, /snapshot_moved_after_create/);
});
