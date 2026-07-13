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
  FeedbackProviderInvocationError,
  assertCalibrationOpenAIEnvironment,
  assertCalibrationProviderRequestPolicy,
  createCalibrationOpenAIClient,
  createGuardedCalibrationFetch,
  getCalibrationProviderRequestFields,
  parseFeedbackProviderCompletion,
} from "./scorer";
import {
  FEEDBACK_PROVIDER_RESPONSE_FORMAT_VERSION,
  getFeedbackProviderResponseFormatContractHash,
  getFeedbackProviderResponseFormat,
  serializeFeedbackProviderResponseFormat,
} from "./provider-response-format";

const TEST_API_KEY = "test-only-key-that-never-leaves-process";
const TEST_TRANSCRIPT = [
  {
    eventId: "user-1",
    speaker: "user" as const,
    text: "I would start by choosing one priority caregiver segment.",
  },
];
const TEST_USAGE = {
  prompt_tokens: 100,
  completion_tokens: 100,
  total_tokens: 200,
};

function assertProviderFailure(
  run: () => unknown,
  expectedCode: FeedbackProviderInvocationError["code"],
  forbiddenText?: string
): void {
  assert.throws(run, (error) => {
    assert.ok(error instanceof FeedbackProviderInvocationError);
    assert.equal(error.code, expectedCode);
    if (forbiddenText) {
      assert.equal(String(error).includes(forbiddenText), false);
      assert.equal(JSON.stringify(error).includes(forbiddenText), false);
    }
    return true;
  });
}

test("provider completion parsing preserves only closed failure categories", () => {
  assertProviderFailure(
    () =>
      parseFeedbackProviderCompletion(
        {
          model: CALIBRATION_PRICING_CONTRACT.model,
          service_tier: "default",
          usage: TEST_USAGE,
          choices: [{ finish_reason: "stop", message: { content: null } }],
        },
        TEST_TRANSCRIPT,
        "full"
      ),
    "evaluation_provider_returned_no_content"
  );

  const malformed = "not-json-provider-body";
  assertProviderFailure(
    () =>
      parseFeedbackProviderCompletion(
        {
          model: CALIBRATION_PRICING_CONTRACT.model,
          service_tier: "default",
          usage: TEST_USAGE,
          choices: [{ finish_reason: "stop", message: { content: malformed } }],
        },
        TEST_TRANSCRIPT,
        "full"
      ),
    "evaluation_provider_returned_invalid_json",
    malformed
  );

  const invalidFeedback = JSON.stringify({
    schemaVersion: "feedback.v2",
    unexpectedProviderField: "must-not-leak",
  });
  assertProviderFailure(
    () =>
      parseFeedbackProviderCompletion(
        {
          model: CALIBRATION_PRICING_CONTRACT.model,
          service_tier: "default",
          usage: TEST_USAGE,
          choices: [
            { finish_reason: "stop", message: { content: invalidFeedback } },
          ],
        },
        TEST_TRANSCRIPT,
        "full"
      ),
    "evaluation_provider_returned_invalid_feedback",
    "must-not-leak"
  );
});

test("provider completion parsing distinguishes refusal and terminal finish categories", () => {
  const cases = [
    {
      message: {
        content: "partial-content-must-not-win",
        refusal: "raw-refusal-must-not-leak",
      },
      finish_reason: "stop" as const,
      code: "evaluation_provider_refused" as const,
      forbidden: "raw-refusal-must-not-leak",
    },
    {
      message: { content: "partial-json-must-not-be-parsed" },
      finish_reason: "length" as const,
      code: "evaluation_provider_incomplete" as const,
      forbidden: "partial-json-must-not-be-parsed",
    },
    {
      message: { content: null },
      finish_reason: "content_filter" as const,
      code: "evaluation_provider_content_filtered" as const,
    },
    {
      message: { content: null },
      finish_reason: "tool_calls" as const,
      code: "evaluation_provider_unexpected_finish" as const,
    },
  ];

  for (const fixture of cases) {
    assertProviderFailure(
      () =>
        parseFeedbackProviderCompletion(
          {
            model: CALIBRATION_PRICING_CONTRACT.model,
            service_tier: "default",
            usage: TEST_USAGE,
            choices: [fixture],
          },
          TEST_TRANSCRIPT,
          "full"
        ),
      fixture.code,
      fixture.forbidden
    );
  }

  for (const finish_reason of [undefined, null, "unknown_runtime_value"]) {
    assertProviderFailure(
      () =>
        parseFeedbackProviderCompletion(
          {
            model: CALIBRATION_PRICING_CONTRACT.model,
            service_tier: "default",
            usage: TEST_USAGE,
            choices: [
              {
                finish_reason,
                message: { content: "valid-looking-content-must-not-win" },
              },
            ],
          },
          TEST_TRANSCRIPT,
          "full"
        ),
      "evaluation_provider_unexpected_finish",
      "valid-looking-content-must-not-win"
    );
  }
});

