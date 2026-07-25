import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCalibrationProviderPreflightReport,
  fetchOpenAIModel,
  parseCalibrationPricingContract,
} from "./check-calibration-provider-credential.mjs";

const freshNow = new Date("2026-07-24T18:00:00.000Z");
const source = `
export const CALIBRATION_OFFICIAL_OPENAI_ENDPOINT = "https://api.openai.com/v1";
export const CALIBRATION_SERVICE_TIER = "default";
export const CALIBRATION_PRICING_CONTRACT = {
  provider: "openai",
  model: "gpt-5.1-2025-11-13",
  endpoint: CALIBRATION_OFFICIAL_OPENAI_ENDPOINT,
  serviceTier: CALIBRATION_SERVICE_TIER,
  reviewedAt: "2026-07-25T17:20:00.000Z",
  reviewTtlHours: 24,
};
`;

test("parses the pinned calibration pricing contract without importing mutable runtime code", () => {
  assert.deepEqual(parseCalibrationPricingContract(source), {
    provider: "openai",
    model: "gpt-5.1-2025-11-13",
    endpoint: "https://api.openai.com/v1",
    serviceTier: "default",
    reviewedAt: "2026-07-25T17:20:00.000Z",
    reviewTtlHours: 24,
  });
});

test("provider preflight rejects ambient OpenAI env overrides before reading Keychain", async () => {
  let keychainRead = false;
  const report = await buildCalibrationProviderPreflightReport({
    now: freshNow,
    env: { OPENAI_BASE_URL: "https://api.openai.com/v1" },
    readKeychainPassword: async () => {
      keychainRead = true;
      return { ok: true, password: "sk-test-validshape" };
    },
    fetchModel: async () => ({ status: "ok", httpStatus: 200 }),
    budgetSourcePath: new URL(
      "../lib/evaluation/calibration-budget.ts",
      import.meta.url
    ).pathname,
  });

  assert.equal(keychainRead, false);
  assert.equal(report.readyForCalibrationProviderCall, false);
  assert.equal(report.diagnostic, "ambient_openai_environment_rejected");
});

test("provider preflight returns a redacted authentication failure", async () => {
  const report = await buildCalibrationProviderPreflightReport({
    now: freshNow,
    env: {},
    readKeychainPassword: async () => ({
      ok: true,
      password: "sk-secret12345",
    }),
    fetchModel: async () => ({
      status: "provider_authentication",
      httpStatus: 401,
    }),
    budgetSourcePath: new URL(
      "../lib/evaluation/calibration-budget.ts",
      import.meta.url
    ).pathname,
  });

  assert.equal(report.readyForCalibrationProviderCall, false);
  assert.equal(report.diagnostic, "provider_authentication");
  assert.equal(JSON.stringify(report).includes("sk-secret"), false);
});

test("provider preflight accepts a successful exact model lookup", async () => {
  const report = await buildCalibrationProviderPreflightReport({
    now: freshNow,
    env: {},
    readKeychainPassword: async () => ({
      ok: true,
      password: "sk-secret12345",
    }),
    fetchModel: async () => ({
      status: "ok",
      httpStatus: 200,
      model: "gpt-5.1-2025-11-13",
    }),
    budgetSourcePath: new URL(
      "../lib/evaluation/calibration-budget.ts",
      import.meta.url
    ).pathname,
  });

  assert.equal(report.readyForCalibrationProviderCall, true);
  assert.equal(report.diagnostic, "calibration_provider_ready");
});

test("fetchOpenAIModel maps 401 responses to provider authentication", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "nope" }), { status: 401 });
  try {
    assert.deepEqual(
      await fetchOpenAIModel({
        endpoint: "https://api.openai.com/v1",
        model: "gpt-5.1-2025-11-13",
        apiKey: "sk-secret12345",
        timeoutMs: 1_000,
      }),
      { status: "provider_authentication", httpStatus: 401 }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
