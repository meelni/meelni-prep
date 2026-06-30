import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = process.env.HOST ?? "localhost";
const port = process.env.CONDUCTOR_PORT ?? process.env.PORT ?? "3000";
const nextBin = resolve(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "next.cmd" : "next"
);

if (!existsSync(nextBin)) {
  console.log("Dependencies are missing. Running local setup first...");
  const setup = spawnSync("npm", ["run", "setup:local"], {
    cwd: repoRoot,
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  if (setup.status !== 0) {
    process.exit(setup.status ?? 1);
  }
}

const children = [];

const web = spawn("npm", ["run", "dev", "--", "--hostname", host, "--port", port], {
  cwd: repoRoot,
  env: process.env,
  shell: process.platform === "win32",
  stdio: "inherit"
});
children.push(web);

const agentPython = resolve(repoRoot, "agent/venv/bin/python");
const interviewAgent = resolve(repoRoot, "agent/interview/agent.py");

if (existsSync(agentPython) && existsSync(interviewAgent)) {
  const agent = spawn(agentPython, [interviewAgent, "dev"], {
    cwd: resolve(repoRoot, "agent/interview"),
    env: {
      ...process.env,
      LOCAL_DEV: process.env.LOCAL_DEV ?? "1"
    },
    shell: process.platform === "win32",
    stdio: "inherit"
  });
  children.push(agent);
} else {
  console.log("Python agent is not ready. Run `npm run setup:local` to create agent/venv.");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const child of children) {
      child.kill(signal);
    }
  });
}

let exiting = false;

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (exiting) {
      return;
    }

    exiting = true;

    for (const other of children) {
      if (other !== child) {
        other.kill("SIGTERM");
      }
    }

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}
