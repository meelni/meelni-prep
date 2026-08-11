import assert from "node:assert/strict";
import test from "node:test";

import {
  EVIDENCE_LIMITED_ACTION_CODES,
  EVIDENCE_LIMITED_IMPROVEMENT_SIGNAL_CODES,
  EVIDENCE_LIMITED_STRENGTH_SIGNAL_CODES,
  FEEDBACK_EVIDENCE_LIMITED_SELECTION_SCHEMA_VERSION,
} from "@meelni/core";

import {
  FEEDBACK_EVIDENCE_LIMITED_PROVIDER_RESPONSE_FORMAT_VERSION,
  getEvidenceLimitedProviderResponseFormat,
  getEvidenceLimitedProviderResponseFormatContractHash,
} from "./provider-response-format";

test("evidence-limited provider schema permits only closed selections and trusted refs", () => {
  assert.equal(
    FEEDBACK_EVIDENCE_LIMITED_PROVIDER_RESPONSE_FORMAT_VERSION,
    "feedback-evidence-limited-provider-response-format.v4"
  );
  assert.equal(
    getEvidenceLimitedProviderResponseFormatContractHash(),
    "1026f1af3ae29b4d0f0df384ff840964256f0627b6792f0e8e6f0254c7df703f"
  );

  const format = getEvidenceLimitedProviderResponseFormat([
    "turn_0001",
    "turn_0002",
  ]);
  const schema = format.json_schema.schema;
  assert.deepEqual(Object.keys(schema.properties), [
    "schemaVersion",
    "promptVersion",
    "rubricVersion",
    "evaluationState",
    "strengths",
    "improvements",
  ]);
  assert.deepEqual(schema.properties.schemaVersion.enum, [
    FEEDBACK_EVIDENCE_LIMITED_SELECTION_SCHEMA_VERSION,
  ]);
  assert.equal(schema.properties.strengths.minItems, 1);
  assert.equal(schema.properties.strengths.maxItems, 2);
  assert.equal(schema.properties.improvements.minItems, 1);
  assert.equal(schema.properties.improvements.maxItems, 2);
  assert.match(schema.properties.strengths.description, /Do not repeat/);
  assert.match(schema.properties.improvements.description, /across strengths/);

  const strength = schema.properties.strengths.items;
  const improvement = schema.properties.improvements.items;
  for (const item of [strength, improvement]) {
    assert.deepEqual(Object.keys(item.properties), [
      "signalCode",
      "actionCode",
      "transcriptRef",
    ]);
    assert.deepEqual(item.required, [
      "signalCode",
      "actionCode",
      "transcriptRef",
    ]);
    assert.equal(item.additionalProperties, false);
    assert.deepEqual(
      item.properties.actionCode.enum,
      EVIDENCE_LIMITED_ACTION_CODES
    );
    assert.deepEqual(item.properties.transcriptRef.enum, [
      "turn_0001",
      "turn_0002",
    ]);
  }
  assert.deepEqual(
    strength.properties.signalCode.enum,
    EVIDENCE_LIMITED_STRENGTH_SIGNAL_CODES
  );
  assert.deepEqual(
    improvement.properties.signalCode.enum,
    EVIDENCE_LIMITED_IMPROVEMENT_SIGNAL_CODES
  );
  assert.equal("summary" in schema.properties, false);
  assert.equal("observation" in strength.properties, false);
  assert.equal("nextStep" in strength.properties, false);
  assert.equal("quote" in strength.properties, false);
});

test("provider schema fails closed for empty, duplicate, or malformed refs", () => {
  assert.throws(() => getEvidenceLimitedProviderResponseFormat([]));
  assert.throws(() =>
    getEvidenceLimitedProviderResponseFormat(["turn_0001", "turn_0001"])
  );
  assert.throws(() => getEvidenceLimitedProviderResponseFormat([""]));
});
