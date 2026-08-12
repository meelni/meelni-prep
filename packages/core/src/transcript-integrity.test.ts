import assert from "node:assert/strict";
import test from "node:test";

import { classifyTranscriptInterruptionIntegrity } from "./transcript-integrity";

test("only a provider-unconfirmed interviewer prefix preserves candidate evidence", () => {
  assert.equal(
    classifyTranscriptInterruptionIntegrity({
      speaker: "interviewer",
      reason: "no_provider_confirmed_prefix",
    }),
    "preserve"
  );
  assert.equal(
    classifyTranscriptInterruptionIntegrity({
      speaker: "user",
      reason: "no_provider_confirmed_prefix",
    }),
    "degrade"
  );
  assert.equal(
    classifyTranscriptInterruptionIntegrity({
      speaker: "interviewer",
      reason: "canonicalization_failed",
    }),
    "degrade"
  );
  assert.equal(
    classifyTranscriptInterruptionIntegrity({
      speaker: "user",
      reason: "canonicalization_failed",
    }),
    "degrade"
  );
});
