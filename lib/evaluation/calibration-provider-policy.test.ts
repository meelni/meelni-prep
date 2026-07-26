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
  FeedbackProviderInvocationError,
  generateFeedbackWithUsage,
  getCalibrationProviderRequestFields,
} from "./scorer";
import {
  FEEDBACK_PROVIDER_RESPONSE_FORMAT_VERSION,
  getFeedbackProviderResponseFormat,
  getFeedbackProviderResponseFormatContractHash,
  serializeFeedbackProviderResponseFormat,
} from "./provider-response-format";
import {
  FEEDBACK_CALIBRATION_REQUEST_POLICY_VERSION,
  FEEDBACK_CALIBRATION_TEMPERATURE,
  getFeedbackCalibrationRequestPolicy,
  getFeedbackCalibrationRequestPolicyHash,
} from "./calibration-request-policy";

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
  const capture = () => undefined;
  assert.doesNotThrow(() =>
    assertCalibrationProviderRequestPolicy(
      CALIBRATION_PRICING_CONTRACT.model,
      2_000,
      () => undefined,
      capture
    )
  );
  assert.throws(
    () =>
      assertCalibrationProviderRequestPolicy(
        "gpt-5.1",
        2_000,
        () => undefined,
        capture
      ),
    /request_policy_mismatch/
  );
  assert.throws(
    () =>
      assertCalibrationProviderRequestPolicy(
        CALIBRATION_PRICING_CONTRACT.model,
        undefined,
        () => undefined,
        capture
      ),
    /request_policy_mismatch/
  );
  assert.throws(
    () =>
      assertCalibrationProviderRequestPolicy(
        CALIBRATION_PRICING_CONTRACT.model,
        2_000,
        undefined,
        capture
      ),
    /request_policy_mismatch/
  );
  assert.throws(
    () =>
      assertCalibrationProviderRequestPolicy(
        CALIBRATION_PRICING_CONTRACT.model,
        2_000,
        () => undefined,
        undefined
      ),
    /request_policy_mismatch/
  );
});

test("paid feedback uses a deterministic strict response schema", () => {
  assert.equal(
    FEEDBACK_PROVIDER_RESPONSE_FORMAT_VERSION,
    "feedback-provider-response-format.v8"
  );
  assert.equal(
    getFeedbackProviderResponseFormatContractHash(),
    "37956b0e0841dd1d38a87043f0db5095c3904aba98587e1bbd246ecb4ab4e95f"
  );
  assert.equal(
    Buffer.byteLength(serializeFeedbackProviderResponseFormat("full"), "utf8"),
    5_714
  );
  assert.equal(
    Buffer.byteLength(
      serializeFeedbackProviderResponseFormat("partial"),
      "utf8"
    ),
    5_720
  );
  const full = getFeedbackProviderResponseFormat("full");
  const partial = getFeedbackProviderResponseFormat("partial");
  assert.equal(full.type, "json_schema");
  assert.equal(full.json_schema.strict, true);
  assert.equal(full.json_schema.name, "meelni_feedback_v2_full");
  assert.equal(partial.json_schema.name, "meelni_feedback_v2_partial");
  assert.deepEqual(full.json_schema.schema.properties.evaluationState.enum, [
    "full",
  ]);
  assert.deepEqual(partial.json_schema.schema.properties.evaluationState.enum, [
    "partial",
  ]);
  assert.equal(full.json_schema.schema.properties.strengths.minItems, 2);
  assert.equal(full.json_schema.schema.properties.strengths.maxItems, 2);
  assert.equal(full.json_schema.schema.properties.improvements.minItems, 2);
  assert.equal(full.json_schema.schema.properties.improvements.maxItems, 2);
  const evidenceSchema =
    full.json_schema.schema.properties.strengths.items.properties.evidence
      .items;
  assert.match(
    evidenceSchema.description,
    /quote must be copied byte-for-byte from that same turn/
  );
  assert.match(
    evidenceSchema.properties.turnRef.description,
    /Copy one candidate turnRef alias exactly from transcriptRefs/
  );
  assert.match(
    evidenceSchema.properties.quote.description,
    /Do not paraphrase, summarize, normalize, add words, remove words/
  );
  assert.match(
    evidenceSchema.properties.quote.description,
    /do not reuse this same quote/
  );
  assert.match(
    evidenceSchema.properties.quote.description,
    /overlapping quote/
  );
  assert.match(
    evidenceSchema.properties.quote.description,
    /same source sentence\/line/
  );
  assert.match(
    evidenceSchema.properties.quote.description,
    /reserved evidence/
  );
  assert.match(
    evidenceSchema.properties.quote.description,
    /no other finding may cite/
  );
  assert.match(
    full.json_schema.schema.properties.strengths.items.properties.evidence
      .description,
    /Exactly one evidence entry/
  );
  assert.equal(
    full.json_schema.schema.properties.strengths.items.properties.evidence
      .minItems,
    1
  );
  assert.equal(
    full.json_schema.schema.properties.strengths.items.properties.evidence
      .maxItems,
    1
  );
  assert.match(
    full.json_schema.schema.properties.strengths.items.properties.evidence
      .description,
    /never duplicate, overlap, nest, extend, trim/
  );
  assert.match(
    full.json_schema.schema.properties.strengths.items.properties.evidence
      .description,
    /source sentence\/line/
  );
  assert.match(
    full.json_schema.schema.properties.strengths.items.properties.evidence
      .description,
    /Reserve this quote's source sentence or line/
  );
});

