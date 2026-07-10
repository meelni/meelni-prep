import assert from "node:assert/strict";
import test from "node:test";

import {
  getTrustedClientIp,
  PublicDemoClientIpUnavailableError,
  readPublicDemoSessionId,
  resolvePublicDemoIdentity,
} from "./public-demo-identity";

const SECRET = "a-secure-test-secret-that-is-at-least-32-characters";
const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-07-09T12:00:00.000Z");

test("public demo identity signs stable cookies and stores only domain-separated digests", () => {
  const first = resolvePublicDemoIdentity({
    headers: headers("203.0.113.10"),
    secret: SECRET,
    randomId: sequence(DEVICE_ID, SESSION_ID),
    now: () => NOW,
    trustedVercelDeployment: true,
  });
  const second = resolvePublicDemoIdentity({
    headers: headers("203.0.113.10"),
    secret: SECRET,
    deviceCookie: first.deviceCookie,
    sessionCookie: first.sessionCookie,
    now: () => new Date(NOW.getTime() + 30_000),
    randomId: () => {
      throw new Error("valid cookies must not rotate");
    },
    trustedVercelDeployment: true,
  });

  assert.equal(first.sessionId, SESSION_ID);
  assert.deepEqual(second, first);
  assert.match(first.identifiers.ipHash, /^[0-9a-f]{64}$/);
  assert.notEqual(first.identifiers.ipHash, first.identifiers.deviceHash);
  assert.notEqual(first.identifiers.deviceHash, first.identifiers.sessionHash);
  assert.equal(JSON.stringify(first).includes("203.0.113.10"), false);
  assert.match(first.deviceCookie, /^v2\./);
  assert.match(first.sessionCookie, /^v2\./);
});

test("session acknowledgement accepts only the current signed session cookie", () => {
  const identity = resolvePublicDemoIdentity({
    headers: headers("203.0.113.10"),
    secret: SECRET,
    randomId: sequence(DEVICE_ID, SESSION_ID),
    now: () => NOW,
    trustedVercelDeployment: true,
  });

  assert.equal(
    readPublicDemoSessionId({
      sessionCookie: identity.sessionCookie,
      secret: SECRET,
      now: () => NOW,
    }),
    SESSION_ID
  );
  assert.equal(
    readPublicDemoSessionId({
      sessionCookie: `${identity.sessionCookie}x`,
      secret: SECRET,
      now: () => NOW,
    }),
    null
  );
  assert.equal(
    readPublicDemoSessionId({
      sessionCookie: identity.sessionCookie,
      secret: SECRET,
      now: () => new Date(NOW.getTime() + 15 * 60 * 1000),
    }),
    null
  );
});

test("tampered cookies rotate without trusting attacker-selected identifiers", () => {
  const first = resolvePublicDemoIdentity({
    headers: headers("203.0.113.11"),
    secret: SECRET,
    randomId: sequence(DEVICE_ID, SESSION_ID),
    now: () => NOW,
    trustedVercelDeployment: true,
  });
  const replacementDevice = "33333333-3333-4333-8333-333333333333";
  const replacementSession = "44444444-4444-4444-8444-444444444444";
  const rotated = resolvePublicDemoIdentity({
    headers: headers("203.0.113.11"),
    secret: SECRET,
    deviceCookie: `${first.deviceCookie}x`,
    sessionCookie: `${first.sessionCookie}x`,
    randomId: sequence(replacementDevice, replacementSession),
    now: () => NOW,
    trustedVercelDeployment: true,
  });

  assert.equal(rotated.sessionId, replacementSession);
  assert.notEqual(rotated.deviceCookie, first.deviceCookie);
  assert.notEqual(rotated.sessionCookie, first.sessionCookie);
});

test("trusted client IP parsing accepts only Vercel or an explicit local mode", () => {
  assert.equal(
    getTrustedClientIp(headers("2001:db8::1"), {
      trustedVercelDeployment: true,
    }),
    "2001:db8:0:0::/64"
  );
  assert.equal(
    getTrustedClientIp(headers("2001:0db8:0:0:abcd::99"), {
      trustedVercelDeployment: true,
    }),
    "2001:db8:0:0::/64"
  );
  assert.equal(
    getTrustedClientIp(headers("::ffff:192.0.2.1"), {
      trustedVercelDeployment: true,
    }),
    "192.0.2.1"
  );
  assert.equal(
    getTrustedClientIp(
      new Headers({ "x-vercel-forwarded-for": "203.0.113.12, 10.0.0.1" }),
      { trustedVercelDeployment: true }
    ),
    "203.0.113.12"
  );
  assert.equal(
    getTrustedClientIp(new Headers({ "x-vercel-forwarded-for": "not-an-ip" }), {
      trustedVercelDeployment: true,
    }),
    null
  );
  assert.equal(
    getTrustedClientIp(
      new Headers({
        "x-vercel-forwarded-for": "203.0.113.98",
        "x-forwarded-for": "203.0.113.99",
        "x-real-ip": "203.0.113.100",
      }),
      { trustedVercelDeployment: false }
    ),
    null
  );
  assert.equal(
    getTrustedClientIp(new Headers({ "x-forwarded-for": "203.0.113.99" }), {
      trustedLocalDevelopment: true,
      trustedVercelDeployment: false,
    }),
    "127.0.0.1"
  );
  assert.throws(
    () =>
      resolvePublicDemoIdentity({
        headers: new Headers(),
        secret: SECRET,
        trustedVercelDeployment: true,
      }),
    PublicDemoClientIpUnavailableError
  );
});

test("signed cookie expiry and future issued-at claims rotate server-side", () => {
  const first = resolvePublicDemoIdentity({
    headers: headers("203.0.113.12"),
    secret: SECRET,
    randomId: sequence(DEVICE_ID, SESSION_ID),
    now: () => NOW,
    trustedVercelDeployment: true,
  });
  const replacementSession = "33333333-3333-4333-8333-333333333333";
  const afterSessionExpiry = resolvePublicDemoIdentity({
    headers: headers("203.0.113.12"),
    secret: SECRET,
    deviceCookie: first.deviceCookie,
    sessionCookie: first.sessionCookie,
    randomId: sequence(replacementSession),
    now: () => new Date(NOW.getTime() + 15 * 60 * 1000),
    trustedVercelDeployment: true,
  });
  assert.equal(afterSessionExpiry.deviceCookie, first.deviceCookie);
  assert.equal(afterSessionExpiry.sessionId, replacementSession);

  const replacementDevice = "44444444-4444-4444-8444-444444444444";
  const replacementFutureSession = "55555555-5555-4555-8555-555555555555";
  const clockBeforeIssuance = resolvePublicDemoIdentity({
    headers: headers("203.0.113.12"),
    secret: SECRET,
    deviceCookie: first.deviceCookie,
    sessionCookie: first.sessionCookie,
    randomId: sequence(replacementDevice, replacementFutureSession),
    now: () => new Date(NOW.getTime() - 2 * 60 * 1000),
    trustedVercelDeployment: true,
  });
  assert.equal(clockBeforeIssuance.sessionId, replacementFutureSession);
  assert.notEqual(clockBeforeIssuance.deviceCookie, first.deviceCookie);
});

function headers(ip: string): Headers {
  return new Headers({ "x-vercel-forwarded-for": ip });
}

function sequence(...values: string[]): () => string {
  let index = 0;
  return () => values[index++]!;
}
