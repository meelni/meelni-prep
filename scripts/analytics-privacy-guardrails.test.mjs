import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("optional analytics have one provider boundary and no autocapture or remote runtime", async () => {
  const files = {
    explore: await readFile("app/explore/page.tsx", "utf8"),
    conversion: await readFile("components/explore/conversion-cta.tsx", "utf8"),
    statsig: await readFile("lib/feature-flags/statsig-provider.tsx", "utf8"),
    posthog: await readFile("lib/analytics/posthog-provider.tsx", "utf8"),
    vitals: await readFile("lib/analytics/use-web-vitals.ts", "utf8"),
    consent: await readFile(
      "app/providers/analytics-consent-provider.tsx",
      "utf8"
    ),
    analyticsTypes: await readFile("lib/analytics/types.ts", "utf8"),
    posthogServer: await readFile("lib/analytics/posthog-server.ts", "utf8"),
  };

  assert.equal(files.explore.includes("usePostHog"), false);
  assert.equal(files.conversion.includes("usePostHog"), false);
  assert.equal(files.statsig.includes("StatsigAutoCapturePlugin"), false);
  assert.equal(files.statsig.includes('loggingEnabled: "disabled"'), true);
  assert.equal(files.posthog.includes("disable_session_recording: true"), true);
  assert.equal(
    files.posthog.includes("opt_out_capturing_by_default: true"),
    true
  );
  assert.equal(
    files.posthog.includes("opt_out_persistence_by_default: true"),
    true
  );
  assert.equal(files.vitals.includes("unpkg.com"), false);
  assert.equal(
    files.statsig.includes("clearStatsigAnonymousIdentifiers"),
    true
  );
  assert.equal(files.posthog.includes("setAnalyticsCaptureAllowed"), true);
  assert.equal(files.posthog.includes("before_send"), true);
  assert.equal(files.posthog.includes("save_campaign_params: false"), true);
  assert.equal(files.posthog.includes("save_referrer: false"), true);
  assert.equal(files.consent.includes("purgeLegacyPostHogIdentity"), true);
  assert.equal(files.posthogServer.includes("POSTHOG_SERVER_KEY"), false);
  assert.equal(files.posthogServer.includes("flushAt: 1"), true);
  assert.equal(files.consent.includes("resolvedForUserId"), true);
  for (const forbidden of [
    "question_id",
    "session_id",
    "user_id",
    "return_to",
    "referrer",
    "error_message",
  ]) {
    assert.equal(files.analyticsTypes.includes(forbidden), false, forbidden);
  }
});
