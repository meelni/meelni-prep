import assert from "node:assert/strict";
import test from "node:test";

import { getAnalyticsConfig } from "./config";

test("PostHog session recording stays disabled in every environment", () => {
  const environment = process.env as Record<string, string | undefined>;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  try {
    environment.NODE_ENV = "production";
    environment.NEXT_PUBLIC_POSTHOG_KEY = "phc_synthetic";
    const production = getAnalyticsConfig();
    assert.equal(production.enabled, true);
    assert.deepEqual(production.sessionRecording, {
      enabled: false,
      sampleRate: 0,
      maskTextInputs: true,
      maskAllText: true,
      maskEmails: true,
    });

    environment.NODE_ENV = "development";
    const development = getAnalyticsConfig();
    assert.equal(development.sessionRecording.enabled, false);
    assert.equal(development.sessionRecording.sampleRate, 0);
  } finally {
    if (originalNodeEnv === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = originalNodeEnv;
    if (originalKey === undefined) delete environment.NEXT_PUBLIC_POSTHOG_KEY;
    else environment.NEXT_PUBLIC_POSTHOG_KEY = originalKey;
  }
});
