import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeEvidenceQuoteToSource,
  prepareFeedbackTranscript,
} from "@meelni/core";
import { evaluationValidationFixtures } from "./evaluation-validation";

for (const fixture of evaluationValidationFixtures) {
  test(`evaluation validation fixture: ${fixture.name}`, () => {
    const prepared = prepareFeedbackTranscript(fixture.transcript, {
      requireContractV2: true,
    });
    assert.equal(prepared.eligible, fixture.expectedEligible);
    if (fixture.expectedDuplicateTurnsRemoved !== undefined) {
      assert.equal(
        prepared.duplicateTurnsRemoved,
        fixture.expectedDuplicateTurnsRemoved
      );
    }
    if (fixture.proposedQuote) {
      const source = prepared.transcript.find(
        (turn) => turn.eventId === fixture.proposedQuote!.eventId
      );
      assert.ok(source);
      assert.equal(
        normalizeEvidenceQuoteToSource(
          source.text,
          fixture.proposedQuote.quote
        ),
        fixture.proposedQuote.expectedExactQuote
      );
    }
  });
}
