import assert from "node:assert/strict";
import test from "node:test";

import {
  CALIBRATION_MAX_SDK_RETRIES,
  CALIBRATION_OFFICIAL_OPENAI_ENDPOINT,
  CALIBRATION_PRICING_CONTRACT,
  CALIBRATION_SERVICE_TIER,
} from "./calibration-budget";
import {
  assertCalibrationOpenAIEnvironment,
  assertCalibrationProviderRequestPolicy,
  createCalibrationOpenAIClient,
  getCalibrationProviderRequestFields,
} from "./scorer";

const TEST_API_KEY = "test-only-key-that-never-leaves-process";

test("paid calibration client pins official endpoint and disables SDK retries", () => {
  const client = createCalibrationOpenAIClient({
    OPENAI_API_KEY: TEST_API_KEY,
  });

  assert.equal(client.baseURL, CALIBRATION_OFFICIAL_OPENAI_ENDPOINT);
  assert.equal(client.maxRetries, 0);
  assert.equal(client.fetchOptions?.redirect, "error");
  assert.equal(CALIBRATION_MAX_SDK_RETRIES, 0);
  assert.equal(CALIBRATION_PRICING_CONTRACT.maximumSdkRetries, 0);
  assert.equal(CALIBRATION_PRICING_CONTRACT.redirectPolicy, "error");
  assert.equal(CALIBRATION_PRICING_CONTRACT.endpoint, client.baseURL);
  assert.equal(CALIBRATION_PRICING_CONTRACT.serviceTier, "default");
  assert.equal(CALIBRATION_SERVICE_TIER, "default");
  assert.deepEqual(getCalibrationProviderRequestFields(), {
    max_completion_tokens: 2_000,
    service_tier: "default",
  });
});

test("paid calibration rejects every ambient endpoint override", () => {
  for (const OPENAI_BASE_URL of [
    "",
    CALIBRATION_OFFICIAL_OPENAI_ENDPOINT,
    "https://proxy.example.invalid/v1",
  ]) {
    assert.throws(
      () =>
        assertCalibrationOpenAIEnvironment({
          OPENAI_API_KEY: TEST_API_KEY,
          OPENAI_BASE_URL,
        }),
      /rejects_ambient_openai_base_url/
    );
    assert.throws(
      () =>
        createCalibrationOpenAIClient({
          OPENAI_API_KEY: TEST_API_KEY,
          OPENAI_BASE_URL,
        }),
      /rejects_ambient_openai_base_url/
    );
  }
});

test("paid calibration client cannot be constructed without its direct key", () => {
  assert.throws(
    () => createCalibrationOpenAIClient({}),
    /OPENAI_API_KEY is required/
  );
});

test("paid request policy rejects an unpriced model or output ceiling", () => {
  assert.doesNotThrow(() =>
    assertCalibrationProviderRequestPolicy(
      CALIBRATION_PRICING_CONTRACT.model,
      2_000
    )
  );
  assert.throws(
    () => assertCalibrationProviderRequestPolicy("gpt-5.1", 2_000),
    /request_policy_mismatch/
  );
  assert.throws(
    () =>
      assertCalibrationProviderRequestPolicy(
        CALIBRATION_PRICING_CONTRACT.model,
        undefined
      ),
    /request_policy_mismatch/
  );
});
