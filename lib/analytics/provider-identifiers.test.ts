import assert from "node:assert/strict";
import test from "node:test";

import {
  STATSIG_ANONYMOUS_ID_KEY,
  clearStatsigAnonymousIdentifiers,
  getOrCreateStatsigAnonymousId,
} from "../feature-flags/anonymous-id";

test("withdrawal clears current and legacy provider identifiers", () => {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { crypto: { randomUUID: () => "first-id" }, localStorage },
  });
  values.set("statsig.stable_id", "legacy-one");
  values.set("statsig_stable_id", "legacy-two");
  const first = getOrCreateStatsigAnonymousId();
  assert.equal(values.get(STATSIG_ANONYMOUS_ID_KEY), first);

  clearStatsigAnonymousIdentifiers();
  assert.equal(values.size, 0);
  Object.defineProperty(globalThis.window.crypto, "randomUUID", {
    value: () => "second-id",
  });
  assert.notEqual(getOrCreateStatsigAnonymousId(), first);
  Reflect.deleteProperty(globalThis, "window");
});
