import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const [launcher, bootstrap, namespace] = process.argv.slice(2);

assert.ok(launcher);
assert.ok(bootstrap);
assert.match(namespace ?? "", /^[A-Za-z0-9_-]{1,64}$/);

const prefix = `meelni-calibration-live.${namespace}.`;
const inventory = () =>
  readdirSync("/tmp")
    .filter((name) => name.startsWith(prefix))
    .sort();

assert.deepEqual(inventory(), []);

const launcherProcess = spawn(launcher, [], {
  env: {
    HOME: process.env.HOME,
    PATH: process.env.PATH,
    MEELNI_CALIBRATION_LAUNCHER_TEST_MODE: "1",
    MEELNI_CALIBRATION_TEST_NODE_BIN: process.execPath,
    MEELNI_CALIBRATION_TEST_CREDENTIAL_FD: "9",
    MEELNI_CALIBRATION_TEST_BOOTSTRAP: bootstrap,
    MEELNI_CALIBRATION_TEST_CHANNEL_NAMESPACE: namespace,
    MEELNI_CALIBRATION_TEST_TIMEOUT_SECONDS: "3",
  },
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

let launcherOutput = "";
launcherProcess.stdout.on("data", (chunk) => (launcherOutput += chunk));
launcherProcess.stderr.on("data", (chunk) => (launcherOutput += chunk));
launcherProcess.stdio[9].on("error", (error) => {
  if (error?.code !== "EPIPE" && error?.code !== "ECONNRESET") throw error;
});

const completion = new Promise((resolvePromise, reject) => {
  launcherProcess.once("error", reject);
  launcherProcess.once("close", (code, signal) =>
    resolvePromise({ code: code ?? (signal ? 128 : 1), signal })
  );
});

let shuttingDown = false;
const stopLauncher = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  launcherProcess.kill("SIGTERM");
};
process.once("SIGTERM", () => {
  stopLauncher();
  process.exit(143);
});
process.once("SIGINT", () => {
  stopLauncher();
  process.exit(130);
});

const ownedChannel = await waitForOwnedChannel();
send({ type: "ready", inventory: inventory(), ownedChannel });

const commands = createInterface({ input: process.stdin });
for await (const command of commands) {
  if (command === "inspect") {
    send({ type: "inventory", inventory: inventory() });
    continue;
  }
  if (command !== "complete") continue;

  launcherProcess.stdio[9].end(
    "github_pat_concurrentWorker12345\n" +
      "sk-concurrentWorker12345\n" +
      "I_UNDERSTAND_THIS_CALLS_A_PAID_MODEL\n"
  );
  const result = await completion;
  assert.equal(result.code, 0, launcherOutput);
  await waitForEmptyInventory();
  send({ type: "done", inventory: inventory() });
  commands.close();
  process.stdin.pause();
  break;
}

async function waitForOwnedChannel() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const directories = inventory();
    if (directories.length === 1) {
      const channelPath = join("/tmp", directories[0]);
      if (
        existsSync(join(channelPath, "status")) &&
        existsSync(join(channelPath, "credentials"))
      ) {
        return directories[0];
      }
    }
    await delay(10);
  }
  assert.fail(`owned launcher channel did not appear: ${launcherOutput}`);
}

async function waitForEmptyInventory() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (inventory().length === 0) return;
    await delay(10);
  }
  assert.fail(
    `owned launcher channel was not removed: ${inventory().join(",")}`
  );
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function delay(milliseconds) {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds)
  );
}
