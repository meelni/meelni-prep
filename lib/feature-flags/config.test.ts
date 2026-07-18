import { describe, expect, it } from "vitest";
import {
  buildStatsigUser,
  getStatsigConfig,
  localFeatureFlagOverridesEnabled,
} from "./config";

describe("Statsig feature flag config", () => {
  it("permits local gate overrides only in development", () => {
    expect(localFeatureFlagOverridesEnabled("development")).toBe(true);
    expect(localFeatureFlagOverridesEnabled("production")).toBe(false);
    expect(localFeatureFlagOverridesEnabled("test")).toBe(false);
  });
  it("disables Statsig when the public client key is missing", () => {
    const config = getStatsigConfig({
      NODE_ENV: "production",
      NEXT_PUBLIC_STATSIG_CLIENT_KEY: "",
    });

    expect(config.enabled).toBe(false);
    expect(config.clientKey).toBe("");
  });

  it("enables Statsig when a public client key is configured outside tests", () => {
    const config = getStatsigConfig({
      NODE_ENV: "production",
      NEXT_PUBLIC_STATSIG_CLIENT_KEY: "client-test-key",
    });

    expect(config.enabled).toBe(true);
    expect(config.clientKey).toBe("client-test-key");
    expect(config.debug).toBe(false);
  });

  it("defaults local development to the same-origin Statsig proxy", () => {
    const config = getStatsigConfig({
      NODE_ENV: "development",
      NEXT_PUBLIC_STATSIG_CLIENT_KEY: "client-test-key",
    });

    expect(config.apiUrl).toBe("/api/statsig");
  });

  it("allows overriding the Statsig API host", () => {
    const config = getStatsigConfig({
      NODE_ENV: "development",
      NEXT_PUBLIC_STATSIG_API_URL: "https://statsig.example.test/v1",
      NEXT_PUBLIC_STATSIG_CLIENT_KEY: "client-test-key",
    });

    expect(config.apiUrl).toBe("https://statsig.example.test/v1");
  });

  it("keeps Statsig disabled in tests even when a key exists", () => {
    const config = getStatsigConfig({
      NODE_ENV: "test",
      NEXT_PUBLIC_STATSIG_CLIENT_KEY: "client-test-key",
    });

    expect(config.enabled).toBe(false);
  });
});

describe("Statsig user mapping", () => {
  it("uses only the analytics pseudonym and minimized traits for signed-in users", () => {
    const user = buildStatsigUser({
      anonymousId: "anon-123",
      analyticsPseudonym: "user_pseudonym",
      loggedIn: true,
    });

    expect(user).toEqual({
      userID: "user_pseudonym",
      custom: {
        anonymous_id: "anon-123",
        local_dev_id: "anon-123",
        logged_in: true,
      },
    });
  });

  it("falls back to a stable anonymous id before login", () => {
    const user = buildStatsigUser({
      anonymousId: "anon-123",
    });

    expect(user).toEqual({
      userID: "anon-123",
      custom: {
        anonymous_id: "anon-123",
        local_dev_id: "anon-123",
        logged_in: false,
      },
    });
  });
});
