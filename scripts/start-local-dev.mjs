import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildInngestDevArgs,
  deriveInngestPorts,
  serviceIsSkipped,
} from "./local-dev-config.mjs";
import { buildLocalDevEnv } from "./start-local-dev-env.mjs";
import { getChildExitAction } from "./start-local-dev-processes.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localDevEnv = buildLocalDevEnv({ repoRoot });
const host = process.env.HOST ?? "localhost";
const port = process.env.CONDUCTOR_PORT ?? process.env.PORT ?? "3000";
const npmCachePath = resolve(repoRoot, ".context/npm-cache");
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
    stdio: "inherit",
  });

  if (setup.status !== 0) {
    process.exit(setup.status ?? 1);
  }
}

const children = [];

const web = spawn(
  "npm",
  ["run", "dev", "--", "--hostname", host, "--port", port],
  {
    cwd: repoRoot,
    env: localEnv(),
    shell: process.platform === "win32",
    stdio: "inherit",
  }
);
children.push({ process: web, role: "web" });

if (!serviceIsSkipped(process.env.MEELNI_SKIP_INNGEST)) {
  const inngestArgs = buildInngestDevArgs({
    host,
    inngestPort: process.env.INNGEST_PORT,
    webPort: port,
  });
  const inngestPorts = deriveInngestPorts({
    explicitPort: process.env.INNGEST_PORT,
    webPort: port,
  });

  console.log(
    `Starting Inngest Dev Server on http://127.0.0.1:${inngestPorts.port} for http://${host}:${port}/api/inngest.`
  );

  const inngest = spawn("npx", inngestArgs, {
    cwd: repoRoot,
    env: localEnv(),
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  children.push({ process: inngest, role: "inngest" });
} else {
  console.log(
    "Skipping Inngest Dev Server because MEELNI_SKIP_INNGEST is set."
  );
}

const agentPython = resolve(repoRoot, "agent/venv/bin/python");
const interviewAgent = resolve(repoRoot, "agent/interview/agent.py");

if (serviceIsSkipped(process.env.MEELNI_SKIP_AGENT)) {
  console.log("Skipping Python agent because MEELNI_SKIP_AGENT is set.");
} else if (existsSync(agentPython) && existsSync(interviewAgent)) {
  const agent = spawn(agentPython, [interviewAgent, "dev"], {
    cwd: resolve(repoRoot, "agent/interview"),
    env: {
      ...localEnv(),
      LOCAL_DEV: localDevEnv.LOCAL_DEV ?? "1",
    },
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  children.push({ process: agent, role: "agent" });
} else {
  console.log(
    "Python agent is not ready. Run `npm run setup:local` to create agent/venv."
  );
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const child of children) {
      child.process.kill(signal);
    }
  });
}

let exiting = false;

for (const child of children) {
  child.process.on("exit", (code, signal) => {
    if (exiting) {
      return;
    }

    if (getChildExitAction({ role: child.role }) === "keep-running") {
      console.log(
        `Optional ${child.role} process exited; keeping web dev server running.`
      );
      return;
    }

    exiting = true;

    for (const other of children) {
      if (other !== child) {
        other.process.kill("SIGTERM");
      }
    }

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

function localEnv() {
  return {
    ...localDevEnv,
    NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE ?? npmCachePath,
    npm_config_cache: process.env.npm_config_cache ?? npmCachePath,
  };
}
