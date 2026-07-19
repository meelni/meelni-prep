import assert from "node:assert/strict";
import test from "node:test";

import {
  parseProtectedServiceHealthPreviewOrigin,
  parseServiceHealthUrl,
  runServiceHealthSynthetic,
} from "./service-health-synthetic";

test("synthetic passes only a healthy closed health response", async () => {
  const result = await runServiceHealthSynthetic({
    url: new URL("https://meelni.example.test/api/health"),
    fetcher: async () => Response.json(report("healthy")) as never,
    now: () => new Date("2026-07-10T20:01:00.000Z"),
  });

  assert.deepEqual(result, {
    synthetic: "meelni_service_health",
    version: 1,
    status: "passed",
    code: "health_endpoint_healthy",
  });
});

test("synthetic fails degraded and unavailable contract responses", async () => {
  for (const [status, httpStatus, code] of [
    ["degraded", 200, "health_endpoint_degraded"],
    ["unavailable", 503, "health_endpoint_unavailable"],
  ] as const) {
    const result = await runServiceHealthSynthetic({
      url: new URL("https://meelni.example.test/api/health"),
      fetcher: async () =>
        Response.json(report(status), { status: httpStatus }) as never,
      now: () => new Date("2026-07-10T20:01:00.000Z"),
    });
    assert.equal(result.status, "failed");
    assert.equal(result.code, code);
  }
});

test("synthetic rejects every HTTP status and body-status mismatch", async () => {
  for (const [status, httpStatus] of [
    ["healthy", 201],
    ["healthy", 503],
    ["degraded", 500],
    ["degraded", 503],
    ["unavailable", 200],
    ["unavailable", 500],
  ] as const) {
    const result = await runServiceHealthSynthetic({
      url: new URL("https://meelni.example.test/api/health"),
      fetcher: async () =>
        Response.json(report(status), { status: httpStatus }) as never,
      now: () => new Date("2026-07-10T20:01:00.000Z"),
    });
    assert.equal(result.code, "health_endpoint_invalid");
  }
});

test("synthetic rejects malformed, oversized, and extra-field payloads", async () => {
  const payloads = [
    new Response("not-json", {
      headers: { "content-type": "application/json" },
    }),
    Response.json({ ...report("healthy"), leaked: "user@example.com" }),
    new Response(JSON.stringify(report("healthy")) + " ".repeat(17_000), {
      headers: { "content-type": "application/json" },
    }),
    new Response(JSON.stringify(report("healthy")), {
      headers: { "content-type": "text/plain" },
    }),
    new Response(JSON.stringify(report("healthy")), {
      headers: { "content-type": "application/jsonp" },
    }),
  ];
  for (const response of payloads) {
    const result = await runServiceHealthSynthetic({
      url: new URL("https://meelni.example.test/api/health"),
      fetcher: async () => response as never,
      now: () => new Date("2026-07-10T20:01:00.000Z"),
    });
    assert.equal(result.code, "health_endpoint_invalid");
  }
});

test("synthetic rejects stale, future, and internally inconsistent reports", async () => {
  const inconsistent = report("healthy");
  inconsistent.checks[1] = {
    name: "database",
    status: "healthy",
    code: "database_unavailable",
  };
  const payloads = [
    { ...report("healthy"), checkedAt: "2026-07-10T19:00:00.000Z" },
    { ...report("healthy"), checkedAt: "2026-07-10T20:10:00.000Z" },
    inconsistent,
  ];

  for (const payload of payloads) {
    const result = await runServiceHealthSynthetic({
      url: new URL("https://meelni.example.test/api/health"),
      fetcher: async () => Response.json(payload) as never,
      now: () => new Date("2026-07-10T20:01:00.000Z"),
    });
    assert.equal(result.code, "health_endpoint_invalid");
  }
});

test("synthetic rejects impossible calendar timestamps that Date.parse normalizes", async () => {
  const result = await runServiceHealthSynthetic({
    url: new URL("https://meelni.example.test/api/health"),
    fetcher: async () =>
      Response.json({
        ...report("healthy"),
        checkedAt: "2026-02-31T20:00:00.000Z",
      }) as never,
    now: () => new Date("2026-03-03T20:00:30.000Z"),
  });

  assert.equal(result.code, "health_endpoint_invalid");
});

test("synthetic converts transport failures to one safe fixed code", async () => {
  const result = await runServiceHealthSynthetic({
    url: new URL("https://meelni.example.test/api/health"),
    fetcher: async () => {
      throw new Error("token=secret user@example.com");
    },
    now: () => new Date("2026-07-10T20:01:00.000Z"),
  });
  assert.deepEqual(result, {
    synthetic: "meelni_service_health",
    version: 1,
    status: "failed",
    code: "health_endpoint_unreachable",
  });
});

