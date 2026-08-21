import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_VERCEL_DEPLOYMENT_IDENTITY,
  getLiveKitEnvironment,
  resolveLiveKitDeploymentCapability,
} from "./index";

const COMPLETE_LIVEKIT_ENV = {
  LIVEKIT_API_KEY: "production-shaped-key",
  LIVEKIT_API_SECRET: "production-shaped-secret",
  NEXT_PUBLIC_LIVEKIT_URL: "wss://production.example.livekit.cloud",
};

test("LiveKit capability follows the Vercel deployment target matrix", () => {
  assert.deepEqual(
    resolveLiveKitDeploymentCapability({
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_TARGET_ENV: "preview",
    }),
    {
      mode: "disabled",
      lane: "generic_preview",
      reason: "intentional_generic_preview_disablement",
    }
  );
  assert.deepEqual(
    resolveLiveKitDeploymentCapability({
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_TARGET_ENV: "staging",
    }),
    { mode: "enabled", lane: "staging" }
  );
  assert.deepEqual(
    resolveLiveKitDeploymentCapability({
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_TARGET_ENV: "production",
    }),
    { mode: "enabled", lane: "production" }
  );
  assert.deepEqual(resolveLiveKitDeploymentCapability({}), {
    mode: "enabled",
    lane: "local_or_unclassified",
  });
});

test("exact Shadow control-plane staging disables web LiveKit", () => {
  assert.deepEqual(
    resolveLiveKitDeploymentCapability(controlPlaneOnlyStaging()),
    {
      mode: "disabled",
      lane: "preview_shadow_control_plane",
      reason: "intentional_preview_shadow_control_plane_disablement",
    }
  );

  const result = getLiveKitEnvironment({
    ...COMPLETE_LIVEKIT_ENV,
    ...controlPlaneOnlyStaging(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_disabled_in_generic_preview");
    assert.equal(result.error.retryable, false);
  }
});

test("partial or copied control-plane identity leaves staging strict", () => {
  const complete = controlPlaneOnlyStaging();
  for (const key of Object.keys(complete)) {
    assert.equal(
      resolveLiveKitDeploymentCapability({ ...complete, [key]: undefined })
        .mode,
      "enabled",
      key
    );
  }
  assert.deepEqual(
    resolveLiveKitDeploymentCapability({
      ...complete,
      VERCEL_PROJECT_ID: "prj_copied",
    }),
    { mode: "enabled", lane: "staging" }
  );
});

test("partial or spoofable identity cannot disable LiveKit", () => {
  for (const env of [
    { VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview" },
    { VERCEL: "1", VERCEL_ENV: "preview" },
    {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_TARGET_ENV: "staging",
      MEELNI_LIVEKIT_DISABLED: "true",
    },
    {
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_TARGET_ENV: "preview",
      MEELNI_LIVEKIT_DISABLED: "true",
    },
  ]) {
    assert.equal(resolveLiveKitDeploymentCapability(env).mode, "enabled");
  }
});

test("Production credentials cannot enable generic Preview voice", () => {
  const result = getLiveKitEnvironment({
    ...COMPLETE_LIVEKIT_ENV,
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_TARGET_ENV: "preview",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_disabled_in_generic_preview");
    assert.equal(result.error.retryable, false);
  }
});

test("staging and Production remain strict when LiveKit is missing", () => {
  for (const env of [
    {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_TARGET_ENV: "staging",
    },
    {
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_TARGET_ENV: "production",
    },
  ]) {
    const result = getLiveKitEnvironment(env);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "livekit_env_missing");
  }
});

function controlPlaneOnlyStaging() {
  return {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_TARGET_ENV: "staging",
    VERCEL_PROJECT_ID: CANONICAL_VERCEL_DEPLOYMENT_IDENTITY.projectId,
    VERCEL_GIT_REPO_OWNER:
      CANONICAL_VERCEL_DEPLOYMENT_IDENTITY.repositoryOwner,
    VERCEL_GIT_REPO_SLUG:
      CANONICAL_VERCEL_DEPLOYMENT_IDENTITY.repositorySlug,
    MEELNI_ENV_PULL_ENVIRONMENT: "preview",
    MEELNI_PREVIEW_SHADOW_REHEARSAL_SERVER: "enabled",
    MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_ONLY: "enabled",
  } as const;
}
