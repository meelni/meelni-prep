import assert from "node:assert/strict";
import test from "node:test";

import {
  createShadowFeedbackArtifactKey,
  SHADOW_FEEDBACK_ARTIFACT_VERSION,
  type ShadowFeedbackArtifactV1,
} from "@meelni/core";
import { getShadowFeedbackArtifactStorageGate } from "@/lib/evaluation/shadow-feedback-artifact-config";

import {
  createShadowFeedbackArtifactStore,
  type ShadowFeedbackArtifactRepository,
} from "./shadow-feedback-artifacts";

const USER_ID = "44500000-0000-4000-8000-000000000001";
const SESSION_ID = "44500000-0000-4000-8000-000000000445";

test("disabled and forged gates produce zero repository side effects", async () => {
  let inserts = 0;
  let reads = 0;
  const repository: ShadowFeedbackArtifactRepository = {
    async insert() {
      inserts += 1;
      return "inserted";
    },
    async readExact() {
      reads += 1;
      return [];
    },
  };
  const store = createShadowFeedbackArtifactStore(repository);
  const artifact = fixtureArtifact();

  assert.equal(
    await store.record(getShadowFeedbackArtifactStorageGate({}), {
      userId: USER_ID,
      artifact,
    }),
    "disabled"
  );
  assert.equal(
    await store.record({ enabled: true, context: {} } as never, {
      userId: USER_ID,
      artifact,
    }),
    "rejected"
  );
  assert.deepEqual({ inserts, reads }, { inserts: 0, reads: 0 });
});

test("crash retry, event replay, and reconnect converge on one immutable exact key", async () => {
  const rows = new Map<string, ShadowFeedbackArtifactV1>();
  const repository: ShadowFeedbackArtifactRepository = {
    async insert({ artifact }) {
      const fingerprint = artifact.key.keyFingerprint;
      const existing = rows.get(fingerprint);
      if (!existing) {
        rows.set(fingerprint, artifact);
        return "inserted";
      }
      return JSON.stringify(existing) === JSON.stringify(artifact)
        ? "duplicate"
        : "conflict";
    },
    async readExact(keyFingerprints) {
      return keyFingerprints.flatMap((fingerprint) => {
        const artifact = rows.get(fingerprint);
        return artifact ? [artifact] : [];
      });
    },
  };
  const store = createShadowFeedbackArtifactStore(repository);
  const gate = getShadowFeedbackArtifactStorageGate({
    MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE: "enabled",
  });
  const artifact = fixtureArtifact();

  assert.equal(
    await store.record(gate, { userId: USER_ID, artifact }),
    "inserted"
  );
  for (const replayKind of ["crash_retry", "event_replay", "reconnect"]) {
    assert.equal(
      await store.record(gate, { userId: USER_ID, artifact }),
      "duplicate",
      replayKind
    );
  }
  assert.equal(rows.size, 1);
});

test("a stale tuple cannot replace current data and exact reads fail closed", async () => {
  const current = fixtureArtifact();
  const corrupted = {
    ...current,
    contractVersion: "feedback.shadow-artifact.v0",
  };
  const repository: ShadowFeedbackArtifactRepository = {
    async insert() {
      return "conflict";
    },
    async readExact(keyFingerprints) {
      assert.deepEqual(keyFingerprints, [current.key.keyFingerprint]);
      return [corrupted];
    },
  };
  const store = createShadowFeedbackArtifactStore(repository);

  assert.equal((await store.readExact([current.key])).status, "invalid");
});

function fixtureArtifact(): ShadowFeedbackArtifactV1 {
  const key = createShadowFeedbackArtifactKey({
    sessionId: SESSION_ID,
    trustedBlockIdentity: {
      contractVersion: "trusted-answer-block-identity.v1",
      answerBlockId: "answer-block:0001",
      identity: `trusted-answer-block.v1:${"a".repeat(64)}`,
    },
    rubricVersion: "pm-feedback-rubric.v3",
    promptVersion: "feedback.prompt.dimension-coverage.v1",
    selectionSchemaVersion: "feedback.dimension-coverage.selection.v1",
    modelVersion: "synthetic-shadow-model.v1",
  });
  return {
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_VERSION,
    key,
    outcome: {
      state: "completed",
      roundType: "product_sense",
      mode: "coaching_review",
      dimensions: {
        structure: { score: null, facetCodes: [] },
        clarity: { score: null, facetCodes: [] },
        insight: { score: null, facetCodes: [] },
        communication: { score: null, facetCodes: [] },
        leadership: { score: null, facetCodes: [] },
      },
    },
    metrics: {
      durationMs: 800,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      totalTokens: null,
    },
    completedAt: "2026-08-14T10:00:00.000Z",
  };
}
