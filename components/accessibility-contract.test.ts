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
  assert.match(banner, /border-foreground\/50/);
});

test("feedback lifecycle states share the accessible review surface", async () => {
  const files = [
    "components/feedback/feedback-review.tsx",
    "components/feedback/feedback-completed-review.tsx",
    "components/feedback/feedback-lifecycle-status.tsx",
    "components/feedback/feedback-comparison-review.tsx",
  ];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.match(source, /FeedbackStatusPage|FeedbackReviewShell/);
  }
});

test("feedback comparison preserves valid controls and grouped loading semantics", async () => {
  const [compare, attemptComparison] = await Promise.all([
    readFile("components/feedback/feedback-comparison-review.tsx", "utf8"),
    readFile("components/feedback/attempt-comparison.tsx", "utf8"),
  ]);

  assert.doesNotMatch(
    compare,
    /<Link\b[^>]*>\s*<Button\b/,
    "links must not contain nested button controls"
  );
  assert.match(compare, /<Button\s+asChild/);
  assert.equal((compare.match(/<fieldset/g) ?? []).length, 1);
  assert.equal((compare.match(/<legend/g) ?? []).length, 1);
  assert.match(compare, /role="radiogroup"/);
  assert.match(compare, /role="radio"/);
  assert.match(compare, /aria-labelledby="latest-attempt-heading"/);
  assert.doesNotMatch(compare, /selected\s+disabled/);
  assert.match(compare, /role="status"/);
  assert.match(compare, /aria-busy="true"/);
  assert.match(compare, /motion-reduce:animate-none/);
  assert.match(compare, /useReducedMotion/);
  assert.match(compare, /initial=\{shouldReduceMotion \? false : "initial"\}/);
  assert.match(compare, /flex min-w-0 flex-wrap items-center gap-3/);
  assert.match(attemptComparison, /useReducedMotion/);
  assert.match(
    attemptComparison,
    /initial=\{shouldReduceMotion \? false : "initial"\}/
  );
  assert.match(compare, /flex-col[^"]*sm:flex-row/);
});
