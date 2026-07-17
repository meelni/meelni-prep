import assert from "node:assert/strict";
import test from "node:test";

import { evaluationCalibrationCases } from "@meelni/test-fixtures";

import {
  CALIBRATION_MAX_SDK_RETRIES,
  CALIBRATION_OFFICIAL_OPENAI_ENDPOINT,
  CALIBRATION_PRICING_CONTRACT,
  CALIBRATION_REQUEST_TIMEOUT_MS,
  CALIBRATION_SERVICE_TIER,
  CalibrationSpendGuard,
} from "./calibration-budget";
import {
  assertCalibrationOpenAIEnvironment,
  assertCalibrationProviderRequestPolicy,
  createCalibrationOpenAIClient,
  createGuardedCalibrationFetch,
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
  assert.equal(client.timeout, CALIBRATION_REQUEST_TIMEOUT_MS);
  assert.equal(CALIBRATION_MAX_SDK_RETRIES, 0);
  assert.equal(CALIBRATION_PRICING_CONTRACT.maximumSdkRetries, 0);
  assert.equal(CALIBRATION_PRICING_CONTRACT.redirectPolicy, "error");
  assert.equal(CALIBRATION_PRICING_CONTRACT.requestTimeoutMs, 300_000);
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
      2_000,
      () => undefined
    )
  );
  assert.throws(
    () =>
      assertCalibrationProviderRequestPolicy("gpt-5.1", 2_000, () => undefined),
    /request_policy_mismatch/
  );
  assert.throws(
    () =>
      assertCalibrationProviderRequestPolicy(
        CALIBRATION_PRICING_CONTRACT.model,
        undefined,
        () => undefined
      ),
    /request_policy_mismatch/
  );
  assert.throws(
    () =>
      assertCalibrationProviderRequestPolicy(
        CALIBRATION_PRICING_CONTRACT.model,
        2_000,
        undefined
      ),
    /request_policy_mismatch/
  );
});

test("guarded transport validates authorization at actual fetch dispatch", async () => {
  const order: string[] = [];
  const guardedFetch = createGuardedCalibrationFetch(
    () => {
      order.push("authorize");
    },
    async (_input, init) => {
      order.push("dispatch");
      assert.equal(init?.redirect, "error");
      return new Response("{}", { status: 200 });
    }
  );

  await guardedFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    redirect: "follow",
  });
  assert.deepEqual(order, ["authorize", "dispatch"]);
});

test("concurrent guarded fetch re-entry dispatches exactly once", async () => {
  const fixture = evaluationCalibrationCases.find(
    ({ expectedCompletionState }) => expectedCompletionState === "full"
  )!;
  const guard = new CalibrationSpendGuard(
    CALIBRATION_PRICING_CONTRACT.model,
    new Date("2026-07-17T00:00:00.000Z")
  );
  const reservation = guard.reserve(fixture)!;
  let dispatches = 0;
  const guardedFetch = createGuardedCalibrationFetch(
    () => guard.assertPhysicalRequestAllowed(reservation),
    async () => {
      dispatches += 1;
      await Promise.resolve();
      return new Response("{}", { status: 200 });
    }
  );

  const results = await Promise.allSettled([
    guardedFetch("https://api.openai.com/v1/chat/completions"),
    guardedFetch("https://api.openai.com/v1/chat/completions"),
  ]);
  assert.equal(
    results.filter(({ status }) => status === "fulfilled").length,
    1
  );
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(dispatches, 1);
  assert.equal(guard.report().physicalRequestBoundaryAttempts, 2);
  assert.equal(guard.report().physicalHttpAttemptCeiling, 1);
  assert.equal(guard.report().stopReason, "physical_request_reentry");
});
