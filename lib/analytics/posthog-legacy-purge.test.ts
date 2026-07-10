import assert from "node:assert/strict";
import test from "node:test";

import {
  POSTHOG_LEGACY_PURGE_MARKER,
  purgeLegacyPostHogIdentity,
} from "./posthog-legacy-purge";

test("one-time purge removes legacy PostHog identities without touching Meelni consent", () => {
  const local = storage({
    ph_phc_old_posthog: "legacy-user-and-props",
    __ph_opt_in_out_phc_old: "1",
    meelni_analytics_consent: "v1.declined.safe",
    unrelated: "keep",
  });
  const session = storage({
    ph_phc_old_posthog_session: "legacy-session",
    safe_session: "keep",
  });
  const expired: string[] = [];
  const first = purgeLegacyPostHogIdentity({
    cookieNames: [
      "ph_phc_old_posthog",
      "__ph_opt_in_out_phc_old",
      "meelni_analytics_consent",
      "unrelated_cookie",
    ],
    expireCookie: (name) => expired.push(name),
    localStorage: local.api,
    sessionStorage: session.api,
  });

  assert.equal(first, true);
  assert.deepEqual([...local.values.entries()].sort(), [
    ["meelni_analytics_consent", "v1.declined.safe"],
    [POSTHOG_LEGACY_PURGE_MARKER, "1"],
    ["unrelated", "keep"],
  ]);
  assert.deepEqual([...session.values.entries()], [["safe_session", "keep"]]);
  assert.deepEqual(expired.sort(), [
    "__ph_opt_in_out_phc_old",
    "ph_phc_old_posthog",
  ]);

  assert.equal(
    purgeLegacyPostHogIdentity({
      cookieNames: [],
      expireCookie: () => assert.fail("purge repeated"),
      localStorage: local.api,
      sessionStorage: session.api,
    }),
    false
  );
});

function storage(seed: Record<string, string>) {
  const values = new Map(Object.entries(seed));
  return {
    values,
    api: {
      get length() {
        return values.size;
      },
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => {
        values.delete(key);
      },
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    },
  };
}
