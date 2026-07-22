#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export function shouldIgnoreVercelBuild(env = process.env) {
  if (env.VERCEL_ENV === "preview") return false;
  if (
    env.VERCEL_ENV === "production" &&
    env.VERCEL_GIT_COMMIT_REF === "main"
  ) {
    return false;
  }
  return true;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const ignored = shouldIgnoreVercelBuild();
  if (ignored) {
    process.stderr.write(
      "Vercel build ignored: only Preview builds and Production main builds are enabled by repository policy.\n"
    );
  }
  // Vercel continues a build on exit 1 and cancels it on exit 0.
  process.exitCode = ignored ? 0 : 1;
}
