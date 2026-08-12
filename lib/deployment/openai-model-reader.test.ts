import assert from "node:assert/strict";
import test from "node:test";

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from "openai";

import { createOpenAiModelReader } from "@/lib/deployment/openai-model-reader";
import {
  OpenAiModelAccessError,
  type OpenAiModelAccessFailureClass,
} from "@/lib/deployment/openai-model-access";

const MODEL = "gpt-5.1";

test("a successful model read completes on the first attempt", async () => {
  let attempts = 0;
  const reader = createTestReader(async () => {
    attempts += 1;
  });

  await reader.verifyModelAccess(MODEL);

  assert.equal(attempts, 1);
});

test("a retryable connection failure retries once and then succeeds", async () => {
  let attempts = 0;
  const reader = createTestReader(async () => {
    attempts += 1;
    if (attempts === 1) throw new APIConnectionError({});
  });

  await reader.verifyModelAccess(MODEL);

  assert.equal(attempts, 2);
});

test("a retryable timeout retries once and then succeeds", async () => {
  let attempts = 0;
  const reader = createTestReader(async () => {
    attempts += 1;
    if (attempts === 1) throw new APIConnectionTimeoutError();
  });

  await reader.verifyModelAccess(MODEL);

  assert.equal(attempts, 2);
});

test("the production default waits exactly 250 milliseconds before retrying", async () => {
  let attempts = 0;
  const observedDelays: number[] = [];
  const reader = createOpenAiModelReader("test-key", {
    retrieveModel: async () => {
      attempts += 1;
      if (attempts === 1) throw new APIConnectionError({});
    },
    sleep: async (delayMs) => {
      observedDelays.push(delayMs);
    },
  });
  assert.ok(reader);

  await reader.verifyModelAccess(MODEL);

  assert.equal(attempts, 2);
  assert.deepEqual(observedDelays, [250]);
});

for (const status of [429, 500, 502, 503, 504] as const) {
  test(`HTTP ${status} retries once and then succeeds`, async () => {
    let attempts = 0;
    const reader = createTestReader(async () => {
      attempts += 1;
      if (attempts === 1) throw statusError(status);
    });

    await reader.verifyModelAccess(MODEL);

    assert.equal(attempts, 2);
  });

  test(`HTTP ${status} exhaustion reports its fixed retryable class`, async () => {
    let attempts = 0;
    const reader = createTestReader(async () => {
      attempts += 1;
      throw statusError(status);
    });

    await assertFailureClass(
      reader.verifyModelAccess(MODEL),
      status === 429 ? "rate_limited" : "provider_unavailable"
    );
    assert.equal(attempts, 2);
  });
}

test("retry exhaustion reports only the fixed transport class", async () => {
  let attempts = 0;
  const reader = createTestReader(async () => {
    attempts += 1;
    throw new APIConnectionError({});
  });

  await assertFailureClass(reader.verifyModelAccess(MODEL), "transport");
  assert.equal(attempts, 2);
});

test("a recognized transient rate-limit code retries once", async () => {
  let attempts = 0;
  const reader = createTestReader(async () => {
    attempts += 1;
    if (attempts === 1) {
      throw statusError(429, "rate_limit_exceeded");
    }
  });

  await reader.verifyModelAccess(MODEL);

  assert.equal(attempts, 2);
});

test("an exhausted account quota is terminal without retry", async () => {
  let attempts = 0;
  const reader = createTestReader(async () => {
    attempts += 1;
    throw statusError(429, "insufficient_quota");
  });

  await assertFailureClass(reader.verifyModelAccess(MODEL), "quota_exhausted");
  assert.equal(attempts, 1);
});

test("an unknown rate-limit code fails closed without retry or raw output", async () => {
  let attempts = 0;
  const reader = createTestReader(async () => {
    attempts += 1;
    throw statusError(429, "unrecognized_provider_code");
  });

  await assertFailureClass(reader.verifyModelAccess(MODEL), "unknown");
  assert.equal(attempts, 1);
});

test("a malformed rate-limit code fails closed without retry", async () => {
  let attempts = 0;
  const reader = createTestReader(async () => {
    attempts += 1;
    throw statusError(429, 42);
  });

  await assertFailureClass(reader.verifyModelAccess(MODEL), "unknown");
  assert.equal(attempts, 1);
});

for (const [status, failureClass] of [
  [401, "authentication"],
  [403, "authorization"],
  [404, "model_not_found"],
] as const) {
  test(`HTTP ${status} fails immediately with a fixed terminal class`, async () => {
    let attempts = 0;
    const reader = createTestReader(async () => {
      attempts += 1;
      throw statusError(status);
    });

    await assertFailureClass(reader.verifyModelAccess(MODEL), failureClass);
    assert.equal(attempts, 1);
  });
}

for (const status of [400, 409, 422] as const) {
  test(`non-retryable HTTP ${status} fails closed once as unknown`, async () => {
    let attempts = 0;
    const reader = createTestReader(async () => {
      attempts += 1;
      throw statusError(status);
    });

    await assertFailureClass(reader.verifyModelAccess(MODEL), "unknown");
    assert.equal(attempts, 1);
  });
}

test("an eligible retry followed by a terminal failure reports the terminal class", async () => {
  let attempts = 0;
  const reader = createTestReader(async () => {
    attempts += 1;
    throw attempts === 1 ? statusError(503) : statusError(401);
  });

  await assertFailureClass(reader.verifyModelAccess(MODEL), "authentication");
  assert.equal(attempts, 2);
});