test("paid request policy pins every non-prompt provider control", () => {
  assert.equal(
    FEEDBACK_CALIBRATION_REQUEST_POLICY_VERSION,
    "feedback-calibration-request-policy.v1"
  );
  assert.equal(FEEDBACK_CALIBRATION_TEMPERATURE, 0.2);
  assert.deepEqual(getFeedbackCalibrationRequestPolicy(), {
    contractVersion: "feedback-calibration-request-policy.v1",
    provider: "openai",
    model: CALIBRATION_PRICING_CONTRACT.model,
    endpoint: "https://api.openai.com/v1",
    serviceTier: "default",
    temperature: 0.2,
    maxCompletionTokens: 2_000,
    maximumSdkRetries: 0,
    redirectPolicy: "error",
    requestTimeoutMs: 300_000,
    responseFormatVersion: "feedback-provider-response-format.v8",
    responseFormatHash:
      "37956b0e0841dd1d38a87043f0db5095c3904aba98587e1bbd246ecb4ab4e95f",
  });
  assert.equal(
    getFeedbackCalibrationRequestPolicyHash(),
    "9271e83b4b5eb5318c2422aca4bce31a794aacbfa695c49378538f4a862229ab"
  );
});

test("paid feedback dispatches the exact pinned request controls", async () => {
  const fixture = evaluationCalibrationCases.find(
    ({ expectedCompletionState }) => expectedCompletionState === "full"
  )!;
  let requestBody: Record<string, unknown> | undefined;
  await withMockOpenAIResponse(
    "not-json",
    [],
    async () => {
      await assert.rejects(
        generateFeedbackWithUsage(
          fixture.roundType,
          fixture.transcript,
          "full",
          {
            calibrationPaidMode: true,
            calibrationCredentials: { openaiApiKey: TEST_API_KEY },
            maxCompletionTokens: 2_000,
            beforePhysicalRequest: () => undefined,
            onRawSyntheticOutput: () => undefined,
          }
        ),
        /evaluation_provider_returned_invalid_json/
      );
    },
    async (input, init) => {
      const source =
        input instanceof Request
          ? await input.clone().text()
          : typeof init?.body === "string"
            ? init.body
            : "";
      requestBody = JSON.parse(source) as Record<string, unknown>;
    }
  );
  assert.equal(requestBody?.temperature, 0.2);
  assert.equal(requestBody?.max_completion_tokens, 2_000);
  assert.equal(requestBody?.service_tier, "default");
  assert.deepEqual(
    requestBody?.response_format,
    getFeedbackProviderResponseFormat("full")
  );
});

test("paid feedback captures exact bytes before rejecting invalid JSON", async () => {
  const fixture = evaluationCalibrationCases.find(
    ({ expectedCompletionState }) => expectedCompletionState === "full"
  )!;
  const order: string[] = [];
  await withMockOpenAIResponse("not-json", order, async () => {
    await assert.rejects(
      generateFeedbackWithUsage(fixture.roundType, fixture.transcript, "full", {
        calibrationPaidMode: true,
        calibrationCredentials: { openaiApiKey: TEST_API_KEY },
        maxCompletionTokens: 2_000,
        beforePhysicalRequest: () => {
          order.push("authorize");
        },
        onRawSyntheticOutput: (rawResponse) => {
          order.push(`capture:${Buffer.from(rawResponse).toString("utf8")}`);
        },
      }),
      (error) => {
        assert.ok(error instanceof FeedbackProviderInvocationError);
        assert.equal(error.code, "evaluation_provider_returned_invalid_json");
        assert.deepEqual(error.usage, expectedUsage());
        return true;
      },
      "invalid JSON must be rejected only after exact capture"
    );
  });
  assert.deepEqual(order, ["authorize", "dispatch", "capture:not-json"]);
});