test("synthetic can access protected Preview only through the secret header", async () => {
  const bypassSecret = "preview-automation-secret";
  let capturedHeaders: Headers | undefined;
  const result = await runServiceHealthSynthetic({
    url: new URL("https://meelni-git-codex-safe-meelni.vercel.app/api/health"),
    protectedPreview: {
      bypassSecret,
      expectedOrigin: new URL(
        "https://meelni-git-codex-safe-meelni.vercel.app"
      ),
    },
    fetcher: async (_url, init) => {
      capturedHeaders = new Headers(init?.headers);
      return Response.json(report("healthy")) as never;
    },
    now: () => new Date("2026-07-10T20:01:00.000Z"),
  });

  assert.equal(result.status, "passed");
  assert.equal(
    capturedHeaders?.get("x-vercel-protection-bypass"),
    bypassSecret
  );
  assert.doesNotMatch(JSON.stringify(result), new RegExp(bypassSecret));
});

test("protected Preview refuses secret exfiltration before transport", async () => {
  const trusted = new URL("https://meelni-git-codex-safe-meelni.vercel.app");
  const targets = [
    "https://attacker.example/api/health",
    "https://meelni-git-codex-safe-meelni.vercel.app.evil.example/api/health",
    "https://user:password@meelni-git-codex-safe-meelni.vercel.app/api/health",
    "https://meelni-git-codex-safe-meelni.vercel.app/api/health?next=evil",
    "https://meelni-git-codex-safe-meelni.vercel.app/api/health#secret",
    "https://meelni-git-other-meelni.vercel.app/api/health",
  ];
  for (const target of targets) {
    let calls = 0;
    const result = await runServiceHealthSynthetic({
      url: new URL(target),
      protectedPreview: {
        bypassSecret: "preview-automation-secret",
        expectedOrigin: trusted,
      },
      fetcher: async () => {
        calls += 1;
        return Response.json(report("healthy")) as never;
      },
    });
    assert.equal(result.code, "health_endpoint_invalid");
    assert.equal(calls, 0);
  }
});

test("protected Preview origin parser rejects hostname and URL confusion", () => {
  assert.equal(
    parseProtectedServiceHealthPreviewOrigin(
      "https://meelni-git-codex-safe-meelni.vercel.app"
    )?.origin,
    "https://meelni-git-codex-safe-meelni.vercel.app"
  );
  for (const value of [
    "https://meelni.vercel.app",
    "https://meelni-git-safe-meelni.vercel.app.evil.example",
    "https://user:secret@meelni-git-safe-meelni.vercel.app",
    "https://meelni-git-safe-meelni.vercel.app/path",
    "https://meelni-git-safe-meelni.vercel.app?secret=value",
    "http://meelni-git-safe-meelni.vercel.app",
  ]) {
    assert.equal(parseProtectedServiceHealthPreviewOrigin(value), null);
  }
});

test("protected Preview never follows a response redirect with the bypass header", async () => {
  const target = new URL(
    "https://meelni-git-codex-safe-meelni.vercel.app/api/health"
  );
  let capturedRedirect: RequestRedirect | undefined;
  let capturedUrl = "";
  const result = await runServiceHealthSynthetic({
    url: target,
    protectedPreview: {
      bypassSecret: "preview-automation-secret",
      expectedOrigin: new URL(target.origin),
    },
    fetcher: async (url, init) => {
      capturedUrl = String(url);
      capturedRedirect = init?.redirect;
      return Response.redirect(
        "https://attacker.example/collect",
        302
      ) as never;
    },
  });

  assert.equal(result.code, "health_endpoint_invalid");
  assert.equal(capturedRedirect, "error");
  assert.equal(capturedUrl, target.href);
});

test("synthetic URL parser allows HTTPS and loopback HTTP without credentials", () => {
  assert.equal(
    parseServiceHealthUrl("https://meelni.example.test/api/health")?.href,
    "https://meelni.example.test/api/health"
  );
  assert.equal(
    parseServiceHealthUrl("http://127.0.0.1:3000/api/health")?.href,
    "http://127.0.0.1:3000/api/health"
  );
  for (const value of [
    undefined,
    "http://meelni.example.test/api/health",
    "https://user:secret@meelni.example.test/api/health",
    "https://meelni.example.test/api/health?token=secret",
  ]) {
    assert.equal(parseServiceHealthUrl(value), null);
  }
});

function report(status: "healthy" | "degraded" | "unavailable") {
  const value = {
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
  if (status === "degraded") {
    value.checks[3] = {
      name: "feedback_dispatch",
      status: "degraded",
      code: "feedback_dispatch_config_missing",
    };
  }
  if (status === "unavailable") {
    value.checks[1] = {
      name: "database",
      status: "unavailable",
      code: "database_unavailable",
    };
    value.checks[3] = {
      name: "feedback_dispatch",
      status: "unavailable",
      code: "feedback_dispatch_dependency_unavailable",
    };
    value.checks[4] = {
      name: "stripe_webhook",
      status: "unavailable",
      code: "stripe_webhook_dependency_unavailable",
    };
  }
  return value;
}
