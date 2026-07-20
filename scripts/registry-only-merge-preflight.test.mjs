import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";

import {
  assertTrustedDispatchEvent,
  assertTrustedMergeContext,
  parseRegistryMergeArguments,
  preflightRegistryOnlyMerge,
  REGISTRY_MERGE_SUCCESS_MAX_AGE_MS,
} from "./registry-only-merge-preflight.mjs";
import {
  parseRegistryMergeRecoveryArguments,
  recoverRegistryMerge,
} from "./registry-only-merge-recovery.mjs";
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
const MERGE_SHA = "9".repeat(40);
const MERGE_TREE_SHA = "8".repeat(40);
const WORKFLOW_SHA = "7".repeat(40);
const RUN_ID = 800;
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

function trustedMergeEnv(overrides = {}) {
  return {
    ...env(),
    GITHUB_ACTIONS: "true",
    CI: "true",
    RUNNER_ENVIRONMENT: "github-hosted",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REF_NAME: "main",
    GITHUB_REF_TYPE: "branch",
    GITHUB_REF_PROTECTED: "true",
    GITHUB_WORKFLOW: "Relaunch Integration Gates",
    GITHUB_WORKFLOW_REF:
      "meelni/meelni-prep/.github/workflows/stack-topology.yml@refs/heads/main",
    GITHUB_WORKFLOW_SHA: WORKFLOW_SHA,
    GITHUB_SHA: WORKFLOW_SHA,
    GITHUB_JOB: "merge-registry",
    GITHUB_RUN_ID: String(RUN_ID),
    GITHUB_RUN_NUMBER: "1000",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_ACTOR_ID: "42",
    ...overrides,
  };
}