test("capture failure preserves usage and performs no provider retry", async () => {
  const fixture = evaluationCalibrationCases.find(
    ({ expectedCompletionState }) => expectedCompletionState === "full"
  )!;
  const order: string[] = [];
  await withMockOpenAIResponse("{}", order, async () => {
    await assert.rejects(
      generateFeedbackWithUsage(fixture.roundType, fixture.transcript, "full", {
        calibrationPaidMode: true,
        calibrationCredentials: { openaiApiKey: TEST_API_KEY },
        maxCompletionTokens: 2_000,
        beforePhysicalRequest: () => {
          order.push("authorize");
        },
        onRawSyntheticOutput: () => {
          order.push("capture");
          throw new Error("capture unavailable");
        },
      }),
      (error) => {
        assert.ok(error instanceof FeedbackProviderInvocationError);
        assert.equal(error.code, "evaluation_private_capture_failed");
        assert.deepEqual(error.usage, expectedUsage());
        assert.equal(error.observedModel, CALIBRATION_PRICING_CONTRACT.model);
        assert.equal(error.observedServiceTier, "default");
        return true;
      }
    );
  });
  assert.deepEqual(order, ["authorize", "dispatch", "capture"]);
});

test("provider HTTP errors become bounded invocation diagnostics", async () => {
  const fixture = evaluationCalibrationCases.find(
    ({ expectedCompletionState }) => expectedCompletionState === "full"
  )!;
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.OPENAI_FEEDBACK_MODEL;
  const providerControlledMessage =
    "provider-controlled-message-must-not-survive";
  const order: string[] = [];
  process.env.OPENAI_FEEDBACK_MODEL = CALIBRATION_PRICING_CONTRACT.model;
  globalThis.fetch = async () => {
    order.push("dispatch");
    return new Response(
      JSON.stringify({
        error: {
          message: providerControlledMessage,
          type: "invalid_request_error",
          code: "invalid_request_error",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  };

  try {
    await assert.rejects(
      generateFeedbackWithUsage(fixture.roundType, fixture.transcript, "full", {
        calibrationPaidMode: true,
        calibrationCredentials: { openaiApiKey: TEST_API_KEY },
        maxCompletionTokens: 2_000,
        beforePhysicalRequest: () => {
          order.push("authorize");
        },
        onRawSyntheticOutput: () => undefined,
      }),
      (error) => {
        assert.ok(error instanceof FeedbackProviderInvocationError);
        assert.equal(error.code, "evaluation_provider_invocation_failed");
        assert.deepEqual(error.diagnostic, {
          kind: "provider_bad_request",
          httpStatus: 400,
        });
        assert.equal(error.usage, undefined);
        assert.equal(
          JSON.stringify(error.diagnostic).includes(providerControlledMessage),
          false
        );
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel === undefined) {
      delete process.env.OPENAI_FEEDBACK_MODEL;
    } else {
      process.env.OPENAI_FEEDBACK_MODEL = originalModel;
    }
  }
  assert.deepEqual(order, ["authorize", "dispatch"]);
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
    new Date(
      new Date(CALIBRATION_PRICING_CONTRACT.reviewedAt).getTime() + 60_000
    )
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

async function withMockOpenAIResponse(
  content: string,
  order: string[],
  run: () => Promise<void>,
  onRequest?: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => void | Promise<void>
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.OPENAI_FEEDBACK_MODEL;
  process.env.OPENAI_FEEDBACK_MODEL = CALIBRATION_PRICING_CONTRACT.model;
  globalThis.fetch = async (input, init) => {
    order.push("dispatch");
    await onRequest?.(input, init);
    return new Response(
      JSON.stringify({
        id: "chatcmpl_synthetic_test",
        object: "chat.completion",
        created: 1_784_404_000,
        model: CALIBRATION_PRICING_CONTRACT.model,
        service_tier: "default",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content, refusal: null },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 3,
          total_tokens: 13,
          prompt_tokens_details: { cached_tokens: 2 },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel === undefined) {
      delete process.env.OPENAI_FEEDBACK_MODEL;
    } else {
      process.env.OPENAI_FEEDBACK_MODEL = originalModel;
    }
  }
}

function expectedUsage() {
  return {
    inputTokens: 10,
    cachedInputTokens: 2,
    outputTokens: 3,
    totalTokens: 13,
  };
}
