import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  checkoutCreate,
  checkoutReturn,
  checkoutReturnCookie,
  checkoutStatus,
  pricingPage,
  pricingSection,
  successPage,
  successClient,
  successNavigation,
  posthogConfig,
  posthogProvider,
  posthogServer,
  statsigProvider,
] = await Promise.all([
  readFile("app/api/checkout/create-session/route.ts", "utf8"),
  readFile("app/api/checkout/return/route.ts", "utf8"),
  readFile("lib/billing/checkout-return-cookie.ts", "utf8"),
  readFile("app/api/checkout/status/route.ts", "utf8"),
  readFile("app/pricing/page.tsx", "utf8"),
  readFile("components/sections/pricing.tsx", "utf8"),
  readFile("app/pricing/success/page.tsx", "utf8"),
  readFile("app/pricing/success/checkout-success-client.tsx", "utf8"),
  readFile("lib/billing/checkout-success-navigation.ts", "utf8"),
  readFile("lib/analytics/config.ts", "utf8"),
  readFile("lib/analytics/posthog-provider.tsx", "utf8"),
  readFile("lib/analytics/posthog-server.ts", "utf8"),
  readFile("lib/feature-flags/statsig-provider.tsx", "utf8"),
]);

test("Checkout correlation stays out of every application URL", () => {
  assert.match(
    checkoutCreate,
    /success_url: `\$\{req\.nextUrl\.origin\}\/pricing\/success`/
  );
  assert.doesNotMatch(checkoutCreate, /\{CHECKOUT_SESSION_ID\}/);
  assert.doesNotMatch(checkoutCreate, /success_url:.*[?&]/);
  assert.doesNotMatch(checkoutReturn, /response\.cookies\.set/);
  assert.doesNotMatch(checkoutReturn, /randomUUID/);
  assert.doesNotMatch(checkoutReturn, /searchParams/);
  assert.match(checkoutReturn, /new URL\("\/pricing\/success"/);
  assert.match(successPage, /Object\.keys\(query\)\.length > 0/);
  assert.doesNotMatch(successNavigation, /URLSearchParams|checkout_return/);
});

test("browser status is provider-free and accepts correlation only in a POST body", () => {
  assert.doesNotMatch(checkoutStatus, /from ["']stripe["']/);
  assert.doesNotMatch(checkoutStatus, /retrieveAuthoritativeCheckoutSession/);
  assert.match(checkoutStatus, /leftJoin\(creditGrant/);
  assert.match(checkoutStatus, /export async function POST/);
  assert.match(checkoutStatus, /await request\.json\(\)/);
  assert.doesNotMatch(checkoutStatus, /nextUrl\.searchParams/);
});

test("return correlation is concurrent-safe and covers delayed settlement", () => {
  assert.match(checkoutReturnCookie, /CHECKOUT_RETURN_COOKIE_PREFIX/);
  assert.match(checkoutReturnCookie, /CHECKOUT_RETURN_COOKIE_LIMIT = 8/);
  assert.match(checkoutReturnCookie, /cr_\[A-Za-z0-9\]\{32\}/);
  assert.match(checkoutReturnCookie, /30 \* 24 \* 60 \* 60/);
  assert.match(checkoutReturnCookie, /checkoutReturnCookieSlot/);
  assert.match(
    checkoutReturnCookie,
    /return `\$\{handle\}:\$\{sessionId\}:\$\{createdAtMs\}`/
  );
  assert.match(checkoutStatus, /CHECKOUT_RETURN_COOKIE_NAMES\.flatMap/);
  assert.match(checkoutStatus, /checkoutReturnCorrelationsNewestFirst/);
  assert.match(
    checkoutStatus,
    /inArray\(paymentHistory\.stripeCheckoutSessionId/
  );
  assert.match(checkoutStatus, /checkoutSessionIdFromReturnCookie/);
  assert.doesNotMatch(checkoutCreate, /request\.cookies\.getAll/);
});

test("both pricing clients hand correlation through same-tab storage", () => {
  for (const source of [pricingPage, pricingSection]) {
    assert.match(source, /parseCheckoutCreateResponse/);
    assert.match(source, /storeCheckoutReturnHandle\(window\.sessionStorage/);
  }
  assert.match(
    successClient,
    /readCheckoutReturnHandle\(window\.sessionStorage\)/
  );
  assert.match(successClient, /fetch\("\/api\/checkout\/status"/);
  assert.match(successClient, /method: "POST"/);
  assert.match(
    successClient,
    /body: JSON\.stringify\(returnHandle \? \{ returnHandle \} : \{\}\)/
  );
  assert.match(
    successClient,
    /clearCheckoutReturnHandle\(window\.sessionStorage/
  );
});

test("analytics clients retain the Checkout privacy boundary", () => {
  assert.match(posthogProvider, /before_send/);
  assert.match(posthogProvider, /sanitizeAnalyticsValue/);
  assert.doesNotMatch(statsigProvider, /@statsig\/session-replay/);
  assert.doesNotMatch(statsigProvider, /@statsig\/web-analytics/);
  assert.match(statsigProvider, /sanitizeAnalyticsValue/);
  assert.match(posthogConfig, /enabled: false/);
  assert.match(posthogConfig, /sampleRate: 0/);
  assert.match(posthogProvider, /disable_session_recording: true/);
  assert.match(posthogProvider, /stopSessionRecording\(\)/);
});

test("server PostHog transmission retains the recursive privacy boundary", () => {
  assert.match(posthogServer, /buildServerCapturePayload/);
  assert.match(posthogServer, /sanitizeAnalyticsValue\(properties\)/);
  assert.match(
    posthogServer,
    /client\.capture\(buildServerCapturePayload\(event, properties, distinctId\)\)/
  );
  assert.match(posthogServer, /buildServerIdentifyPayload/);
});
