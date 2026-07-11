import assert from "node:assert/strict";
import test from "node:test";

import { readBoundedJson, readBoundedJsonObject } from "./read-bounded-json";

test("bounded JSON objects reject null, arrays, and primitives", async () => {
  for (const value of ["null", "[]", '"text"', "42", "true"]) {
    const result = await readBoundedJsonObject(
      new Request("https://meelni.test", { method: "POST", body: value }),
      100
    );
    assert.deepEqual(result, { ok: false, reason: "invalid" });
  }

  assert.deepEqual(
    await readBoundedJsonObject(
      new Request("https://meelni.test", { method: "POST", body: "{}" }),
      100
    ),
    { ok: true, value: {} }
  );
});

test("bounded JSON rejects declared and streamed overflow without reading content", async () => {
  const declared = await readBoundedJson(
    new Request("https://meelni.test", {
      method: "POST",
      body: "{}",
      headers: { "content-length": "100" },
    }),
    10
  );
  assert.deepEqual(declared, { ok: false, reason: "too_large" });

  let reads = 0;
  const streamed = await readBoundedJson(
    new Request("https://meelni.test", {
      method: "POST",
      body: new ReadableStream({
        pull(controller) {
          reads += 1;
          controller.enqueue(new Uint8Array(8));
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: string }),
    10
  );
  assert.deepEqual(streamed, { ok: false, reason: "too_large" });
  assert.ok(reads >= 2 && reads <= 3);
});

test("bounded JSON cancels a pending stream read when the request aborts", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const request = new Request("https://meelni.test", {
    method: "POST",
    body: new ReadableStream({
      pull() {
        return new Promise(() => undefined);
      },
      cancel() {
        cancelled = true;
      },
    }),
    duplex: "half",
    signal: controller.signal,
  } as RequestInit & { duplex: string });

  const reading = readBoundedJson(request, 10);
  controller.abort();

  assert.deepEqual(await reading, { ok: false, reason: "aborted" });
  assert.equal(cancelled, true);
});
