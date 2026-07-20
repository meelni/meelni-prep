import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  preflightRegistryOnlyMerge,
  REGISTRY_MERGE_SUCCESS_MAX_AGE_MS,
  REGISTRY_MERGE_WINDOW_MS,
} from "./registry-only-merge-preflight.mjs";
import {
  registryProofGeneration,
  registryValidateExternalId,
} from "./registry-only-validate-ci.mjs";

const REPOSITORY = "meelni/meelni-prep";
const REPOSITORY_ID = 24680;
const HEAD_SHA = "a".repeat(40);
const BASE_SHA = "b".repeat(40);
const ROOT_TREE_SHA = "1".repeat(40);
const GITHUB_TREE_SHA = "2".repeat(40);
const NOW = Date.parse("2026-07-19T20:00:00.000Z");

function manifest() {
  return `${JSON.stringify({ version: 2, repository: REPOSITORY, stacks: [] })}\n`;
}

function blobSha(content) {
  const bytes = Buffer.from(content);
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

function repository() {
  return { id: REPOSITORY_ID, full_name: REPOSITORY };
}

function pullRequest(overrides = {}) {
  return {
    number: 368,
    state: "open",
    draft: false,
    auto_merge: null,
    mergeable: true,
    mergeable_state: "clean",
    head: {
      sha: HEAD_SHA,
      ref: "codex/register-stacks",
      repo: repository(),
    },
    base: { sha: BASE_SHA, ref: "main", repo: repository() },
    ...overrides,
  };
}

function event(current = pullRequest()) {
  return JSON.stringify({
    action: "operator_preflight",
    repository: { ...repository(), default_branch: "main" },
    pull_request: current,
  });
}

function env() {
  return {
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_REPOSITORY_ID: String(REPOSITORY_ID),
    GITHUB_DEFAULT_BRANCH: "main",
    GITHUB_TOKEN: "test-token",
  };
}

function fixture({
  currentPull = pullRequest(),
  completedAt = new Date(NOW - 60_000).toISOString(),
  workflowRuns,
  mutateSecondQueueRead,
  protection,
  checkAppId = 15368,
  checkRuns,
} = {}) {
  const content = manifest();
  const expectedBlobSha = blobSha(content);
  const proof = {
    repository: REPOSITORY,
    headSha: HEAD_SHA,
    baseSha: BASE_SHA,
    stacks: [],
  };
  const binding = {
    repository: { id: REPOSITORY_ID },
    pullRequest: { number: 368, headSha: HEAD_SHA, baseSha: BASE_SHA },
  };
  const defaultRuns = [
    {
      id: 700,
      status: "completed",
      conclusion: "success",
      created_at: new Date(NOW - 60_000).toISOString(),
      updated_at: completedAt,
    },
  ];
  const calls = [];
  let queueReads = 0;
  const api = async ({ path, method = "GET" }) => {
    calls.push({ path, method });
    if (path === "/pulls/368") return currentPull;
    if (path.startsWith("/pulls/368/files?")) {
      return [
        {
          filename: ".github/stacked-prs.json",
          status: "modified",
          sha: expectedBlobSha,
        },
      ];
    }
    if (path.startsWith("/pulls?state=open&")) return [currentPull];
    if (path === `/git/commits/${HEAD_SHA}`) {
      return { sha: HEAD_SHA, tree: { sha: ROOT_TREE_SHA } };
    }
    if (path === `/git/trees/${ROOT_TREE_SHA}`) {
      return {
        sha: ROOT_TREE_SHA,
        truncated: false,
        tree: [
          {
            path: ".github",
            mode: "040000",
            type: "tree",
            sha: GITHUB_TREE_SHA,
          },
        ],
      };
    }
    if (path === `/git/trees/${GITHUB_TREE_SHA}`) {
      return {
        sha: GITHUB_TREE_SHA,
        truncated: false,
        tree: [
          {
            path: "stacked-prs.json",
            mode: "100644",
            type: "blob",
            sha: expectedBlobSha,
          },
        ],
      };
    }
    if (path === `/git/blobs/${expectedBlobSha}`) {
      const bytes = Buffer.from(content);
      return {
        sha: expectedBlobSha,
        encoding: "base64",
        size: bytes.length,
        content: bytes.toString("base64"),
      };
    }
    if (path === "/branches/main/protection") {
      return (
        protection ?? {
          required_status_checks: {
            strict: true,
            checks: [
              { context: "Validate", app_id: 15368 },
              { context: "Trusted Publisher", app_id: 15368 },
              { context: "Migration Collision Publisher", app_id: 15368 },
            ],
          },
          enforce_admins: { enabled: true },
          allow_force_pushes: { enabled: false },
          allow_deletions: { enabled: false },
        }
      );
    }
    if (path.startsWith("/actions/workflows/stack-topology.yml/runs?")) {
      queueReads += 1;
      const runs = workflowRuns ?? defaultRuns;
      return {
        workflow_runs:
          mutateSecondQueueRead && queueReads > 1
            ? [{ ...runs[0], id: runs[0].id + 1 }]
            : runs,
      };
    }
    if (path.startsWith(`/commits/${HEAD_SHA}/check-runs?`)) {
      const validate = {
        id: 901,
        name: "Validate",
        head_sha: HEAD_SHA,
        status: "completed",
        conclusion: "success",
        completed_at: completedAt,
        external_id: registryValidateExternalId(
          binding,
          registryProofGeneration(proof)
        ),
        app: { id: checkAppId },
      };
      const resolvedCheckRuns = checkRuns ?? [
        validate,
        {
          id: 902,
          name: "Trusted Publisher",
          head_sha: HEAD_SHA,
          status: "completed",
          conclusion: "success",
          completed_at: completedAt,
          app: { id: 15368 },
        },
        {
          id: 903,
          name: "Migration Collision Publisher",
          head_sha: HEAD_SHA,
          status: "completed",
          conclusion: "success",
          completed_at: completedAt,
          app: { id: 15368 },
        },
      ];
      return {
        total_count: resolvedCheckRuns.length,
        check_runs: resolvedCheckRuns,
      };
    }
    throw new Error(`unexpected_api_path:${method}:${path}`);
  };
  return { api, calls };
}

test("passes only a stable exact-head registry merge window", async () => {
  const state = fixture();
  const result = await preflightRegistryOnlyMerge({
    eventContent: event(),
    env: env(),
    api: state.api,
    resolveStack: async () => {
      throw new Error("must_not_resolve");
    },
    now: () => NOW,
  });

  assert.equal(result.status, "pass");
  assert.equal(result.pr, 368);
  assert.equal(result.headSha, HEAD_SHA);
  assert.equal(result.publisherRunId, 700);
  assert.equal(
    result.expiresAt,
    new Date(NOW + REGISTRY_MERGE_WINDOW_MS).toISOString()
  );
  assert.match(result.instructions, /do not use auto-merge or admin bypass/i);
  assert.equal(
    state.calls.filter((call) => call.path.startsWith("/actions/workflows/"))
      .length,
    2
  );
});

test("refuses an old green check while the publisher queue is active", async () => {
  const state = fixture({
    workflowRuns: [
      { id: 701, status: "in_progress", conclusion: null, updated_at: null },
      {
        id: 700,
        status: "completed",
        conclusion: "success",
        created_at: new Date(NOW - 60_000).toISOString(),
        updated_at: new Date(NOW - 60_000).toISOString(),
      },
    ],
  });
  await assert.rejects(
    preflightRegistryOnlyMerge({
      eventContent: event(),
      env: env(),
      api: state.api,
      now: () => NOW,
    }),
    /registry_merge_publisher_queue_active/
  );
});

test("refuses stale exact-head success", async () => {
  const state = fixture({
    completedAt: new Date(
      NOW - REGISTRY_MERGE_SUCCESS_MAX_AGE_MS - 1
    ).toISOString(),
  });
  await assert.rejects(
    preflightRegistryOnlyMerge({
      eventContent: event(),
      env: env(),
      api: state.api,
      now: () => NOW,
    }),
    /registry_merge_validate_stale/
  );
});

test("derives the merge deadline from an almost-stale Validate", async () => {
  const completedAt = new Date(
    NOW - REGISTRY_MERGE_SUCCESS_MAX_AGE_MS + 30_000
  ).toISOString();
  const state = fixture({ completedAt });
  const result = await preflightRegistryOnlyMerge({
    eventContent: event(),
    env: env(),
    api: state.api,
    now: () => NOW,
  });
  assert.equal(result.expiresAt, new Date(NOW + 30_000).toISOString());
});

test("selects the newest publisher run explicitly rather than trusting API order", async () => {
  const state = fixture({
    workflowRuns: [
      {
        id: 699,
        status: "completed",
        conclusion: "failure",
        created_at: new Date(NOW - 120_000).toISOString(),
        updated_at: new Date(NOW - 120_000).toISOString(),
      },
      {
        id: 700,
        status: "completed",
        conclusion: "success",
        created_at: new Date(NOW - 60_000).toISOString(),
        updated_at: new Date(NOW - 60_000).toISOString(),
      },
    ],
  });
  const result = await preflightRegistryOnlyMerge({
    eventContent: event(),
    env: env(),
    api: state.api,
    now: () => NOW,
  });
  assert.equal(result.publisherRunId, 700);
});

test("refuses required checks from the wrong GitHub App", async () => {
  const state = fixture({ checkAppId: 999 });
  await assert.rejects(
    preflightRegistryOnlyMerge({
      eventContent: event(),
      env: env(),
      api: state.api,
      now: () => NOW,
    }),
    /registry_merge_required_check_missing/
  );
});

test("refuses auto-merge and admin-bypass conditions", async (t) => {
  await t.test("auto-merge enabled", async () => {
    const current = pullRequest({
      auto_merge: { enabled_by: { login: "bot" } },
    });
    const state = fixture({ currentPull: current });
    await assert.rejects(
      preflightRegistryOnlyMerge({
        eventContent: event(current),
        env: env(),
        api: state.api,
        now: () => NOW,
      }),
      /registry_merge_auto_merge_enabled/
    );
  });

  await t.test("admin enforcement disabled", async () => {
    const state = fixture({
      protection: {
        required_status_checks: {
          strict: true,
          checks: [
            { context: "Validate", app_id: 15368 },
            { context: "Trusted Publisher", app_id: 15368 },
            { context: "Migration Collision Publisher", app_id: 15368 },
          ],
        },
        enforce_admins: { enabled: false },
        allow_force_pushes: { enabled: false },
        allow_deletions: { enabled: false },
      },
    });
    await assert.rejects(
      preflightRegistryOnlyMerge({
        eventContent: event(),
        env: env(),
        api: state.api,
        now: () => NOW,
      }),
      /registry_merge_protection_invalid/
    );
  });
});

test("refuses a queue generation that changes across the freeze barrier", async () => {
  const state = fixture({ mutateSecondQueueRead: true });
  await assert.rejects(
    preflightRegistryOnlyMerge({
      eventContent: event(),
      env: env(),
      api: state.api,
      now: () => NOW,
    }),
    /registry_merge_publisher_queue_changed/
  );
});