test("missing usage remains the fail-closed accounting category before refusal content", () => {
  const secret = "raw-refusal-must-not-leak";
  assertProviderFailure(
    () =>
      parseFeedbackProviderCompletion(
        {
          model: CALIBRATION_PRICING_CONTRACT.model,
          service_tier: "default",
          choices: [
            {
              finish_reason: "stop",
              message: { content: null, refusal: secret },
            },
          ],
        },
        TEST_TRANSCRIPT,
        "full"
      ),
    "evaluation_provider_usage_missing",
    secret
  );
});

test("feedback provider requests a deterministic strict schema for the exact evaluation state", () => {
  assert.equal(
    FEEDBACK_PROVIDER_RESPONSE_FORMAT_VERSION,
    "feedback-provider-response-format.v1"
  );
  assert.equal(
    getFeedbackProviderResponseFormatContractHash(),
    "66605edf2b3cad146671f22afa656d9c01c9abea2e7475a68dbe21738c8e4073"
  );
  assert.equal(
    Buffer.byteLength(serializeFeedbackProviderResponseFormat("full"), "utf8"),
    2_424
  );
  assert.equal(
    Buffer.byteLength(
      serializeFeedbackProviderResponseFormat("partial"),
      "utf8"
    ),
    2_430
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
  assert.equal("modelVersion" in full.json_schema.schema.properties, false);
  assert.equal("overallScore" in full.json_schema.schema.properties, false);
  assert.equal(
    serializeFeedbackProviderResponseFormat("full"),
    serializeFeedbackProviderResponseFormat("full")
  );

  const assertClosedObjects = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(assertClosedObjects);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const record = value as Record<string, unknown>;
    if (record.type === "object") {
      const properties = record.properties as Record<string, unknown>;
      assert.equal(record.additionalProperties, false);
      assert.deepEqual(
        new Set(record.required as string[]),
        new Set(Object.keys(properties))
      );
    }
    Object.values(record).forEach(assertClosedObjects);
  };
  assertClosedObjects(full.json_schema.schema);
});

test("provider completion parsing preserves valid feedback and normalizes recommendation copy", () => {
  const result = parseFeedbackProviderCompletion(
    {
      model: CALIBRATION_PRICING_CONTRACT.model,
      service_tier: "default",
      usage: TEST_USAGE,
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              schemaVersion: "feedback.v2",
              promptVersion: "feedback.prompt.v2",
              rubricVersion: "pm-feedback-rubric.v2",
              evaluationState: "full",
              scores: {
                structure: 8,
                clarity: 7,
                insight: 7,
                communication: 8,
                leadership: 7,
              },
              strengths: [
                {
                  dimension: "structure",
                  observation: "Chooses a priority segment before ideation.",
                  transcriptRefs: ["user-1"],
                  evidence: [{ turnRef: "user-1", quote: "start by choosing" }],
                  nextStep: "Keep stating the segment decision first.",
                  rubricVersion: "pm-feedback-rubric.v2",
                  confidence: 0.9,
                },
              ],
              improvements: [
                {
                  dimension: "insight",
                  observation: "The segment needs a sharper unmet need.",
                  transcriptRefs: ["user-1"],
                  evidence: [
                    {
                      turnRef: "user-1",
                      quote: "priority caregiver segment",
                    },
                  ],
                  nextStep: "Name the unmet need that makes it a priority.",
                  rubricVersion: "pm-feedback-rubric.v2",
                  confidence: 0.8,
                },
              ],
              drills: ["Run a targeted drill using one caregiver scenario."],
              summary: "A clear start with room for deeper user insight.",
            }),
          },
        },
      ],
    },
    TEST_TRANSCRIPT,
    "full"
  );

  assert.equal(
    result.evaluation.modelVersion,
    CALIBRATION_PRICING_CONTRACT.model
  );
  assert.equal(result.evaluation.scores.structure, 8);
  assert.equal(
    result.evaluation.strengths[0]?.evidence[0]?.quote,
    "start by choosing"
  );
  assert.deepEqual(result.evaluation.drills, [
    "Run a targeted exercise using one caregiver scenario.",
  ]);
  assert.equal(result.observedServiceTier, "default");
  assert.deepEqual(result.usage, {
    inputTokens: 100,
    cachedInputTokens: 0,
    outputTokens: 100,
    totalTokens: 200,
  });
});

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
  assert.throws(
    () =>
      assertCalibrationProviderRequestPolicy(
        CALIBRATION_PRICING_CONTRACT.model,
        2_000,
        () => undefined
      ),
    /response_format_requires_new_authorized_plan/
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
    new Date(
      new Date(CALIBRATION_PRICING_CONTRACT.reviewedAt).getTime() +
        60 * 60 * 1_000
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
