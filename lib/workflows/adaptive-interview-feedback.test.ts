import assert from "node:assert/strict";
import test from "node:test";

import { toFeedbackCustomerProjection } from "@meelni/core";
import { createAdaptiveFeedbackRegressionFixtures } from "@meelni/test-fixtures/adaptive-feedback";

import { runFeedbackProductionScenario } from "./feedback-production-scenario";

test("adaptive fixtures converge through the provider-free production-shaped batch workflow", async () => {
  for (const fixture of createAdaptiveFeedbackRegressionFixtures()) {
    for (const [variant, scenario, expected] of [
      ["current", fixture.current, fixture.expected.current],
      ["adaptive", fixture.adaptive, fixture.expected.adaptive],
    ] as const) {
      const first = await runFeedbackProductionScenario(scenario);
      const replay = await runFeedbackProductionScenario(scenario);
      assert.deepEqual(replay, first, `${fixture.id}:${variant}:replay`);
      assert.equal(first.executionMode, "deterministic_provider_free");
      const customerBytes = JSON.stringify(first.lifecycle);
      for (const sentinel of fixture.runtimeOnly.sentinels) {
        assert.equal(
          customerBytes.includes(sentinel),
          false,
          `${fixture.id}:${variant}:${sentinel}`
        );
      }

      if (expected.outcome === "unable_to_review") {
        assert.equal(first.lifecycle.status, "skipped", fixture.id);
        const customer = toFeedbackCustomerProjection(first.lifecycle);
        assert.ok(customer, `${fixture.id}:${variant}:customer-projection`);
        assert.equal(customer.outcome, "unable_to_review");
        assert.equal(first.replay.dispatch, "not_required");
        assert.equal(first.replay.generation, "not_required");
        assert.equal(first.replay.persistenceWrites, 0);
        continue;
      }

      assert.equal(first.lifecycle.status, "completed", fixture.id);
      const customer = toFeedbackCustomerProjection(first.lifecycle);
      assert.ok(customer, `${fixture.id}:${variant}:customer-projection`);
      assert.equal(customer.outcome, expected.outcome, fixture.id);
      if (customer.outcome === "scorecard") {
        assert.equal(customer.review.kind, "dimension-coverage");
        assert.equal(customer.review.outcome, "scorecard");
        assert.equal(customer.review.scoreWithheldReason, null);
        assert.equal(customer.review.verifiedScope, null);
        assert.equal(Object.keys(customer.review.dimensions).length, 5);
        assert.equal(
          Object.values(customer.review.scores).every(Number.isFinite),
          true,
          `${fixture.id}:${variant}:complete-scorecard`
        );
      } else {
        assert.equal(customer.outcome, "coaching_review");
        assert.equal(customer.review.kind, "dimension-coverage");
        assert.equal(customer.review.outcome, "coaching_review");
        assert.notEqual(customer.review.scoreWithheldReason, null);
        assert.equal(
          "scores" in customer.review,
          false,
          `${fixture.id}:${variant}:scores-withheld`
        );
      }
      assert.equal(first.replay.dispatch, "already_sent");
      assert.equal(first.replay.generation, "already_terminal");
      assert.equal(first.replay.persistenceWrites, 1);
    }
  }
});
