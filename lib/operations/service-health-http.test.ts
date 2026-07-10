import assert from "node:assert/strict";
import test from "node:test";

import type { ServiceHealthReport } from "./service-health";
import { createServiceHealthHandler } from "./service-health-http";

test("health HTTP contract uses 200 for healthy and degraded reports", async () => {
  for (const status of ["healthy", "degraded"] as const) {
    const response = await createServiceHealthHandler({
      assess: async () => report(status),
    })();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.deepEqual(await response.json(), report(status));
  }
});

test("health HTTP contract uses 503 only when practice is unavailable", async () => {
  const response = await createServiceHealthHandler({
    assess: async () => report("unavailable"),
  })();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), report("unavailable"));
});

function report(status: ServiceHealthReport["status"]): ServiceHealthReport {
  return {
    contract: "meelni_service_health",
    version: 1,
    checkedAt: "2026-07-10T20:00:00.000Z",
    status,
    checks: [
      { name: "web", status: "healthy", code: "web_ready" },
      { name: "database", status: "healthy", code: "database_ready" },
      { name: "livekit", status: "healthy", code: "livekit_ready" },
      {
        name: "feedback_dispatch",
        status: "healthy",
        code: "feedback_dispatch_ready",
      },
      {
        name: "stripe_webhook",
        status: "healthy",
        code: "stripe_webhook_ready",
      },
    ],
  };
}
