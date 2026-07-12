import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const LAUNCHER = resolve("scripts/run-evaluation-calibration-live.sh");
const BOOTSTRAP = resolve("scripts/run-evaluation-calibration-live.mjs");
const GITHUB_TOKEN = "github_pat_dummyAuditToken12345";
const OPENAI_KEY = "sk-dummyAuditKey12345";

test("trusted launcher strips ambient Node preload and treats argv flags as CLI data", async () => {
  const directory = mkdtempSync(join(tmpdir(), "meelni-launcher-preload-"));
  const preload = join(directory, "preload.cjs");
  const marker = join(directory, "preload-ran");
  writeFileSync(
    preload,
    `require("node:fs").writeFileSync(${JSON.stringify(marker)}, String(process.env.GITHUB_TOKEN || process.env.OPENAI_API_KEY || "no-token"));`
  );
  try {
    for (const scenario of [
      { env: { NODE_OPTIONS: `--require=${preload}` }, args: [] },
      { env: {}, args: ["--require", preload] },
    ]) {
      const result = await runLauncher({
        args: scenario.args,
        extraEnv: scenario.env,
        bootstrap: BOOTSTRAP,
        acknowledgement: "NOT_AUTHORIZED",
      });
      assert.notEqual(result.code, 0);
      assert.equal(existsSync(marker), false);
      assert.equal(result.output.includes(GITHUB_TOKEN), false);
      assert.equal(result.output.includes(OPENAI_KEY), false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("launcher sends no credential before the exact READY handshake", async () => {
  const directory = mkdtempSync(join(tmpdir(), "meelni-launcher-ready-"));
  const bootstrap = join(directory, "bootstrap.mjs");
  const resultPath = join(directory, "result.json");
  writeFileSync(
    bootstrap,
    `
      import { readdirSync, statSync, writeFileSync } from "node:fs";
      import { execFileSync } from "node:child_process";
      const secret = process.env.GITHUB_TOKEN || process.env.OPENAI_API_KEY;
      const argv = process.argv.join(" ");
      writeFileSync(3, "MEELNI_CALIBRATION_READY_V1\\n");
      const { createInterface } = await import("node:readline");
      const input = createInterface({ input: process.stdin });
      const lines = [];
      for await (const line of input) {
        lines.push(line);
        if (lines.length === 3) break;
      }
      input.close();
      process.stdin.pause();
      const payload = lines.join("\\n");
      const ps = execFileSync("/bin/ps", ["eww", "-p", String(process.pid), "-p", String(process.ppid), "-o", "command="], { encoding: "utf8" });
      const regularTempFiles = readdirSync("/tmp")
        .filter((name) => name.startsWith("meelni-calibration-live."))
        .flatMap((name) => readdirSync("/tmp/" + name).map((entry) => "/tmp/" + name + "/" + entry))
        .filter((path) => statSync(path).isFile());
      writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({
        secretBeforeReady: Boolean(secret),
        secretInArgv: argv.includes("dummyAudit"),
        secretInPs: ps.includes("dummyAudit"),
        regularTempFiles,
        receivedAfterReady: payload.includes("dummyAuditToken") && payload.includes("dummyAuditKey"),
      }));
    `
  );
  try {
    const result = await runLauncher({ bootstrap });
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(JSON.parse(readFileSync(resultPath, "utf8")), {
      secretBeforeReady: false,
      secretInArgv: false,
      secretInPs: false,
      regularTempFiles: [],
      receivedAfterReady: true,
    });
    assert.equal(result.output.includes(GITHUB_TOKEN), false);
    assert.equal(result.output.includes(OPENAI_KEY), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("wrong handshake and early bootstrap exit fail without writing credentials", async () => {
  const directory = mkdtempSync(join(tmpdir(), "meelni-launcher-fail-"));
  const credentialMarker = join(directory, "credentials-received");
  const wrong = join(directory, "wrong.mjs");
  const early = join(directory, "early.mjs");
  writeFileSync(
    wrong,
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(3, "WRONG\\n");
      let payload = "";
      for await (const chunk of process.stdin) payload += chunk;
      if (payload) writeFileSync(${JSON.stringify(credentialMarker)}, payload);
    `
  );
  writeFileSync(early, "process.exit(7);");
  try {
    const wrongResult = await runLauncher({ bootstrap: wrong });
    assert.notEqual(wrongResult.code, 0);
    assert.match(wrongResult.output, /handshake_invalid/);
    assert.equal(existsSync(credentialMarker), false);

    const earlyResult = await runLauncher({ bootstrap: early });
    assert.notEqual(earlyResult.code, 0);
    assert.match(earlyResult.output, /child_exited_before_ready/);
    assert.equal(existsSync(credentialMarker), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("canonical dummy launcher reaches the paid acknowledgement gate without API traffic", async () => {
  const result = await runLauncher({
    bootstrap: BOOTSTRAP,
    acknowledgement: "NOT_AUTHORIZED",
  });
  assert.equal(result.code, 1);
  assert.match(result.output, /Live calibration is disabled/);
  assert.doesNotMatch(result.output, /calibration_github_/);
  assert.equal(result.output.includes(GITHUB_TOKEN), false);
  assert.equal(result.output.includes(OPENAI_KEY), false);
});

function runLauncher({
  args = [],
  extraEnv = {},
  bootstrap,
  acknowledgement = "I_UNDERSTAND_THIS_CALLS_A_PAID_MODEL",
}) {
  return new Promise((resolvePromise, reject) => {
    const stdio = [
      "ignore",
      "pipe",
      "pipe",
      "ignore",
      "ignore",
      "ignore",
      "ignore",
      "ignore",
      "ignore",
      "pipe",
    ];
    const child = spawn(LAUNCHER, args, {
      env: {
        HOME: process.env.HOME,
        PATH: process.env.PATH,
        MEELNI_CALIBRATION_LAUNCHER_TEST_MODE: "1",
        MEELNI_CALIBRATION_TEST_CREDENTIAL_FD: "9",
        MEELNI_CALIBRATION_TEST_BOOTSTRAP: bootstrap,
        ...extraEnv,
      },
      detached: true,
      stdio,
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolvePromise({ code: code ?? (signal ? 128 : 1), output });
    });
    const timeout = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
      reject(new Error(`launcher test timed out: ${output}`));
    }, 15_000);
    child.stdio[9].end(`${GITHUB_TOKEN}\n${OPENAI_KEY}\n${acknowledgement}\n`);
  });
}
