import assert from "node:assert/strict";
import test from "node:test";

import { getAnalyticsConfig } from "./config";

test("analytics disables session recording in production and development", () => {
  for (const environment of ["production", "development"]) {
    const config = getAnalyticsConfig({
      NODE_ENV: environment,
      NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
    });
    assert.equal(config.sessionRecording.enabled, false);
    assert.equal(config.sessionRecording.sampleRate, 0);
    assert.equal(config.sessionRecording.maskTextInputs, true);
  }
});
