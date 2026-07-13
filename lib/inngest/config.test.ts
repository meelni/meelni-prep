import assert from "node:assert/strict";
import test from "node:test";

import {
  getInngestClientOptions,
  getInngestConfigurationStatus,
} from "./config";

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
      VERCEL_GIT_COMMIT_REF: "main",
      INNGEST_EVENT_KEY: "event-key",
      INNGEST_SIGNING_KEY: "signing-key",
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

test("Preview pins event routing to the exact Vercel Git branch", () => {
  assert.deepEqual(
    getInngestClientOptions({
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "codex/sav-226-provider-isolation",
      INNGEST_ENV: "codex/sav-226-provider-isolation",
      INNGEST_EVENT_KEY: "event-key",
      INNGEST_SIGNING_KEY: "signing-key",
    }),
    {
      id: "meelni",
      env: "codex/sav-226-provider-isolation",
      eventKey: "event-key",
    }
  );
});

test("hosted Preview fails closed when Inngest and Vercel branch identities differ", () => {
  const env = {
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "codex/expected",
    INNGEST_ENV: "codex/wrong",
    INNGEST_EVENT_KEY: "event-key",
    INNGEST_SIGNING_KEY: "signing-key",
  };

  assert.deepEqual(getInngestConfigurationStatus(env), {
    ok: false,
    code: "identity_mismatch",
    reason: "Preview INNGEST_ENV must match VERCEL_GIT_COMMIT_REF",
  });
  assert.throws(
    () => getInngestClientOptions(env),
    /Invalid hosted Inngest configuration/
  );
});

test("hosted Preview requires both cloud credentials after identity validation", () => {
  assert.deepEqual(
    getInngestConfigurationStatus({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "codex/preview",
      INNGEST_ENV: "codex/preview",
      INNGEST_EVENT_KEY: "event-key",
    }),
    {
      ok: false,
      code: "credentials_missing",
      reason: "INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY are required",
    }
  );
});

test("hosted Production rejects branch routing and non-main deployments", () => {
  const base = {
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    INNGEST_EVENT_KEY: "event-key",
    INNGEST_SIGNING_KEY: "signing-key",
  };

  assert.equal(
    getInngestConfigurationStatus({
      ...base,
      VERCEL_GIT_COMMIT_REF: "release-candidate",
    }).ok,
    false
  );
  assert.equal(
    getInngestConfigurationStatus({
      ...base,
      VERCEL_GIT_COMMIT_REF: "main",
      INNGEST_ENV: "main",
    }).ok,
    false
  );
});

test("pulled hosted metadata never disables explicit local dev mode", () => {
  assert.deepEqual(
    getInngestClientOptions({
      NODE_ENV: "development",
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "codex/preview",
      INNGEST_ENV: "some-other-environment",
    }),
    { id: "meelni", isDev: true }
  );
});
