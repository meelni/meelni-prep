import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_EVIDENCE_LIMITED_PROVIDER_RESPONSE_FORMAT_VERSION,
  getEvidenceLimitedProviderResponseFormat,
  getEvidenceLimitedProviderResponseFormatContractHash,
} from "./provider-response-format";

test("evidence-limited provider schema separates numeric-free narrative from exact evidence", () => {
  assert.equal(
    FEEDBACK_EVIDENCE_LIMITED_PROVIDER_RESPONSE_FORMAT_VERSION,
    "feedback-evidence-limited-provider-response-format.v2"
  );
  assert.equal(
    getEvidenceLimitedProviderResponseFormatContractHash(),
    "9add0579b61f644d8b46ba2ab1e5e9d72096fc403d810cab029d931d7821becf"
  );

  const format = getEvidenceLimitedProviderResponseFormat();
  const properties =
    format.json_schema.schema.properties.strengths.items.properties;
  assert.match(properties.observation.description, /Do not include digits/);
  assert.match(properties.nextStep.description, /English number words/);
  assert.match(
    format.json_schema.schema.properties.summary.description,
    /exact values belong only in the grounded evidence quote/
  );
  assert.match(
    properties.evidence.items.properties.quote.description,
    /may contain quantitative values/
  );
});