test("an unknown error fails closed without retrying", async () => {
  let attempts = 0;
  const reader = createTestReader(async () => {
    attempts += 1;
    throw new Error("provider material must not cross the adapter");
  });

  await assertFailureClass(reader.verifyModelAccess(MODEL), "unknown");
  assert.equal(attempts, 1);
});

test("a status-shaped non-SDK error is unknown and does not retry", async () => {
  let attempts = 0;
  const reader = createTestReader(async () => {
    attempts += 1;
    throw { status: 503 };
  });

  await assertFailureClass(reader.verifyModelAccess(MODEL), "unknown");
  assert.equal(attempts, 1);
});

test("classification never reads sensitive SDK error fields", async () => {
  let attempts = 0;
  const forbiddenFields = new Set([
    "message",
    "error",
    "headers",
    "requestID",
    "code",
    "type",
  ]);
  const providerError = new Proxy(statusError(503), {
    get(target, property, receiver) {
      if (typeof property === "string" && forbiddenFields.has(property)) {
        throw new Error(`forbidden provider field read: ${property}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const reader = createTestReader(async () => {
    attempts += 1;
    if (attempts === 1) throw providerError;
  });

  await reader.verifyModelAccess(MODEL);

  assert.equal(attempts, 2);
});

test("quota classification reads only status and the closed code discriminator", async () => {
  let attempts = 0;
  const forbiddenFields = new Set([
    "message",
    "error",
    "headers",
    "requestID",
    "param",
    "type",
  ]);
  const providerError = new Proxy(statusError(429, "insufficient_quota"), {
    get(target, property, receiver) {
      if (typeof property === "string" && forbiddenFields.has(property)) {
        throw new Error(`forbidden provider field read: ${property}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const reader = createTestReader(async () => {
    attempts += 1;
    throw providerError;
  });

  await assertFailureClass(reader.verifyModelAccess(MODEL), "quota_exhausted");

  assert.equal(attempts, 1);
});

test("ambient OpenAI routing and logging settings cannot redirect or log the model read", async () => {
  const ambientNames = [
    "OPENAI_BASE_URL",
    "OPENAI_LOG",
    "OPENAI_ORG_ID",
    "OPENAI_PROJECT_ID",
    "OPENAI_WEBHOOK_SECRET",
  ] as const;
  const originalValues = new Map(
    ambientNames.map((name) => [name, process.env[name]])
  );
  process.env.OPENAI_BASE_URL = "https://alternate.invalid/v1";
  process.env.OPENAI_LOG = "info";
  process.env.OPENAI_ORG_ID = "ambient-org";
  process.env.OPENAI_PROJECT_ID = "ambient-project";
  process.env.OPENAI_WEBHOOK_SECRET = "ambient-webhook";

  const requests: Request[] = [];
  const logEntries: unknown[][] = [];
  const recordLog = (...values: unknown[]) => {
    logEntries.push(values);
  };

  try {
    const reader = createOpenAiModelReader("test-key", {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(
          JSON.stringify({
            created: 0,
            id: MODEL,
            object: "model",
            owned_by: "openai",
          }),
          {
            headers: {
              "content-type": "application/json",
              "x-request-id": "synthetic-request-id",
            },
            status: 200,
          }
        );
      },
      logger: {
        debug: recordLog,
        error: recordLog,
        info: recordLog,
        warn: recordLog,
      },
    });
    assert.ok(reader);

    await reader.verifyModelAccess(MODEL);

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "https://api.openai.com/v1/models/gpt-5.1");
    assert.equal(requests[0]?.headers.get("authorization"), "Bearer test-key");
    assert.equal(requests[0]?.headers.get("openai-organization"), null);
    assert.equal(requests[0]?.headers.get("openai-project"), null);
    assert.deepEqual(logEntries, []);
  } finally {
    for (const [name, value] of originalValues) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("two hung attempts remain inside the explicit overall budget", async () => {
  let attempts = 0;
  const startedAt = Date.now();
  const reader = createOpenAiModelReader("test-key", {
    attemptTimeoutMs: 10,
    overallTimeoutMs: 40,
    retrieveModel: async () => {
      attempts += 1;
      await new Promise(() => undefined);
    },
    retryDelayMs: 1,
    sleep: async () => undefined,
  });
  assert.ok(reader);

  await assertFailureClass(reader.verifyModelAccess(MODEL), "transport");

  assert.equal(attempts, 2);
  assert.ok(Date.now() - startedAt < 100);
});

function createTestReader(retrieveModel: (model: string) => Promise<void>) {
  const reader = createOpenAiModelReader("test-key", {
    attemptTimeoutMs: 20,
    overallTimeoutMs: 50,
    retrieveModel,
    retryDelayMs: 0,
    sleep: async () => undefined,
  });
  assert.ok(reader);
  return reader;
}

function statusError(status: number, code?: unknown) {
  return APIError.generate(
    status,
    code === undefined ? undefined : { error: { code } },
    undefined,
    new Headers()
  );
}

async function assertFailureClass(
  promise: Promise<void>,
  expected: OpenAiModelAccessFailureClass
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof OpenAiModelAccessError);
    assert.equal(error.failureClass, expected);
    return true;
  });
}
