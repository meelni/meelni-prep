import { existsSync } from "node:fs";

const homebrewExpatLib = "/opt/homebrew/opt/expat/lib";

export function buildPythonEnv(baseEnv = process.env) {
  const env = { ...baseEnv };

  if (process.platform !== "darwin" || !existsSync(homebrewExpatLib)) {
    return env;
  }

  const currentPaths = (env.DYLD_LIBRARY_PATH || "").split(":").filter(Boolean);

  if (!currentPaths.includes(homebrewExpatLib)) {
    currentPaths.unshift(homebrewExpatLib);
  }

  env.DYLD_LIBRARY_PATH = currentPaths.join(":");
  return env;
}
