import { describe, expect, it } from "vitest";

import {
  applyFeatureFlagOverride,
  parseFeatureFlagOverrides,
  setFeatureFlagOverride,
  type FeatureFlagOverrideMode,
} from "./local-overrides";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("local feature flag overrides", () => {
  it("ignores malformed stored override data", () => {
    expect(parseFeatureFlagOverrides("not json")).toEqual({});
    expect(parseFeatureFlagOverrides(JSON.stringify(["bad"]))).toEqual({});
    expect(parseFeatureFlagOverrides(JSON.stringify({ gate: "maybe" }))).toEqual({});
  });

  it("persists on and off overrides", () => {
    const storage = new MemoryStorage();

    const onOverrides = setFeatureFlagOverride(storage, "my_gate", "on");
    expect(onOverrides).toEqual({ my_gate: "on" });

    const offOverrides = setFeatureFlagOverride(storage, "my_gate", "off");
    expect(offOverrides).toEqual({ my_gate: "off" });
  });

  it("removes an override when set back to Statsig", () => {
    const storage = new MemoryStorage();

    setFeatureFlagOverride(storage, "my_gate", "on");
    const overrides = setFeatureFlagOverride(storage, "my_gate", "statsig");

    expect(overrides).toEqual({});
  });

  it.each([
    ["on", false, true],
    ["on", true, true],
    ["off", true, false],
    ["off", false, false],
    ["statsig", true, true],
    ["statsig", false, false],
  ] satisfies Array<[FeatureFlagOverrideMode, boolean, boolean]>)(
    "applies %s override over Statsig value %s",
    (override, statsigValue, expected) => {
      expect(applyFeatureFlagOverride(statsigValue, override)).toBe(expected);
    }
  );
});
