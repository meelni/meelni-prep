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

function statusError(status: number) {
  return APIError.generate(status, undefined, undefined, new Headers());
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
