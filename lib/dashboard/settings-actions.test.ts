import assert from "node:assert/strict";
import test from "node:test";

import {
  requestAccountDeletion,
  requestAccountExport,
  shouldShowSettingsLoading,
} from "./settings-actions";

test("settings treats idle and loading as loading-safe states", () => {
  assert.equal(shouldShowSettingsLoading("idle"), true);
  assert.equal(shouldShowSettingsLoading("loading"), true);
  assert.equal(shouldShowSettingsLoading("ready"), false);
  assert.equal(shouldShowSettingsLoading("error"), false);
});

test("account deletion distinguishes durable request and automatic retry", async () => {
  const requested = await requestAccountDeletion("DELETE", async () =>
    Response.json(
      { status: "deletion_requested", message: "Cleanup is in progress." },
      { status: 202 }
    )
  );
  const retrying = await requestAccountDeletion("DELETE", async () =>
    Response.json(
      {
        status: "deletion_retry_scheduled",
        message: "Cleanup will retry automatically.",
      },
      { status: 202 }
    )
  );

  assert.deepEqual(requested, {
    state: "requested",
    message: "Cleanup is in progress.",
  });
  assert.deepEqual(retrying, {
    state: "retry_scheduled",
    message: "Cleanup will retry automatically.",
  });
});

test("account deletion exposes an actionable reauthentication state", async () => {
  const result = await requestAccountDeletion("DELETE", async () =>
    Response.json(
      {
        error: "reauthentication_required",
        message: "Sign in again.",
        reauthenticateAt: "/auth/signin?redirectTo=%2Fdashboard%2Fsettings",
      },
      { status: 409 }
    )
  );

  assert.deepEqual(result, {
    state: "reauthentication_required",
    message: "Sign in again.",
    reauthenticateAt: "/auth/signin?redirectTo=%2Fdashboard%2Fsettings",
  });
});

test("account deletion rejects an external reauthentication destination", async () => {
  const result = await requestAccountDeletion("DELETE", async () =>
    Response.json(
      {
        error: "reauthentication_required",
        reauthenticateAt: "https://attacker.example/sign-in",
      },
      { status: 409 }
    )
  );

  assert.equal(result.state, "reauthentication_required");
  if (result.state === "reauthentication_required") {
    assert.equal(
      result.reauthenticateAt,
      "/auth/signin?redirectTo=%2Fdashboard%2Fsettings%3Fsection%3Ddata-privacy"
    );
  }
});

test("account deletion reports redacted API and network failures", async () => {
  const apiResult = await requestAccountDeletion("DELETE", async () =>
    Response.json(
      { error: "account_deletion_request_failed", message: "Safe message" },
      { status: 500 }
    )
  );
  const networkResult = await requestAccountDeletion("DELETE", async () => {
    throw new Error("postgresql://secret-host");
  });

  assert.deepEqual(apiResult, {
    state: "error",
    message: "Safe message",
    retryable: true,
  });
  assert.equal(networkResult.state, "error");
  assert.equal(JSON.stringify(networkResult).includes("secret-host"), false);
});

test("account export returns a server-selected safe filename and blob", async () => {
  const result = await requestAccountExport(
    async () =>
      new Response('{"schemaVersion":"1.0.0"}', {
        headers: {
          "Content-Disposition":
            'attachment; filename="meelni-account-data-2026-07-10.json"',
          "Content-Type": "application/json",
        },
      })
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.filename, "meelni-account-data-2026-07-10.json");
    assert.equal(await result.file.text(), '{"schemaVersion":"1.0.0"}');
  }
});

test("account export rejects unsafe filenames and reports failures", async () => {
  const fallback = await requestAccountExport(
    async () =>
      new Response("{}", {
        headers: {
          "Content-Disposition": 'attachment; filename="../raw.json"',
        },
      })
  );
  const failure = await requestAccountExport(async () =>
    Response.json({ message: "Export unavailable" }, { status: 500 })
  );

  assert.equal(fallback.ok && fallback.filename, "meelni-account-data.json");
  assert.deepEqual(failure, { ok: false, error: "Export unavailable" });
});
