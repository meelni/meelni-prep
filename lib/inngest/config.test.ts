import assert from "node:assert/strict";
import test from "node:test";

import { getInngestClientOptions } from "./config";

test("Inngest runs in explicit dev mode during local Next.js development", () => {
  assert.deepEqual(
    getInngestClientOptions({
      NODE_ENV: "development",
      VERCEL: "1",
      VERCEL_ENV: "preview",
    }),
    {
      id: "meelni",
      isDev: true,
    }
  );
});

test("Inngest runs in explicit dev mode for local scripts with pulled Vercel metadata", () => {
  assert.deepEqual(
    getInngestClientOptions({
      VERCEL: "1",
      VERCEL_ENV: "preview",
    }),
    {
      id: "meelni",
      isDev: true,
    }
  );
});

test("Inngest uses cloud mode outside local development", () => {
  assert.deepEqual(
    getInngestClientOptions({
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "production",
      INNGEST_EVENT_KEY: "event-key",
    }),
    {
      id: "meelni",
      eventKey: "event-key",
    }
  );
});

test("Inngest omits blank event keys", () => {
  assert.deepEqual(
    getInngestClientOptions({
      NODE_ENV: "production",
      INNGEST_EVENT_KEY: "",
    }),
    {
      id: "meelni",
    }
  );
});
