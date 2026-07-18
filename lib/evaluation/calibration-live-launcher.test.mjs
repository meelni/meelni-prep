import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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

test("canonical launcher refuses the pending v3 proposal before readiness or API traffic", async () => {
  const result = await runLauncher({
    bootstrap: BOOTSTRAP,
    acknowledgement: "NOT_AUTHORIZED",
  });
  assert.equal(result.code, 1);
  assert.match(
    result.output,
    /calibration_v3_requires_fresh_exact_product_owner_authorization/
  );
  assert.doesNotMatch(result.output, /calibration_github_/);
  assert.equal(result.output.includes(GITHUB_TOKEN), false);
  assert.equal(result.output.includes(OPENAI_KEY), false);
});

test("production launcher rejects a coherent bundle and manifest replacement before readiness", () => {
  const root = mkdtempSync(join(tmpdir(), "meelni-launcher-reviewed-"));
  const files = [
    "scripts/run-evaluation-calibration-live.sh",
    "scripts/run-evaluation-calibration-live.mjs",
    "scripts/generated/run-evaluation-calibration.bundle.mjs",
    "lib/evaluation/calibration-live-startup.mjs",
    "docs/evidence/sav-248-v3-runtime-manifest.json",
    "package-lock.json",
  ];
  const git = (...args) =>
    execFileSync("/usr/bin/git", ["-C", root, ...args], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin" },
    }).trim();
  try {
    for (const relative of files) {
      const destination = join(root, relative);
      mkdirSync(resolve(destination, ".."), { recursive: true });
      copyFileSync(resolve(relative), destination);
    }
    chmodSync(join(root, "scripts/run-evaluation-calibration-live.sh"), 0o755);
    git("init", "--quiet");
    git("config", "user.name", "Calibration Test");
    git("config", "user.email", "calibration@example.invalid");
    git("add", ".");
    git("commit", "--quiet", "-m", "reviewed launcher");
    const reviewedCommit = git("rev-parse", "HEAD");

    const bundle = Buffer.from(
      'import { writeFileSync } from "node:fs"; writeFileSync(4, "MEELNI_CALIBRATION_RUNTIME_READY_V1\\n");\n'
    );
    const bundlePath = join(
      root,
      "scripts/generated/run-evaluation-calibration.bundle.mjs"
    );
    writeFileSync(bundlePath, bundle);
    const manifestPath = join(
      root,
      "docs/evidence/sav-248-v3-runtime-manifest.json"
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.bundleBytes = bundle.length;
    manifest.bundleSha256 = createHash("sha256")
      .update(bundle)
      .digest("hex");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = spawnSync(
      join(root, "scripts/run-evaluation-calibration-live.sh"),
      [],
      {
        encoding: "utf8",
        env: {
          HOME: process.env.HOME,
          PATH: process.env.PATH,
          MEELNI_CALIBRATION_REVIEWED_SOURCE_COMMIT: reviewedCommit,
        },
        timeout: 5_000,
      }
    );
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    assert.equal(result.status, 1, output);
    assert.match(output, /calibration_live_launcher_reviewed_blob_mismatch/);
    assert.doesNotMatch(output, /MEELNI_CALIBRATION_READY_V1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("signals interrupt the launcher before bootstrap readiness without leftovers", async () => {
  const directory = mkdtempSync(
    join(tmpdir(), "meelni-launcher-interrupt-ready-")
  );
  const bootstrap = join(directory, "bootstrap.mjs");
  writeFileSync(bootstrap, "setInterval(() => {}, 1000);");
  const before = launcherChannelDirectories();
  try {
    const result = await runLauncher({
      bootstrap,
      credentialPayload: null,
      signalAfterMs: 100,
    });
    assert.ok([128, 143].includes(result.code), result.output);
    assert.deepEqual(launcherChannelDirectories(), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a stalled credential helper is bounded after bootstrap readiness", async () => {
  const directory = mkdtempSync(
    join(tmpdir(), "meelni-launcher-stalled-helper-")
  );
  const bootstrap = join(directory, "bootstrap.mjs");
  writeFileSync(
    bootstrap,
    'import { writeFileSync } from "node:fs"; writeFileSync(3, "MEELNI_CALIBRATION_READY_V1\\n"); setInterval(() => {}, 1000);'
  );
  const before = launcherChannelDirectories();
  try {
    const result = await runLauncher({
      bootstrap,
      credentialPayload: null,
      timeoutSeconds: 1,
    });
    assert.notEqual(result.code, 0);
    assert.match(result.output, /test_credentials_missing/);
    assert.deepEqual(launcherChannelDirectories(), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("signals interrupt credential acquisition after bootstrap readiness", async () => {
  const directory = mkdtempSync(
    join(tmpdir(), "meelni-launcher-interrupt-creds-")
  );
  const bootstrap = join(directory, "bootstrap.mjs");
  writeFileSync(
    bootstrap,
    'import { writeFileSync } from "node:fs"; writeFileSync(3, "MEELNI_CALIBRATION_READY_V1\\n"); setInterval(() => {}, 1000);'
  );
  const before = launcherChannelDirectories();
  try {
    const result = await runLauncher({
      bootstrap,
      credentialPayload: null,
      signalAfterMs: 250,
    });
    assert.equal(result.code, 143, result.output);
    assert.deepEqual(launcherChannelDirectories(), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("signals interrupt the bootstrap while runtime readiness is pending", async () => {
  const directory = mkdtempSync(
    join(tmpdir(), "meelni-launcher-interrupt-runtime-")
  );
  const runtime = join(directory, "runtime.mjs");
  const pidPath = join(directory, "runtime.pid");
  writeFileSync(
    runtime,
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
      setInterval(() => {}, 1000);
    `
  );
  const before = launcherChannelDirectories();
  try {
    const result = await runLauncher({
      bootstrap: BOOTSTRAP,
      runtime,
      signalAfterMs: 1_500,
    });
    assert.equal(result.code, 143, result.output);
    await assertProcessGone(Number(readFileSync(pidPath, "utf8")));
    assert.deepEqual(launcherChannelDirectories(), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("termination reaches a runtime child that ignores SIGTERM", async () => {
  const directory = mkdtempSync(
    join(tmpdir(), "meelni-launcher-runtime-kill-")
  );
  const runtime = join(directory, "runtime.mjs");
  const pidPath = join(directory, "runtime.pid");
  writeFileSync(
    runtime,
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
      process.on("SIGTERM", () => {});
      writeFileSync(4, "MEELNI_CALIBRATION_RUNTIME_READY_V1\\n");
      setInterval(() => {}, 1000);
    `
  );
  const before = launcherChannelDirectories();
  try {
    const result = await runLauncher({
      bootstrap: BOOTSTRAP,
      runtime,
      signalAfterMs: 500,
    });
    assert.equal(result.code, 143, result.output);
    const runtimePid = Number(readFileSync(pidPath, "utf8"));
    await assertProcessGone(runtimePid);
    assert.deepEqual(launcherChannelDirectories(), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("repeated clean launcher completion removes every private channel", async () => {
  const directory = mkdtempSync(join(tmpdir(), "meelni-launcher-repeat-"));
  const bootstrap = join(directory, "bootstrap.mjs");
  writeFileSync(
    bootstrap,
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(3, "MEELNI_CALIBRATION_READY_V1\\n");
      let lines = 0;
      for await (const chunk of process.stdin) {
        lines += String(chunk).split("\\n").length - 1;
        if (lines >= 3) break;
      }
    `
  );
  const before = launcherChannelDirectories();
  try {
    for (let index = 0; index < 3; index += 1) {
      const result = await runLauncher({ bootstrap });
      assert.equal(result.code, 0, result.output);
      assert.deepEqual(launcherChannelDirectories(), before);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("credential acquisition uses only FIFOs while each secret source is paused", async () => {
  const directory = mkdtempSync(join(tmpdir(), "meelni-launcher-fifo-only-"));
  const bootstrap = join(directory, "bootstrap.mjs");
  writeFileSync(
    bootstrap,
    'import { writeFileSync } from "node:fs"; writeFileSync(3, "MEELNI_CALIBRATION_READY_V1\\n"); setInterval(() => {}, 1000);'
  );
  const before = launcherChannelDirectories();
  const child = spawn(LAUNCHER, [], {
    env: {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      MEELNI_CALIBRATION_LAUNCHER_TEST_MODE: "1",
      MEELNI_CALIBRATION_TEST_NODE_BIN: process.execPath,
      MEELNI_CALIBRATION_TEST_CREDENTIAL_FD: "9",
      MEELNI_CALIBRATION_TEST_BOOTSTRAP: bootstrap,
      MEELNI_CALIBRATION_TEST_TIMEOUT_SECONDS: "3",
    },
    detached: true,
    stdio: [
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
    ],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  child.stdout.on("error", assertExpectedPipeTeardown);
  child.stderr.on("error", assertExpectedPipeTeardown);
  child.stdio[9].on("error", assertExpectedPipeTeardown);
  const exited = new Promise((resolvePromise) =>
    child.once("exit", resolvePromise)
  );
  let channelPath;
  try {
    const githubFrame = await waitForCredentialFifo(before);
    channelPath = githubFrame.channelPath;
    assertNoCredentialRegularFiles(channelPath);
    child.stdio[9].write(`${GITHUB_TOKEN}\n`);

    const openAiFrame = await waitForCredentialFifo(
      before,
      githubFrame.identity
    );
    assert.equal(openAiFrame.channelPath, channelPath);
    assertNoCredentialRegularFiles(channelPath);
    assertProcessMetadataHasNoCredentials(child.pid);
    child.stdio[9].write(`${OPENAI_KEY}\n`);

    const acknowledgementFrame = await waitForCredentialFifo(
      before,
      openAiFrame.identity
    );
    assert.equal(acknowledgementFrame.channelPath, channelPath);
    assertNoCredentialRegularFiles(channelPath);
    assertProcessMetadataHasNoCredentials(child.pid);

    process.kill(-child.pid, "SIGKILL");
    await exited;
    assertNoCredentialRegularFiles(channelPath);
    assert.equal(output.includes(GITHUB_TOKEN), false);
    assert.equal(output.includes(OPENAI_KEY), false);
  } finally {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
    child.stdio[9]?.destroy();
    if (channelPath) rmSync(channelPath, { recursive: true, force: true });
    rmSync(directory, { recursive: true, force: true });
  }
});

function runLauncher({
  args = [],
  extraEnv = {},
  bootstrap,
  runtime,
  acknowledgement = "I_UNDERSTAND_THIS_CALLS_A_PAID_MODEL",
  credentialPayload = `${GITHUB_TOKEN}\n${OPENAI_KEY}\n${acknowledgement}\n`,
  signalAfterMs,
  timeoutSeconds,
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
        MEELNI_CALIBRATION_TEST_NODE_BIN: process.execPath,
        MEELNI_CALIBRATION_TEST_CREDENTIAL_FD: "9",
        MEELNI_CALIBRATION_TEST_BOOTSTRAP: bootstrap,
        ...(runtime ? { MEELNI_CALIBRATION_TEST_RUNTIME: runtime } : {}),
        ...(timeoutSeconds
          ? { MEELNI_CALIBRATION_TEST_TIMEOUT_SECONDS: String(timeoutSeconds) }
          : {}),
        ...extraEnv,
      },
      detached: true,
      stdio,
    });
    let output = "";
    let unexpectedPipeError;
    const recordUnexpectedPipeError = (error) => {
      if (error?.code === "EPIPE" || error?.code === "ECONNRESET") return;
      unexpectedPipeError ??= error;
    };
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.stdout.on("error", recordUnexpectedPipeError);
    child.stderr.on("error", recordUnexpectedPipeError);
    child.stdio[9].on("error", recordUnexpectedPipeError);
    child.once("error", reject);
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      clearTimeout(signalTimer);
      if (unexpectedPipeError) {
        reject(unexpectedPipeError);
        return;
      }
      resolvePromise({ code: code ?? (signal ? 128 : 1), output });
    });
    const timeout = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
      reject(new Error(`launcher test timed out: ${output}`));
    }, 15_000);
    const signalTimer = signalAfterMs
      ? setTimeout(() => child.kill("SIGTERM"), signalAfterMs)
      : undefined;
    if (credentialPayload !== null) child.stdio[9].end(credentialPayload);
  });
}

function assertExpectedPipeTeardown(error) {
  assert.ok(
    error?.code === "EPIPE" || error?.code === "ECONNRESET",
    `unexpected launcher pipe error: ${error?.code ?? "unknown"}`
  );
}

function launcherChannelDirectories() {
  return readdirSync("/tmp")
    .filter((name) => name.startsWith("meelni-calibration-live."))
    .sort();
}

async function assertProcessGone(pid) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") return;
      throw error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  assert.fail(`process ${pid} remained alive`);
}

async function waitForCredentialFifo(before, previousIdentity) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const created = launcherChannelDirectories().filter(
      (name) => !before.includes(name)
    );
    if (created.length === 1) {
      const channelPath = join("/tmp", created[0]);
      const framePath = join(channelPath, "frame");
      if (existsSync(framePath)) {
        const metadata = lstatSync(framePath, { bigint: true });
        const identity = `${metadata.dev}:${metadata.ino}:${metadata.ctimeNs}`;
        if (metadata.isFIFO() && identity !== previousIdentity) {
          assert.equal(metadata.mode & 0o777n, 0o600n);
          return { channelPath, identity };
        }
      }
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
  assert.fail("credential FIFO did not reach the expected paused frame");
}

function assertNoCredentialRegularFiles(channelPath) {
  for (const entry of readdirSync(channelPath)) {
    const path = join(channelPath, entry);
    if (!lstatSync(path).isFile()) continue;
    const contents = readFileSync(path, "utf8");
    assert.equal(contents.includes(GITHUB_TOKEN), false);
    assert.equal(contents.includes(OPENAI_KEY), false);
  }
}

function assertProcessMetadataHasNoCredentials(pid) {
  const metadata = execFileSync(
    "/bin/ps",
    ["eww", "-p", String(pid), "-o", "command="],
    { encoding: "utf8" }
  );
  assert.equal(metadata.includes(GITHUB_TOKEN), false);
  assert.equal(metadata.includes(OPENAI_KEY), false);
}
