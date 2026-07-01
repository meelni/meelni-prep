import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadHelpers() {
  const source = await readFile(new URL("./pull-vercel-env.mjs", import.meta.url), "utf8");
  const helperSource = source.slice(source.indexOf("function readExistingEnv"));

  return vm.runInNewContext(
    `${helperSource}; ({ mergeFallbackEnv, normalizeEnvValue, readEnvValue });`,
    {}
  );
}

test("normalizeEnvValue only strips matched quote pairs", async () => {
  const { normalizeEnvValue } = await loadHelpers();

  assert.equal(normalizeEnvValue('"wss://host.livekit.cloud"'), "wss://host.livekit.cloud");
  assert.equal(normalizeEnvValue("'wss://host.livekit.cloud'"), "wss://host.livekit.cloud");
  assert.equal(
    normalizeEnvValue("'wss://host.livekit.cloud\""),
    "'wss://host.livekit.cloud\""
  );
});

test("readEnvValue treats env keys as literal strings", async () => {
  const { readEnvValue } = await loadHelpers();
  const env = [
    "LIVEKITXURL=wss://wrong.livekit.cloud",
    "LIVEKIT.URL=wss://right.livekit.cloud",
  ].join("\n");

  assert.equal(readEnvValue(env, "LIVEKIT.URL"), "wss://right.livekit.cloud");
});

test("mergeFallbackEnv fills placeholder values from fallback env", async () => {
  const { mergeFallbackEnv, readEnvValue } = await loadHelpers();
  const env = [
    "LIVEKIT_API_KEY=your_api_key",
    "LIVEKIT_API_SECRET=your_api_secret",
    "NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud",
    "DATABASE_URL=postgresql://preview.example",
  ].join("\n");
  const fallback = {
    DATABASE_URL: "postgresql://development.example",
    LIVEKIT_API_KEY: "livekit-key",
    LIVEKIT_API_SECRET: "livekit-secret",
    NEXT_PUBLIC_LIVEKIT_URL: "wss://meelni.livekit.cloud",
  };

  const merged = mergeFallbackEnv(env, fallback, [
    "DATABASE_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "NEXT_PUBLIC_LIVEKIT_URL",
  ]);

  assert.equal(readEnvValue(merged, "DATABASE_URL"), "postgresql://preview.example");
  assert.equal(readEnvValue(merged, "LIVEKIT_API_KEY"), "livekit-key");
  assert.equal(readEnvValue(merged, "LIVEKIT_API_SECRET"), "livekit-secret");
  assert.equal(readEnvValue(merged, "NEXT_PUBLIC_LIVEKIT_URL"), "wss://meelni.livekit.cloud");
});

test("mergeFallbackEnv does not replace real values with placeholders", async () => {
  const { mergeFallbackEnv, readEnvValue } = await loadHelpers();
  const env = "OPENAI_API_KEY=sk-real";
  const fallback = {
    OPENAI_API_KEY: "sk-proj-xxx",
  };

  const merged = mergeFallbackEnv(env, fallback, ["OPENAI_API_KEY"]);

  assert.equal(readEnvValue(merged, "OPENAI_API_KEY"), "sk-real");
});
