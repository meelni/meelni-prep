import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EXPECTED_PREVIEW_SUPABASE_PROJECT_REF,
  EXPECTED_PRODUCTION_SUPABASE_PROJECT_REF,
} from "../lib/supabase/supabase-jwt.mjs";
import {
  parsePreviewShadowControlPlaneEnvironment,
  parsePreviewShadowLiveKitEnvironment,
  runPreviewShadowOperatorCli,
} from "./run-adaptive-interviewer-preview-shadow";

const PREVIEW_DATABASE_URL = `postgresql://postgres.${EXPECTED_PREVIEW_SUPABASE_PROJECT_REF}:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;

function environment(overrides: Record<string, string> = {}) {
  return Object.entries({
    DATABASE_URL: PREVIEW_DATABASE_URL,
    MEELNI_ENV_PULL_ENVIRONMENT: "preview",
    MEELNI_PRODUCTION_SUPABASE_PROJECT_REF:
      EXPECTED_PRODUCTION_SUPABASE_PROJECT_REF,
    VERCEL_ENV: "preview",
    VERCEL_TARGET_ENV: "staging",
    ...overrides,
  })
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function functionBody(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1);
  assert.notEqual(to, -1);
  return source.slice(from, to);
}

test("Preview-shadow operator help is provider-free and content-free", async () => {
  let output = "";
  const status = await runPreviewShadowOperatorCli([], {
    write(value: string) {
      output += value;
      return true;
    },
  });

  assert.equal(status, 0);
  assert.match(output, /Preview-shadow operator/);
  assert.match(output, /--packet-directory PATH/);
  assert.match(output, /prepare-staging-activation-request/);
  assert.match(output, /prepare-production-project-runtime/);
  assert.match(output, /prepare-production-project-cell/);
  assert.match(output, /start-production-project-cell/);
  assert.doesNotMatch(output, /token|capability\.txt|DATABASE_URL/);
});

test("Preview-shadow operator rejects unknown and incomplete authority options", async () => {
  await assert.rejects(
    () =>
      runPreviewShadowOperatorCli([
        "activate",
        "--packet-directory",
        "/tmp/external",
        "--unknown",
        "value",
      ]),
    /preview_shadow_operator_option_unknown/
  );
  await assert.rejects(
    () =>
      runPreviewShadowOperatorCli([
        "stop",
        "--activation-path",
        "/tmp/activation.json",
        "--env-file",
        "/tmp/preview.env",
        "--expected-revision",
        "1",
        "--reason",
        "kill_switch_failure",
        "--evidence-sha256",
        "a".repeat(64),
      ]),
    /preview_shadow_operator_packet-directory_required/
  );
});

test("durable activation accepts exact staging identity without LiveKit credentials", () => {
  assert.deepEqual(parsePreviewShadowControlPlaneEnvironment(environment()), {
    DATABASE_URL: PREVIEW_DATABASE_URL,
  });

  assert.throws(
    () => parsePreviewShadowLiveKitEnvironment(environment()),
    /preview_shadow_operator_environment_invalid/
  );
});

test("durable activation rejects missing or non-staging database identity", () => {
  const changes: Array<Record<string, string>> = [
    { DATABASE_URL: "" },
    { MEELNI_ENV_PULL_ENVIRONMENT: "production" },
    { VERCEL_ENV: "production" },
    { VERCEL_TARGET_ENV: "preview" },
    {
      DATABASE_URL: `postgresql://postgres.${EXPECTED_PRODUCTION_SUPABASE_PROJECT_REF}:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres`,
    },
  ];
  for (const changed of changes) {
    assert.throws(
      () => parsePreviewShadowControlPlaneEnvironment(environment(changed)),
      /preview_shadow_operator_environment_invalid/
    );
  }
});

test("Preview room construction still requires exact Preview LiveKit identity", () => {
  const exact = environment({
    LIVEKIT_URL: "wss://meelni-preview-dk7443ua.livekit.cloud",
    NEXT_PUBLIC_LIVEKIT_URL: "wss://meelni-preview-dk7443ua.livekit.cloud",
    LIVEKIT_INTERVIEW_AGENT_NAME: "meelni-preview-interview",
    LIVEKIT_API_KEY: "preview-key",
    LIVEKIT_API_SECRET: "preview-secret",
  });
  assert.deepEqual(parsePreviewShadowLiveKitEnvironment(exact), {
    DATABASE_URL: PREVIEW_DATABASE_URL,
    LIVEKIT_URL: "wss://meelni-preview-dk7443ua.livekit.cloud",
    LIVEKIT_API_KEY: "preview-key",
    LIVEKIT_API_SECRET: "preview-secret",
    LIVEKIT_INTERVIEW_AGENT_NAME: "meelni-preview-interview",
  });

  const changes: Array<Record<string, string>> = [
    { LIVEKIT_URL: "wss://meelni-ek4vaisp.livekit.cloud" },
    { LIVEKIT_INTERVIEW_AGENT_NAME: "CA_yawKG67rCMG4" },
    { LIVEKIT_API_KEY: "" },
    { LIVEKIT_API_SECRET: "" },
  ];
  for (const changed of changes) {
    assert.throws(
      () =>
        parsePreviewShadowLiveKitEnvironment(
          `${exact}\n${environment(changed)}`
        ),
      /preview_shadow_operator_environment_invalid/
    );
  }
});

test("only durable control-plane mutations use the staging-only environment", async () => {
  const source = await readFile(
    new URL("./run-adaptive-interviewer-preview-shadow.ts", import.meta.url),
    "utf8"
  );
  const activate = functionBody(
    source,
    "async function activate",
    "async function startCell"
  );
  const startCell = functionBody(
    source,
    "async function startCell",
    "async function prepareProductionProjectCell"
  );
  const stop = functionBody(
    source,
    "async function stopRun",
    "async function loadPreviewEnvironment"
  );

  assert.match(activate, /loadPreviewControlPlaneEnvironment/);
  assert.doesNotMatch(activate, /loadPreviewEnvironment\(/);
  assert.match(stop, /loadPreviewControlPlaneEnvironment/);
  assert.doesNotMatch(stop, /loadPreviewEnvironment\(/);
  assert.match(startCell, /loadPreviewEnvironment\(/);
  assert.doesNotMatch(startCell, /loadPreviewControlPlaneEnvironment/);
});
