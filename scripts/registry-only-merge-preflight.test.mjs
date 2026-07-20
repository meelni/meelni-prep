import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  preflightRegistryOnlyMerge,
  REGISTRY_MERGE_SUCCESS_MAX_AGE_MS,
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

function manifest(stacks = []) {
  return `${JSON.stringify({ version: 2, repository: REPOSITORY, stacks })}\n`;
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
  proposedManifest = manifest(),
  openPulls = [currentPull],
  completedAt = new Date(NOW - 60_000).toISOString(),
  workflowRuns,
  mutateSecondQueueRead,
  mutateFinalQueueRead,
  protection,
  checkAppId = 15368,
  checkRuns,
  mergeResponse = {
    merged: true,
    sha: "9".repeat(40),
    message: "Pull Request successfully merged",
  },
  mutateFinalPullRead,
  mutateFinalProtectionRead,
  mutateFinalCheckRead,
  proofOverride,
} = {}) {
  const content = proposedManifest;
  const expectedBlobSha = blobSha(content);
  const proof = proofOverride ?? {
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
  let pullReads = 0;
  let protectionReads = 0;
  let checkReads = 0;
  const api = async ({ path, method = "GET", body }) => {
    calls.push({ path, method, body });
    if (path === "/pulls/368/merge" && method === "PUT") {
      return mergeResponse;
    }
    if (path === "/pulls/368") {
      pullReads += 1;
      return mutateFinalPullRead && pullReads >= 5
        ? mutateFinalPullRead(currentPull, pullReads)
        : currentPull;
    }
    if (path.startsWith("/pulls/368/files?")) {
      return [
        {
          filename: ".github/stacked-prs.json",
          status: "modified",
          sha: expectedBlobSha,
        },
      ];
    }
    if (path.startsWith("/pulls?state=open&")) return openPulls;
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
      protectionReads += 1;
      const resolvedProtection = protection ?? {
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
      };
      return mutateFinalProtectionRead && protectionReads > 1
        ? mutateFinalProtectionRead(resolvedProtection)
        : resolvedProtection;
    }
    if (path.startsWith("/actions/workflows/stack-topology.yml/runs?")) {
      queueReads += 1;
      const runs = workflowRuns ?? defaultRuns;
      return {
        workflow_runs:
          (mutateSecondQueueRead && queueReads > 1) ||
          (mutateFinalQueueRead && queueReads > 2)
            ? [{ ...runs[0], id: runs[0].id + 1 }]
            : runs,
      };
    }
    if (path.startsWith(`/commits/${HEAD_SHA}/check-runs?`)) {
      checkReads += 1;
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
      let resolvedCheckRuns = checkRuns ?? [
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
      if (mutateFinalCheckRead && checkReads > 1) {
        resolvedCheckRuns = mutateFinalCheckRead(resolvedCheckRuns);
      }
      return {
        total_count: resolvedCheckRuns.length,
        check_runs: resolvedCheckRuns,
      };
    }
    throw new Error(`unexpected_api_path:${method}:${path}`);
  };
  return { api, calls };
}

test("read-only mode returns advisory evidence that is not merge authorization", async () => {
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

  assert.equal(result.status, "advisory");
  assert.equal(result.mergeAuthorized, false);
  assert.equal(result.pr, 368);
  assert.equal(result.headSha, HEAD_SHA);
  assert.equal(result.publisherRunId, 700);
  assert.equal(
    result.evidenceExpiresAt,
    new Date(NOW - 60_000 + REGISTRY_MERGE_SUCCESS_MAX_AGE_MS).toISOString()
  );
  assert.match(result.instructions, /not merge authorization/i);
  assert.equal(
    state.calls.some((call) => call.path === "/pulls/368/merge"),
    false
  );
  assert.equal(
    state.calls.filter((call) => call.path.startsWith("/actions/workflows/"))
      .length,
    2
  );
});

test("explicit merge mode owns the final barrier and exact-head protected merge", async () => {
  const state = fixture();
  const result = await preflightRegistryOnlyMerge({
    eventContent: event(),
    env: env(),
    api: state.api,
    resolveStack: async () => {
      throw new Error("must_not_resolve");
    },
    now: () => NOW,
    merge: true,
  });

  assert.equal(result.status, "merged");
  assert.equal(result.mergeAuthorized, true);
  assert.equal(result.mergeCommitSha, "9".repeat(40));
  assert.equal(
    state.calls.filter((call) => call.path.startsWith("/actions/workflows/"))
      .length,
    3
  );
  const merge = state.calls.find((call) => call.path === "/pulls/368/merge");
  assert.deepEqual(merge.body, { sha: HEAD_SHA, merge_method: "merge" });
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

test("reports the evidence expiry from an almost-stale Validate", async () => {
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
  assert.equal(result.evidenceExpiresAt, new Date(NOW + 30_000).toISOString());
});

test("read-only evidence fails if Validate expires during its second barrier", async () => {
  const state = fixture();
  let reads = 0;
  await assert.rejects(
    preflightRegistryOnlyMerge({
      eventContent: event(),
      env: env(),
      api: state.api,
      now: () => [NOW, NOW + 11 * 60_000][Math.min(reads++, 1)],
    }),
    /registry_merge_validate_stale/
  );
  assert.equal(
    state.calls.some((call) => call.path === "/pulls/368/merge"),
    false
  );
});

test("merge mode rechecks expiry immediately before mutation", async () => {
  const state = fixture();
  let reads = 0;
  await assert.rejects(
    preflightRegistryOnlyMerge({
      eventContent: event(),
      env: env(),
      api: state.api,
      now: () => [NOW, NOW, NOW + 11 * 60_000][Math.min(reads++, 2)],
      merge: true,
    }),
    /registry_merge_validate_stale/
  );
  assert.equal(
    state.calls.some((call) => call.path === "/pulls/368/merge"),
    false
  );
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

test("merge mode never mutates after final PR or queue movement", async (t) => {
  await t.test(
    "live topology generation changes at the final proof",
    async () => {
      const entry = {
        pr: 365,
        parentPr: 363,
        headRef: "child",
        parentRef: "parent",
      };
      const child = pullRequest({
        number: 365,
        head: { sha: "e".repeat(40), ref: "child", repo: repository() },
        base: { sha: "f".repeat(40), ref: "parent", repo: repository() },
      });
      const state = fixture({
        proposedManifest: manifest([entry]),
        openPulls: [pullRequest(), child],
        proofOverride: {
          repository: REPOSITORY,
          headSha: HEAD_SHA,
          baseSha: BASE_SHA,
          stacks: [
            {
              pr: 365,
              parentPr: 363,
              head: "e".repeat(40),
              parentHead: "f".repeat(40),
              mergeBase: "f".repeat(40),
            },
          ],
        },
      });
      let resolutions = 0;
      await assert.rejects(
        preflightRegistryOnlyMerge({
          eventContent: event(),
          env: env(),
          api: state.api,
          now: () => NOW,
          merge: true,
          resolveStack: async () => {
            resolutions += 1;
            return {
              status: "pass",
              head: resolutions >= 3 ? "7".repeat(40) : "e".repeat(40),
              actualParentHead: "f".repeat(40),
              mergeBase: "f".repeat(40),
            };
          },
        }),
        /registry_merge_generation_changed/
      );
      assert.equal(resolutions, 3);
      assert.equal(
        state.calls.some((call) => call.path === "/pulls/368/merge"),
        false
      );
    }
  );

  await t.test("PR head moves before the final proof", async () => {
    const state = fixture({
      mutateFinalPullRead: (current) => ({
        ...current,
        head: { ...current.head, sha: "c".repeat(40) },
      }),
    });
    await assert.rejects(
      preflightRegistryOnlyMerge({
        eventContent: event(),
        env: env(),
        api: state.api,
        now: () => NOW,
        merge: true,
      }),
      /registry_validate_head_changed/
    );
    assert.equal(
      state.calls.some((call) => call.path === "/pulls/368/merge"),
      false
    );
  });

  await t.test(
    "PR base moves between final classification and state read",
    async () => {
      const state = fixture({
        mutateFinalPullRead: (current, pullReads) =>
          pullReads === 6
            ? {
                ...current,
                base: {
                  ...current.base,
                  sha: "d".repeat(40),
                  ref: "other-base",
                },
              }
            : current,
      });
      await assert.rejects(
        preflightRegistryOnlyMerge({
          eventContent: event(),
          env: env(),
          api: state.api,
          now: () => NOW,
          merge: true,
        }),
        /registry_merge_pull_request_snapshot_changed/
      );
      assert.equal(
        state.calls.some((call) => call.path === "/pulls/368/merge"),
        false
      );
    }
  );

  await t.test("publisher queue changes at the final barrier", async () => {
    const state = fixture({ mutateFinalQueueRead: true });
    await assert.rejects(
      preflightRegistryOnlyMerge({
        eventContent: event(),
        env: env(),
        api: state.api,
        now: () => NOW,
        merge: true,
      }),
      /registry_merge_publisher_queue_changed/
    );
    assert.equal(
      state.calls.some((call) => call.path === "/pulls/368/merge"),
      false
    );
  });

  await t.test("protection changes at the final barrier", async () => {
    const state = fixture({
      mutateFinalProtectionRead: (current) => ({
        ...current,
        enforce_admins: { enabled: false },
      }),
    });
    await assert.rejects(
      preflightRegistryOnlyMerge({
        eventContent: event(),
        env: env(),
        api: state.api,
        now: () => NOW,
        merge: true,
      }),
      /registry_merge_protection_invalid/
    );
    assert.equal(
      state.calls.some((call) => call.path === "/pulls/368/merge"),
      false
    );
  });

  await t.test("required check changes at the final barrier", async () => {
    const state = fixture({
      mutateFinalCheckRead: (checks) =>
        checks.map((check) =>
          check.name === "Validate"
            ? { ...check, conclusion: "failure" }
            : check
        ),
    });
    await assert.rejects(
      preflightRegistryOnlyMerge({
        eventContent: event(),
        env: env(),
        api: state.api,
        now: () => NOW,
        merge: true,
      }),
      /registry_merge_required_check_not_successful/
    );
    assert.equal(
      state.calls.some((call) => call.path === "/pulls/368/merge"),
      false
    );
  });
});

test("merge mode rejects an unverified GitHub merge response", async () => {
  const state = fixture({
    mergeResponse: { merged: false, sha: null, message: "Not merged" },
  });
  await assert.rejects(
    preflightRegistryOnlyMerge({
      eventContent: event(),
      env: env(),
      api: state.api,
      now: () => NOW,
      merge: true,
    }),
    /registry_merge_response_invalid/
  );
  const mergeCalls = state.calls.filter(
    (call) => call.path === "/pulls/368/merge"
  );
  assert.equal(mergeCalls.length, 1);
  assert.deepEqual(mergeCalls[0].body, {
    sha: HEAD_SHA,
    merge_method: "merge",
  });
});