function currentWorkflowRun(overrides = {}) {
  return {
    id: RUN_ID,
    run_number: 1000,
    run_attempt: 1,
    event: "workflow_dispatch",
    status: "in_progress",
    conclusion: null,
    head_branch: "main",
    head_sha: WORKFLOW_SHA,
    path: ".github/workflows/stack-topology.yml",
    name: "Relaunch Integration Gates",
    workflow_id: 311365924,
    repository: repository(),
    head_repository: repository(),
    actor: { id: 42 },
    created_at: new Date(NOW - 30_000).toISOString(),
    updated_at: new Date(NOW - 10_000).toISOString(),
    ...overrides,
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
    sha: MERGE_SHA,
    message: "Pull Request successfully merged",
  },
  includeCurrentRun = false,
  currentRun = currentWorkflowRun(),
  postMergeCommit,
  postMergeRef,
  postMergePull,
  mutatePullRead,
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
  let mergePerformed = false;
  const api = async ({ path, method = "GET", body }) => {
    calls.push({ path, method, body });
    if (path === "/pulls/368/merge" && method === "PUT") {
      mergePerformed = mergeResponse.merged === true;
      return mergeResponse;
    }
    if (path === "/pulls/368") {
      if (mergePerformed) {
        return (
          postMergePull ?? {
            ...currentPull,
            state: "closed",
            merged: true,
            merge_commit_sha: MERGE_SHA,
          }
        );
      }
      pullReads += 1;
      if (mutatePullRead) return mutatePullRead(currentPull, pullReads);
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
    if (path === `/git/commits/${MERGE_SHA}`) {
      return (
        postMergeCommit ?? {
          sha: MERGE_SHA,
          tree: { sha: MERGE_TREE_SHA },
        }
      );
    }
    if (path === "/git/ref/heads/main") {
      return (
        postMergeRef ?? {
          ref: "refs/heads/main",
          object: { type: "commit", sha: MERGE_SHA },
        }
      );
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
      const historicalRuns = workflowRuns ?? defaultRuns;
      const runs = includeCurrentRun
        ? [currentRun, ...historicalRuns.filter((run) => run.id !== RUN_ID)]
        : historicalRuns;
      const movedRuns = runs.map((run) =>
        run.status === "completed" ? { ...run, id: run.id + 1 } : run
      );
      return {
        workflow_runs:
          (mutateSecondQueueRead && queueReads > 1) ||
          (mutateFinalQueueRead && queueReads > 2)
            ? movedRuns
            : runs,
      };
    }
    if (path === `/actions/runs/${RUN_ID}`) return currentRun;
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

function trustedMergeOptions(state, overrides = {}) {
  return {
    eventContent: event(),
    env: trustedMergeEnv(),
    api: state.api,
    now: () => NOW,
    merge: true,
    expectedHeadSha: HEAD_SHA,
    sleepImpl: async () => {},
    ...overrides,
  };
}

test("CLI arguments reject unknown, duplicate, and ambiguous merge authority", () => {
  assert.deepEqual(parseRegistryMergeArguments(["--pr", "368"]), {
    prNumber: 368,
    merge: false,
    expectedHeadSha: undefined,
  });
  assert.deepEqual(
    parseRegistryMergeArguments([
      "--merge",
      "--expected-head-sha",
      HEAD_SHA,
      "--pr",
      "368",
    ]),
    { prNumber: 368, merge: true, expectedHeadSha: HEAD_SHA }
  );
  for (const argv of [
    ["--pr", "368", "--unknown"],
    ["--pr", "368", "--pr", "369"],
    ["--pr", "368", "--merge", "--merge", "--expected-head-sha", HEAD_SHA],
    ["--pr", "368", "--merge"],
    ["--pr", "368", "--expected-head-sha", HEAD_SHA],
    ["--pr", "0368"],
    ["--pr", '368"; touch /tmp/pwned; echo "'],
    ["--pr", "368", "extra"],
    ["--pr", "368", "--merge", "--expected-head-sha", HEAD_SHA.toUpperCase()],
  ]) {
    assert.throws(() => parseRegistryMergeArguments(argv), /registry_merge_/);
  }
});

test("trusted merge context and dispatch inputs are exact", () => {
  const trusted = trustedMergeEnv();
  const context = assertTrustedMergeContext({
    env: trusted,
    expectedHeadSha: HEAD_SHA,
  });
  assert.equal(context.runId, RUN_ID);
  assert.equal(context.expectedHeadSha, HEAD_SHA);

  for (const [key, value] of [
    ["GITHUB_ACTIONS", "false"],
    ["GITHUB_EVENT_NAME", "pull_request_target"],
    ["GITHUB_REF", "refs/heads/not-main"],
    [
      "GITHUB_WORKFLOW_REF",
      "meelni/meelni-prep/.github/workflows/other.yml@refs/heads/main",
    ],
    ["GITHUB_JOB", "other"],
    ["GITHUB_RUN_ID", "0"],
  ]) {
    assert.throws(
      () =>
        assertTrustedMergeContext({
          env: trustedMergeEnv({ [key]: value }),
          expectedHeadSha: HEAD_SHA,
        }),
      /registry_merge_trusted_context_required/
    );
  }

  const temporaryRoot = mkdtempSync(join(tmpdir(), "registry-merge-event-"));
  const eventPath = join(temporaryRoot, "event.json");
  try {
    const dispatch = {
      ref: "main",
      inputs: {
        operation: "merge_registry",
        registry_pr: "368",
        expected_head_sha: HEAD_SHA,
      },
      repository: repository(),
      sender: { id: 42 },
    };
    writeFileSync(eventPath, JSON.stringify(dispatch));
    const dispatchEnv = trustedMergeEnv({ GITHUB_EVENT_PATH: eventPath });
    assert.doesNotThrow(() =>
      assertTrustedDispatchEvent({
        env: dispatchEnv,
        args: { prNumber: 368, expectedHeadSha: HEAD_SHA },
      })
    );
    writeFileSync(
      eventPath,
      JSON.stringify({
        ...dispatch,
        inputs: { ...dispatch.inputs, registry_pr: "369" },
      })
    );
    assert.throws(
      () =>
        assertTrustedDispatchEvent({
          env: dispatchEnv,
          args: { prNumber: 368, expectedHeadSha: HEAD_SHA },
        }),
      /registry_merge_dispatch_event_invalid/
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("local or untrusted merge mode is rejected before any API call", async () => {
  const state = fixture();
  await assert.rejects(
    preflightRegistryOnlyMerge({
      eventContent: event(),
      env: env(),
      api: state.api,
      merge: true,
      expectedHeadSha: HEAD_SHA,
    }),
    /registry_merge_trusted_context_required/
  );
  assert.equal(state.calls.length, 0);
});

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
  const state = fixture({ includeCurrentRun: true });
  const result = await preflightRegistryOnlyMerge({
    ...trustedMergeOptions(state),
    resolveStack: async () => {
      throw new Error("must_not_resolve");
    },
  });

  assert.equal(result.status, "merged");
  assert.equal(result.mergeAuthorized, true);
  assert.equal(result.mergeCommitSha, MERGE_SHA);
  assert.equal(result.postMergeVerified, true);
  assert.equal(
    state.calls.filter((call) => call.path.startsWith("/actions/workflows/"))
      .length,
    3
  );
  const merge = state.calls.find((call) => call.path === "/pulls/368/merge");
  assert.deepEqual(merge.body, { sha: HEAD_SHA, merge_method: "merge" });
});

test("expected head is bound before and across every merge barrier", async (t) => {
  await t.test("initial expected head differs", async () => {
    const state = fixture({ includeCurrentRun: true });
    await assert.rejects(
      preflightRegistryOnlyMerge({
        ...trustedMergeOptions(state),
        expectedHeadSha: "c".repeat(40),
        env: trustedMergeEnv(),
      }),
      /registry_merge_expected_head_changed/
    );
    assert.equal(
      state.calls.some((call) => call.path === "/pulls/368/merge"),
      false
    );
  });

  await t.test("head moves during the fresh barrier", async () => {
    const state = fixture({
      includeCurrentRun: true,
      mutatePullRead: (current, reads) =>
        reads >= 3
          ? { ...current, head: { ...current.head, sha: "c".repeat(40) } }
          : current,
    });
    await assert.rejects(
      preflightRegistryOnlyMerge(trustedMergeOptions(state)),
      /registry_validate_head_changed/
    );
    assert.equal(
      state.calls.some((call) => call.path === "/pulls/368/merge"),
      false
    );
  });

  await t.test("head moves during the final barrier", async () => {
    const state = fixture({
      includeCurrentRun: true,
      mutatePullRead: (current, reads) =>
        reads >= 5
          ? { ...current, head: { ...current.head, sha: "c".repeat(40) } }
          : current,
    });
    await assert.rejects(
      preflightRegistryOnlyMerge(trustedMergeOptions(state)),
      /registry_validate_head_changed/
    );
    assert.equal(
      state.calls.some((call) => call.path === "/pulls/368/merge"),
      false
    );
  });
});

test("trusted queue excludes only the verified current run", async (t) => {
  await t.test("current run identity mismatch fails closed", async () => {
    const state = fixture({
      includeCurrentRun: true,
      currentRun: currentWorkflowRun({ head_branch: "other" }),
    });
    await assert.rejects(
      preflightRegistryOnlyMerge(trustedMergeOptions(state)),
      /registry_merge_current_run_invalid/
    );
    assert.equal(
      state.calls.some((call) => call.path === "/pulls/368/merge"),
      false
    );
  });

  await t.test("missing current run fails closed", async () => {
    const state = fixture({ includeCurrentRun: false });
    await assert.rejects(
      preflightRegistryOnlyMerge(trustedMergeOptions(state)),
      /registry_merge_current_run_missing/
    );
    assert.equal(
      state.calls.some((call) => call.path === "/pulls/368/merge"),
      false
    );
  });

  await t.test(
    "a different active publisher run remains blocking",
    async () => {
      const state = fixture({
        includeCurrentRun: true,
        workflowRuns: [
          {
            id: 799,
            status: "in_progress",
            conclusion: null,
            created_at: new Date(NOW - 45_000).toISOString(),
            updated_at: new Date(NOW - 20_000).toISOString(),
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
      await assert.rejects(
        preflightRegistryOnlyMerge(trustedMergeOptions(state)),
        /registry_merge_publisher_queue_active/
      );
      assert.equal(
        state.calls.some((call) => call.path === "/pulls/368/merge"),
        false
      );
    }
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
  const state = fixture({ includeCurrentRun: true });
  let reads = 0;
  await assert.rejects(
    preflightRegistryOnlyMerge({
      ...trustedMergeOptions(state),
      now: () => [NOW, NOW, NOW + 11 * 60_000][Math.min(reads++, 2)],
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
        includeCurrentRun: true,
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
          ...trustedMergeOptions(state),
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
      includeCurrentRun: true,
      mutateFinalPullRead: (current) => ({
        ...current,
        head: { ...current.head, sha: "c".repeat(40) },
      }),
    });
    await assert.rejects(
      preflightRegistryOnlyMerge({
        ...trustedMergeOptions(state),
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
        includeCurrentRun: true,
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
          ...trustedMergeOptions(state),
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
    const state = fixture({
      includeCurrentRun: true,
      mutateFinalQueueRead: true,
    });
    await assert.rejects(
      preflightRegistryOnlyMerge({
        ...trustedMergeOptions(state),
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
      includeCurrentRun: true,
      mutateFinalProtectionRead: (current) => ({
        ...current,
        enforce_admins: { enabled: false },
      }),
    });
    await assert.rejects(
      preflightRegistryOnlyMerge({
        ...trustedMergeOptions(state),
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
      includeCurrentRun: true,
      mutateFinalCheckRead: (checks) =>
        checks.map((check) =>
          check.name === "Validate"
            ? { ...check, conclusion: "failure" }
            : check
        ),
    });
    await assert.rejects(
      preflightRegistryOnlyMerge({
        ...trustedMergeOptions(state),
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
    includeCurrentRun: true,
    mergeResponse: { merged: false, sha: null, message: "Not merged" },
  });
  await assert.rejects(
    preflightRegistryOnlyMerge({
      ...trustedMergeOptions(state),
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

test("a performed merge is recorded before bounded post-merge verification fails", async () => {
  const state = fixture({
    includeCurrentRun: true,
    postMergeRef: {
      ref: "refs/heads/main",
      object: { type: "commit", sha: "6".repeat(40) },
    },
  });
  const performed = [];
  await assert.rejects(
    preflightRegistryOnlyMerge({
      ...trustedMergeOptions(state),
      onMergePerformed: async (result) => performed.push(result),
    }),
    /registry_merge_post_merge_verification_failed/
  );
  assert.deepEqual(performed, [{ mergeCommitSha: MERGE_SHA }]);
  assert.equal(
    state.calls.filter((call) => call.path === `/git/commits/${MERGE_SHA}`)
      .length,
    3
  );
  assert.equal(
    state.calls.filter((call) => call.path === "/pulls/368/merge").length,
    1
  );
});

test("a writable attempted marker survives merge-output callback failure", async () => {
  const state = fixture({ includeCurrentRun: true });
  const markers = [];
  await assert.rejects(
    preflightRegistryOnlyMerge({
      ...trustedMergeOptions(state),
      onBeforeMerge: async () => markers.push("attempted"),
      onMergePerformed: async ({ mergeCommitSha }) => {
        markers.push(`performed:${mergeCommitSha}`);
        throw new Error("simulated_github_output_failure");
      },
    }),
    /simulated_github_output_failure/
  );
  assert.deepEqual(markers, ["attempted", `performed:${MERGE_SHA}`]);
  assert.equal(
    state.calls.filter((call) => call.path === "/pulls/368/merge").length,
    1
  );
});

test("an unwritable attempted marker fails before merge mutation", async () => {
  const state = fixture({ includeCurrentRun: true });
  await assert.rejects(
    preflightRegistryOnlyMerge({
      ...trustedMergeOptions(state),
      onBeforeMerge: async () => {
        throw new Error("simulated_attempted_output_failure");
      },
    }),
    /simulated_attempted_output_failure/
  );
  assert.equal(
    state.calls.some((call) => call.path === "/pulls/368/merge"),
    false
  );
});

test("trusted recovery discovers a merge without mutating GitHub", async () => {
  assert.deepEqual(
    parseRegistryMergeRecoveryArguments([
      "--pr",
      "368",
      "--expected-head-sha",
      HEAD_SHA,
    ]),
    { prNumber: 368, expectedHeadSha: HEAD_SHA }
  );
  assert.throws(
    () =>
      parseRegistryMergeRecoveryArguments([
        "--pr",
        "368",
        "--expected-head-sha",
        HEAD_SHA,
        "--extra",
        "value",
      ]),
    /registry_merge_recovery_arguments_invalid/
  );

  const calls = [];
  const api = async ({ path, method = "GET" }) => {
    calls.push({ path, method });
    if (path === "") {
      return { ...repository(), default_branch: "main" };
    }
    if (path === "/pulls/368") {
      return {
        ...pullRequest(),
        state: "closed",
        merged: true,
        merge_commit_sha: MERGE_SHA,
      };
    }
    if (path === `/git/commits/${MERGE_SHA}`) {
      return { sha: MERGE_SHA, tree: { sha: MERGE_TREE_SHA } };
    }
    if (path === "/git/ref/heads/main") {
      return {
        ref: "refs/heads/main",
        object: { type: "commit", sha: MERGE_SHA },
      };
    }
    throw new Error(`unexpected_recovery_path:${path}`);
  };
  const result = await recoverRegistryMerge({
    prNumber: 368,
    expectedHeadSha: HEAD_SHA,
    env: trustedMergeEnv(),
    api,
  });
  assert.deepEqual(result, {
    status: "merged",
    mergePerformed: true,
    mergeCommitSha: MERGE_SHA,
    defaultBranchHeadMatches: true,
  });
  assert.equal(
    calls.every((call) => call.method === "GET"),
    true
  );
});

test("trusted workflow dispatch owns merge and compensates for token recursion suppression", () => {
  const workflow = readFileSync(
    join(process.cwd(), ".github/workflows/stack-topology.yml"),
    "utf8"
  );
  assert.match(workflow, /workflow_dispatch:\n\s+inputs:/);
  assert.match(workflow, /operation:[\s\S]*merge_registry/);
  assert.match(workflow, /registry_pr:[\s\S]*expected_head_sha:/);
  assert.match(
    workflow,
    /merge-registry:[\s\S]*inputs\.operation == 'merge_registry'/
  );
  assert.match(
    workflow,
    /merge-registry:[\s\S]*actions: read[\s\S]*checks: write[\s\S]*contents: write[\s\S]*pull-requests: write/
  );
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}[\s\S]*--merge[\s\S]*--expected-head-sha/
  );
  assert.match(
    workflow,
    /steps\.merge_registry\.outputs\.merge_attempted == 'true'[\s\S]*registry-only-merge-recovery\.mjs[\s\S]*steps\.recover_merge\.outputs\.merge_performed == 'true'[\s\S]*git fetch --no-tags origin "\$merge_sha"[\s\S]*git checkout --detach "\$merge_sha"[\s\S]*git ls-remote origin refs\/heads\/main/
  );
  assert.match(
    workflow,
    /id: post_merge_stack_audit[\s\S]*revalidate-stacked-prs-ci\.mjs[\s\S]*id: post_merge_migration_audit[\s\S]*check-migration-collisions-ci\.mjs[\s\S]*id: post_merge_registry_sweep[\s\S]*registry-only-validate-ci\.mjs --sweep/
  );
  assert.match(
    workflow,
    /steps\.merge_registry\.outcome != 'success'[\s\S]*Recovery revalidation is required; the merge cannot be rolled back/
  );
  assert.match(
    workflow,
    /Fail an unresolved attempted merge[\s\S]*result could not be recovered/
  );
  assert.match(
    workflow,
    /revalidate-all:[\s\S]*inputs\.operation == 'revalidate'/
  );
  const parsedWorkflow = parse(workflow);
  for (const jobName of ["merge-registry"]) {
    for (const step of parsedWorkflow.jobs[jobName].steps) {
      if (typeof step.run !== "string") continue;
      assert.doesNotMatch(step.run, /\$\{\{\s*inputs\./);
    }
  }
  assert.match(
    workflow,
    /--pr "\$INPUT_REGISTRY_PR"[\s\S]*--expected-head-sha "\$INPUT_EXPECTED_HEAD_SHA"/
  );
});

test("operator docs and package expose no local token-bearing merge CLI", () => {
  const source = readFileSync(
    join(process.cwd(), "scripts/registry-only-merge-preflight.mjs"),
    "utf8"
  );
  const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
  const operations = readFileSync(
    join(process.cwd(), "docs/operations/ci-cost-control.md"),
    "utf8"
  );
  assert.doesNotMatch(source, /execFileSync|gh auth token/);
  assert.doesNotMatch(packageJson, /preflight:registry-merge/);
  assert.doesNotMatch(operations, /GITHUB_TOKEN=.*gh auth token/);
  assert.doesNotMatch(operations, /npm run preflight:registry-merge/);
  assert.match(operations, /gh workflow run stack-topology\.yml/);
});
