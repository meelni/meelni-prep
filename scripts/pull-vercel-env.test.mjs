import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadHelpers() {
  const source = await readFile(new URL("./pull-vercel-env.mjs", import.meta.url), "utf8");
  const helperSource = source.slice(source.indexOf("function readExistingEnv"));

  return vm.runInNewContext(
    `${helperSource}; ({ normalizeEnvValue, readEnvValue });`,
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
