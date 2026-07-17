import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildInterviewRoomMetadata,
  createTranscriptEvent,
} from "@meelni/agent";
import {
  buildFullConfig,
  calculateOverallScore,
  computeCreditEntitlements,
  DRILL_TEMPLATE_VERSION,
  getBillingCatalogItem,
  recommendDrill,
} from "@meelni/core";
import {
  buildInterviewRoomName,
  getLiveKitEnvironment,
  providerFailure,
} from "@meelni/integrations";
import { createProductSenseInterviewFixture } from "@meelni/test-fixtures";

test("workspace package entrypoints expose named contracts", () => {
  const fixture = createProductSenseInterviewFixture();

  assert.equal(
    buildFullConfig({ roundType: "product_sense", difficulty: "intermediate" })
      .duration,
    45
  );
  const trial = getBillingCatalogItem("trial");
  assert.equal(trial.includedCredits, 2);

  const entitlements = computeCreditEntitlements({
    activeOffer: "trial",
    billingStatus: "trialing",
    remainingCredits: 1,
    nextCreditExpiresAt: null,
    trialAvailable: false,
  });
  assert.equal(entitlements.canStartInterview, true);
  assert.equal(
    calculateOverallScore({
      clarity: 8,
      communication: 7,
      insight: 9,
      leadership: 7,
      structure: 8,
    }),
    8
  );
  assert.equal(
    recommendDrill({
      roundType: "product_sense",
      sourceState: "insufficient",
      templateVersion: DRILL_TEMPLATE_VERSION,
      feedback: null,
    }).state,
    "unavailable"
  );
  assert.equal(
    buildInterviewRoomMetadata(fixture.roomMetadata).round_type,
    "product_sense"
  );
  assert.equal(
    createTranscriptEvent({
      event_id: "event-1",
      writer_id: "writer-1",
      writer_generation: 1,
      sequence: 1,
      session_id: "session-1",
      room_name: "room-1",
      speaker: "user",
      text: "Hi",
      started_at: "2026-07-10T05:00:00.000Z",
      ended_at: "2026-07-10T05:00:01.000Z",
      audio_duration_ms: 1000,
      section: "prompt",
      delivery_state: "delivered",
    }).speaker,
    "user"
  );
  assert.match(
    buildInterviewRoomName({ now: 1782600000000, random: () => 0.5 }),
    /^interview-/
  );
  assert.equal(getLiveKitEnvironment({}).ok, false);
  assert.equal(
    providerFailure("livekit", {
      code: "x",
      message: "x",
      retryable: false,
    }).ok,
    false
  );
});

test("workspace package entrypoints expose named contracts to dynamic imports", async () => {
  const core = await import("@meelni/core");
  const agent = await import("@meelni/agent");
  const integrations = await import("@meelni/integrations");

  assert.equal(typeof core.buildFullConfig, "function");
  assert.equal(typeof core.calculateOverallScore, "function");
  assert.equal(typeof core.recommendDrill, "function");
  assert.equal(typeof agent.buildInterviewRoomMetadata, "function");
  assert.equal(typeof agent.createTranscriptEvent, "function");
  assert.equal(typeof integrations.buildInterviewRoomName, "function");
  assert.equal(typeof integrations.getLiveKitEnvironment, "function");
});

test("server transcript persistence has no direct mutation bypass", async () => {
  const source = await readFile(
    new URL("../lib/db/transcripts.ts", import.meta.url),
    "utf8"
  );

  for (const forbiddenExport of [
    "createTranscriptTurn",
    "updateTranscriptTurn",
    "deleteTranscriptTurn",
    "batchCreateTranscriptTurns",
    "CreateTranscriptTurnInput",
    "UpdateTranscriptTurnInput",
  ]) {
    assert.doesNotMatch(
      source,
      new RegExp(`export\\s+(?:async\\s+function|interface)\\s+${forbiddenExport}\\b`)
    );
  }

  assert.match(source, /export function createDrizzleTranscriptIngestStore\b/);
  assert.match(source, /export async function getSessionTranscript\b/);
  assert.match(source, /export async function getSessionTranscriptStats\b/);
});

test("session finalization has no caller-supplied validation bypass", async () => {
  const [databaseSource, workflowSource] = await Promise.all([
    readFile(
      new URL("../lib/db/end-interview-session.ts", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../lib/workflows/end-interview-session.ts", import.meta.url),
      "utf8"
    ),
  ]);

  assert.doesNotMatch(databaseSource, /validationOverride/);
  assert.doesNotMatch(databaseSource, /runtimeSettlementState/);
  assert.doesNotMatch(workflowSource, /validationOverride/);
  assert.doesNotMatch(
    workflowSource,
    /export async function (?:end|settle)InterviewSessionWithValidationWorkflow\b/
  );
  assert.match(
    databaseSource,
    /const validation = applyTranscriptIntegrityValidation\(/
  );
});
