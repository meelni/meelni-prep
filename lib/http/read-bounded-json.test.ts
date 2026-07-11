import assert from "node:assert/strict";
import test from "node:test";

import { readBoundedJson } from "./read-bounded-json";

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
  assert.equal(reads, 2);
});
