import assert from "node:assert/strict";
import test from "node:test";

import { sanitizePostHogCaptureEnvelope } from "./posthog-envelope";

const base = {
  uuid: "provider-envelope-id",
  event: "cta_clicked",
  properties: {
    token: "phc_project",
    distinct_id: "provider-distinct-id",
    $lib: "web",
    $lib_version: "1.0.0",
  },
};

test("final PostHog envelope drops SDK-enriched URLs, referrers, campaigns, and provider metadata", () => {
  assert.deepEqual(
    sanitizePostHogCaptureEnvelope({
      ...base,
      properties: {
        ...base.properties,
        location: "landing hero",
        destination: "/setup?question_id=private",
        $current_url: "https://meelni.com/setup?token=private",
        $referrer: "https://private.example/person/jane",
        $initial_referrer: "https://private.example/initial",
        utm_campaign: "jane@example.com",
        $session_id: "private-session",
        $device_id: "legacy-device",
      },
      $set: { email: "jane@example.com" },
      $set_once: { $initial_referrer: "private" },
    }),
    {
      ...base,
      properties: {
        ...base.properties,
        location: "landing_hero",
        destination: "/setup",
      },
      $set: undefined,
      $set_once: undefined,
    }
  );
});

test("pageviews preserve only a query-free path and ingestion identifiers", () => {
  assert.deepEqual(
    sanitizePostHogCaptureEnvelope(
      {
        ...base,
        event: "$pageview",
        properties: {
          ...base.properties,
          $current_url:
            "https://meelni.com/feedback/private?token=secret#answer",
          $referrer: "https://search.example/private",
        },
      },
      "https://meelni.com"
    )?.properties,
    {
      ...base.properties,
      $current_url: "/feedback/private",
    }
  );
});

test("pageviews reduce external locations to origins", () => {
  assert.equal(
    sanitizePostHogCaptureEnvelope(
      {
        ...base,
        event: "$pageview",
        properties: {
          ...base.properties,
          $current_url: "https://partner.example/private?token=secret",
        },
      },
      "https://meelni.com"
    )?.properties.$current_url,
    "https://partner.example"
  );
});

test("identify preserves only minimized traits and unknown SDK events are rejected", () => {
  assert.deepEqual(
    sanitizePostHogCaptureEnvelope({
      ...base,
      event: "$identify",
      $set: {
        signup_method: "google",
        email: "jane@example.com",
        created_at: "private",
      },
    })?.$set,
    { signup_method: "google" }
  );
  assert.equal(
    sanitizePostHogCaptureEnvelope({
      ...base,
      event: "$exception",
      properties: { ...base.properties, $exception_message: "private" },
    }),
    null
  );
});
