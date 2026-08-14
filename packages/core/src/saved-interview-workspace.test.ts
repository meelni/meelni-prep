import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyFrozenFeedbackTranscriptReadiness,
  decodeSavedInterviewWorkspace,
  SAVED_INTERVIEW_WORKSPACE_VERSION,
} from "./saved-interview-workspace";
import { decodeFeedbackLifecycleResponse } from "./feedback-view-model";

const WORKSPACE = {
  version: SAVED_INTERVIEW_WORKSPACE_VERSION,
  saved: true,
  roundType: "product_sense",
  question: {
    text: "How would you improve a synthetic planning product?",
    company: "Synthetic Co",
  },
  frozenTranscript: "ready",
} as const;

test("decodes the closed saved-interview workspace projection", () => {
  assert.deepEqual(decodeSavedInterviewWorkspace(WORKSPACE), WORKSPACE);
  assert.deepEqual(
    decodeFeedbackLifecycleResponse({
      status: "processing",
      retryable: false,
      delayed: false,
      workspace: WORKSPACE,
    }),
    {
      status: "processing",
      retryable: false,
      delayed: false,
      workspace: WORKSPACE,
    }
  );
});

test("rejects identity, transcript, and operational fields in the workspace", () => {
  for (const forbidden of [
    { sessionId: "550e8400-e29b-41d4-a716-446655440000" },
    { transcript: "synthetic transcript content" },
    { providerStatus: "synthetic-provider-failure" },
    { generationEventId: "feedback/generate.requested:synthetic" },
  ]) {
    assert.equal(
      decodeSavedInterviewWorkspace({ ...WORKSPACE, ...forbidden }),
      null
    );
  }
});

test("rejects unsupported or unbounded saved-interview workspace values", () => {
  assert.equal(
    decodeSavedInterviewWorkspace({ ...WORKSPACE, version: "workspace.v2" }),
    null
  );
  assert.equal(
    decodeSavedInterviewWorkspace({ ...WORKSPACE, roundType: "unsupported" }),
    null
  );
  assert.equal(
    decodeSavedInterviewWorkspace({
      ...WORKSPACE,
      question: { ...WORKSPACE.question, text: "x".repeat(2_001) },
    }),
    null
  );
  assert.equal(
    decodeFeedbackLifecycleResponse({
      status: "settling",
      retryable: false,
      workspace: { ...WORKSPACE, frozenTranscript: "mutable" },
    }),
    null
  );
});

test("allows missing historical question context without weakening the contract", () => {
  assert.deepEqual(
    decodeSavedInterviewWorkspace({ ...WORKSPACE, question: null }),
    { ...WORKSPACE, question: null }
  );
  assert.deepEqual(
    decodeSavedInterviewWorkspace({
      ...WORKSPACE,
      question: { ...WORKSPACE.question, company: null },
    }),
    { ...WORKSPACE, question: { ...WORKSPACE.question, company: null } }
  );
});

test("frozen transcript readiness requires ordered finite terminal evidence", () => {
  const terminalEvidence = {
    lifecycleState: "completed",
    transcriptEvidenceVersion: 1,
    transcriptEvidenceState: "complete",
    transcriptCutoffAt: new Date("2026-08-14T08:00:00.000Z"),
    transcriptEvidenceFrozenAt: new Date("2026-08-14T08:00:01.000Z"),
  };
  assert.equal(
    classifyFrozenFeedbackTranscriptReadiness(terminalEvidence),
    "ready"
  );
  assert.equal(
    classifyFrozenFeedbackTranscriptReadiness({
      ...terminalEvidence,
      transcriptEvidenceFrozenAt: new Date("2026-08-14T07:59:59.999Z"),
    }),
    "unavailable"
  );
  assert.equal(
    classifyFrozenFeedbackTranscriptReadiness({
      ...terminalEvidence,
      transcriptCutoffAt: new Date(Number.NaN),
    }),
    "unavailable"
  );
  assert.equal(
    classifyFrozenFeedbackTranscriptReadiness({
      ...terminalEvidence,
      lifecycleState: "ending",
    }),
    "not_ready"
  );
  assert.equal(
    classifyFrozenFeedbackTranscriptReadiness({
      ...terminalEvidence,
      transcriptEvidenceVersion: null,
      transcriptCutoffAt: null,
      transcriptEvidenceFrozenAt: null,
    }),
    "ready"
  );
});
