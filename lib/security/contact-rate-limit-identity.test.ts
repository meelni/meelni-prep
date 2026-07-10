import assert from "node:assert/strict";
import test from "node:test";

import {
  createContactRateLimitIdentities,
  isValidContactRateLimitSecret,
} from "./contact-rate-limit-identity";

const secret = "a-dedicated-contact-secret-with-32-chars";

test("derives stable opaque identities from Vercel's trusted client header", () => {
  const headers = new Headers({
    "x-vercel-forwarded-for": "203.0.113.7",
    "x-forwarded-for": "198.51.100.8",
  });
  const environment = {
    CONTACT_RATE_LIMIT_HMAC_SECRET: secret,
    NODE_ENV: "production",
    VERCEL: "1",
  };

  const first = createContactRateLimitIdentities(
    headers,
    "person@example.invalid",
    environment
  );
  const second = createContactRateLimitIdentities(
    headers,
    "person@example.invalid",
    environment
  );

  assert.deepEqual(first, second);
  assert.match(first.client, /^[0-9a-f]{64}$/);
  assert.match(first.email, /^[0-9a-f]{64}$/);
  assert.notEqual(first.client, first.email);
  assert.equal(JSON.stringify(first).includes("203.0.113.7"), false);
  assert.equal(JSON.stringify(first).includes("person@example.invalid"), false);
});

test("fails closed without trusted production edge context or a strong secret", () => {
  const headers = new Headers({ "x-forwarded-for": "203.0.113.7" });

  assert.throws(
    () =>
      createContactRateLimitIdentities(headers, "person@example.invalid", {
        CONTACT_RATE_LIMIT_HMAC_SECRET: secret,
        NODE_ENV: "production",
      }),
    /contact_trusted_edge_unavailable/
  );
  assert.throws(
    () =>
      createContactRateLimitIdentities(headers, "person@example.invalid", {
        CONTACT_RATE_LIMIT_HMAC_SECRET: "too-short",
      }),
    /contact_rate_limit_secret_unavailable/
  );
});

test("accepts only a valid local forwarding address outside production", () => {
  assert.throws(
    () =>
      createContactRateLimitIdentities(
        new Headers({ "x-forwarded-for": "not-an-ip" }),
        "person@example.invalid",
        {
          CONTACT_RATE_LIMIT_HMAC_SECRET: secret,
          NODE_ENV: "development",
        }
      ),
    /contact_trusted_client_address_unavailable/
  );
});

test("rejects low-diversity and placeholder HMAC secrets", () => {
  assert.equal(isValidContactRateLimitSecret(secret), true);
  assert.equal(isValidContactRateLimitSecret("a".repeat(64)), false);
  assert.equal(
    isValidContactRateLimitSecret("change-me-contact-secret-1234567890"),
    false
  );
});
