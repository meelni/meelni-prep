import { describe, expect, it } from "vitest";
import { buildStatsigUser, getStatsigConfig } from "./config";

describe("Statsig feature flag config", () => {
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
  it("uses the Supabase user id and non-PII custom traits for signed-in users", () => {
    const user = buildStatsigUser({
      anonymousId: "anon-123",
      user: {
        id: "user-123",
        email: "pm@example.com",
        created_at: "2026-06-01T12:00:00.000Z",
        app_metadata: {
          provider: "google",
        },
      },
    });

    expect(user).toEqual({
      userID: "user-123",
      custom: {
        anonymous_id: "anon-123",
        created_at: "2026-06-01T12:00:00.000Z",
        email_domain: "example.com",
        local_dev_id: "anon-123",
        signup_method: "google",
      },
    });
  });

  it("falls back to a stable anonymous id before login", () => {
    const user = buildStatsigUser({
      anonymousId: "anon-123",
      user: null,
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
