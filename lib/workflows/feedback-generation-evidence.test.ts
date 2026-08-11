import assert from "node:assert/strict";
import test from "node:test";

import { SessionTier } from "@/lib/evaluation/session-validator";
import {
  resolveFeedbackGenerationEligibility,
  resolveFeedbackLateValidationSkip,
} from "./feedback-generation-evidence";

for (const tier of [SessionTier.FULL, SessionTier.PARTIAL]) {
  test(`committed ${tier} eligibility is consumed without revalidation`, () => {
    assert.deepEqual(resolveFeedbackGenerationEligibility(tier), {
      disposition: "committed_eligible",
      tier,
    });
  });
}

for (const tier of [SessionTier.INSUFFICIENT, SessionTier.ABANDONED]) {
  test(`committed ${tier} outcome cannot be promoted by the worker`, () => {
    assert.deepEqual(resolveFeedbackGenerationEligibility(tier), {
      disposition: "committed_ineligible",
      tier,
    });
  });
}

test("only pre-0007 feedback falls back to legacy validation", () => {
  assert.deepEqual(resolveFeedbackGenerationEligibility(null), {
    disposition: "legacy_requires_validation",
    tier: null,
  });
});

for (const completionTier of [SessionTier.FULL, SessionTier.PARTIAL]) {
  test(`late transcript rejection preserves committed ${completionTier} eligibility`, () => {
    const record: {
      status: string;
      statusReason: string | null;
      completionTier: SessionTier;
    } = {
      status: "processing",
      statusReason: null,
      completionTier,
    };

    Object.assign(
      record,
      resolveFeedbackLateValidationSkip("transcript_integrity_degraded")
    );

    assert.deepEqual(record, {
      status: "skipped",
      statusReason: "transcript_integrity_degraded",
      completionTier,
    });
  });
}
