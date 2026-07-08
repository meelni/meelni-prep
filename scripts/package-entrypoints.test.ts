import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterviewRoomMetadata,
  createTranscriptEvent,
} from "@meelni/agent";
import {
  buildFullConfig,
  calculateOverallScore,
  computeCreditEntitlements,
  getBillingCatalogItem,
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
    buildInterviewRoomMetadata(fixture.roomMetadata).round_type,
    "product_sense"
  );
  assert.equal(
    createTranscriptEvent({ speaker: "user", text: "Hi" }).speaker,
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
  assert.equal(typeof agent.buildInterviewRoomMetadata, "function");
  assert.equal(typeof agent.createTranscriptEvent, "function");
  assert.equal(typeof integrations.buildInterviewRoomName, "function");
  assert.equal(typeof integrations.getLiveKitEnvironment, "function");
});
