import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("analytics consent occupies document flow before primary content", async () => {
  const [layout, banner, surface] = await Promise.all([
    readFile("app/layout.tsx", "utf8"),
    readFile("components/cookie-consent-banner.tsx", "utf8"),
    readFile("components/analytics/consent-banner-surface.tsx", "utf8"),
  ]);

  assert.ok(
    layout.indexOf("<CookieConsentBanner />") < layout.indexOf("{children}"),
    "consent must render before primary content"
  );
  assert.match(banner, /ConsentBannerSurface/);
  assert.match(banner, /useAnalyticsConsent/);
  assert.doesNotMatch(banner, /posthog-js|localStorage/);
  assert.match(surface, /data-cookie-consent-banner/);
  assert.doesNotMatch(surface, /\b(?:fixed|sticky|absolute)\b/);
  assert.match(surface, /grid-cols-1/);
  assert.match(surface, /sm:grid-cols-2/);
});

test("feedback states share the accessible review surface", async () => {
  const files = [
    "app/feedback/[sessionId]/page.tsx",
    "app/feedback/[sessionId]/components/feedback-loading.tsx",
    "components/feedback/feedback-partial.tsx",
    "components/feedback/feedback-insufficient.tsx",
    "components/feedback/feedback-abandoned.tsx",
  ];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.match(source, /FeedbackStatusPage|FeedbackReviewShell/);
  }
});
