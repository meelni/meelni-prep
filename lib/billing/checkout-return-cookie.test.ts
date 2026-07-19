import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKOUT_RETURN_COOKIE_LIMIT,
  CHECKOUT_RETURN_COOKIE_NAMES,
  CHECKOUT_RETURN_STORAGE_KEY,
  checkoutReturnCorrelationFromCookie,
  checkoutReturnCookieName,
  checkoutReturnCookieSlot,
  checkoutSessionIdFromReturnCookie,
  clearCheckoutReturnHandle,
  encodeCheckoutReturnCookie,
  parseCheckoutCreateResponse,
  readCheckoutReturnHandle,
  storeCheckoutReturnHandle,
} from "./checkout-return-cookie";

const HANDLE = "cr_0123456789abcdef0123456789abcdef";
const SESSION_ID = "cs_test_checkout_cookie_123";

test("Checkout create responses require a hosted URL and opaque handle", () => {
  assert.deepEqual(
    parseCheckoutCreateResponse({
      url: "https://checkout.stripe.example/session",
      returnHandle: HANDLE,
      reused: true,
    }),
    {
      url: "https://checkout.stripe.example/session",
      returnHandle: HANDLE,
      reused: true,
    }
  );
  for (const invalid of [
    null,
    { url: "/relative", returnHandle: HANDLE },
    { url: "http://checkout.invalid", returnHandle: HANDLE },
    { url: "https://checkout.invalid", returnHandle: "cr_short" },
    { url: "https://checkout.invalid", returnHandle: HANDLE, reused: "yes" },
  ]) {
    assert.equal(parseCheckoutCreateResponse(invalid), null);
  }
});

test("same-tab storage preserves a handle until its terminal result", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  assert.equal(storeCheckoutReturnHandle(storage, HANDLE), true);
  assert.equal(readCheckoutReturnHandle(storage), HANDLE);
  clearCheckoutReturnHandle(storage, "cr_fedcba9876543210fedcba9876543210");
  assert.equal(values.get(CHECKOUT_RETURN_STORAGE_KEY), HANDLE);
  clearCheckoutReturnHandle(storage, HANDLE);
  assert.equal(readCheckoutReturnHandle(storage), null);
});

test("deterministic slot names impose a hard eight-cookie cap", () => {
  const names = new Set<string>();
  for (let index = 0; index < 256; index += 1) {
    const handle = `cr_${index.toString(36).padStart(32, "0")}`;
    const name = checkoutReturnCookieName(handle);
    assert.ok(name);
    names.add(name);
  }
  assert.equal(names.size, CHECKOUT_RETURN_COOKIE_LIMIT);
  assert.deepEqual([...names].sort(), CHECKOUT_RETURN_COOKIE_NAMES);
});

test("cookie correlation carries a sortable creation timestamp", () => {
  const value = encodeCheckoutReturnCookie(
    HANDLE,
    SESSION_ID,
    1_783_932_163_000
  );
  assert.ok(value);
  assert.deepEqual(checkoutReturnCorrelationFromCookie(value), {
    handle: HANDLE,
    sessionId: SESSION_ID,
    createdAtMs: 1_783_932_163_000,
  });
  for (const invalid of [
    null,
    `${HANDLE}:${SESSION_ID}`,
    `${HANDLE}:${SESSION_ID}:not-a-time`,
    `${HANDLE}:${SESSION_ID}:0`,
    `${HANDLE}:${SESSION_ID}:123:extra`,
  ]) {
    assert.equal(checkoutReturnCorrelationFromCookie(invalid), null);
  }
});

test("slot collisions bind the cookie to one exact handle and fail closed", () => {
  const collision = Array.from(
    { length: 256 },
    (_, index) => `cr_${index.toString(36).padStart(32, "0")}`
  ).find(
    (candidate) =>
      candidate !== HANDLE &&
      checkoutReturnCookieSlot(candidate) === checkoutReturnCookieSlot(HANDLE)
  );
  assert.ok(collision);
  assert.equal(
    checkoutReturnCookieName(collision),
    checkoutReturnCookieName(HANDLE)
  );
  const value = encodeCheckoutReturnCookie(collision, SESSION_ID);
  assert.ok(value);
  assert.equal(checkoutSessionIdFromReturnCookie(value, collision), SESSION_ID);
  assert.equal(checkoutSessionIdFromReturnCookie(value, HANDLE), null);
});
