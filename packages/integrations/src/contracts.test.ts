import assert from "node:assert/strict";
import test from "node:test";

import { createLiveKitStartFixture } from "@meelni/test-fixtures";

import {
  buildInterviewRoomName,
  createLiveKitInterviewProvider,
  findMissingRequiredEnv,
  getLiveKitAgentName,
  getLiveKitEnvironment,
  getProviderEnvContract,
  INTEGRATION_PROVIDERS,
  isProviderFailure,
  listProviderEnvVars,
  providerFailure,
  providerSuccess,
  type LiveKitInterviewProvider,
} from "./index";

test("declares the provider set used by the current app", () => {
  assert.deepEqual(INTEGRATION_PROVIDERS, [
    "supabase",
    "livekit",
    "stripe",
    "posthog",
    "google_sheets",
    "inngest",
  ]);
});

test("livekit env contract captures server keys and websocket URL alternatives", () => {
  const contract = getProviderEnvContract("livekit");

  assert.equal(contract.provider, "livekit");
  assert.deepEqual(listProviderEnvVars("livekit"), [
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "LIVEKIT_INTERVIEW_AGENT_NAME",
    "LIVEKIT_DEMO_AGENT_NAME",
    "NEXT_PUBLIC_LIVEKIT_URL",
    "LIVEKIT_URL",
  ]);
});

test("missing env detection supports required vars and at-least-one groups", () => {
  const missing = findMissingRequiredEnv("livekit", {
    LIVEKIT_API_KEY: "key",
    LIVEKIT_API_SECRET: "",
    NEXT_PUBLIC_LIVEKIT_URL: "",
    LIVEKIT_URL: "",
  });

  assert.deepEqual(missing, [
    "LIVEKIT_API_SECRET",
    "NEXT_PUBLIC_LIVEKIT_URL or LIVEKIT_URL",
  ]);
});

test("google sheets contract exposes supported credential alternatives", () => {
  assert.deepEqual(findMissingRequiredEnv("google_sheets", {}), [
    "GOOGLE_SHEET_CSV_URL or GOOGLE_SHEETS_API_KEY or GOOGLE_SHEETS_CREDENTIALS_BASE64 or GOOGLE_SHEETS_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  ]);
});

test("stripe env contract matches the credit billing catalog", () => {
  assert.deepEqual(listProviderEnvVars("stripe"), [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_INTERVIEW_PASS_PRICE_ID",
    "STRIPE_STARTER_MONTHLY_PRICE_ID",
    "STRIPE_PRO_MONTHLY_PRICE_ID",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  ]);

  assert.deepEqual(findMissingRequiredEnv("stripe", {}), [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_INTERVIEW_PASS_PRICE_ID",
    "STRIPE_STARTER_MONTHLY_PRICE_ID",
    "STRIPE_PRO_MONTHLY_PRICE_ID",
  ]);
});

test("provider results normalize success and retryable failures", () => {
  const success = providerSuccess("stripe", { checkoutSessionId: "cs_test_1" });

  assert.equal(success.ok, true);
  assert.equal(success.provider, "stripe");
  assert.deepEqual(success.data, { checkoutSessionId: "cs_test_1" });

  const failure = providerFailure("supabase", {
    code: "auth_unavailable",
    message: "Could not reach Supabase Auth.",
    retryable: true,
  });

  assert.equal(isProviderFailure(failure), true);
  assert.equal(failure.ok, false);
  assert.equal(failure.error.retryable, true);
});

test("getLiveKitEnvironment reports missing required LiveKit config", () => {
  const result = getLiveKitEnvironment({});

  assert.equal(result.ok, false);
  assert.equal(result.provider, "livekit");
  assert.equal(result.error.code, "livekit_env_missing");
  assert.equal(result.error.retryable, false);
});

test("getLiveKitEnvironment accepts public or server websocket URL", () => {
  const result = getLiveKitEnvironment({
    LIVEKIT_API_KEY: "key",
    LIVEKIT_API_SECRET: "secret",
    LIVEKIT_URL: "wss://server.livekit.cloud",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data, {
      apiKey: "key",
      apiSecret: "secret",
      url: "wss://server.livekit.cloud",
    });
  }
});

test("getLiveKitAgentName reads per-account dispatch names", () => {
  const result = getLiveKitAgentName("interview", {
    LIVEKIT_INTERVIEW_AGENT_NAME: "interview-agent-prod",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data, "interview-agent-prod");
  }
});

test("getLiveKitAgentName reports missing dispatch names", () => {
  const result = getLiveKitAgentName("demo", {});

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "livekit_agent_name_missing");
    assert.equal(result.error.retryable, false);
  }
});

test("buildInterviewRoomName creates deterministic interview room names for tests", () => {
  const name = buildInterviewRoomName({
    now: 1782600000000,
    random: () => 0.5,
  });

  assert.match(name, /^interview-1782600000000-/);
});

test("LiveKit provider creates room, dispatches agent, and mints token", async () => {
  const fixture = createLiveKitStartFixture();
  const calls: string[] = [];
  const provider: LiveKitInterviewProvider = createLiveKitInterviewProvider({
    accessTokenFactory: class {
      addGrant() {
        calls.push("grant");
      }

      async toJwt() {
        calls.push("jwt");
        return "token-1";
      }
    },
    agentDispatchClientFactory: () => ({
      createDispatch: async () => {
        calls.push("dispatch");
      },
    }),
    roomServiceClientFactory: () => ({
      createRoom: async () => {
        calls.push("room");
      },
    }),
  });

  const result = await provider.startInterviewRoom(fixture.input);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data, {
      roomName: fixture.input.roomName,
      token: "token-1",
      url: fixture.input.env.url,
    });
  }
  assert.deepEqual(calls, ["room", "dispatch", "grant", "jwt"]);
});
