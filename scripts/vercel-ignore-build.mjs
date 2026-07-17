#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export function shouldIgnoreVercelBuild(env = process.env) {
  return env.VERCEL_ENV !== "preview";
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const ignored = shouldIgnoreVercelBuild();
  if (ignored) {
    process.stderr.write(
      "Vercel build ignored: only Preview builds are enabled by repository policy.\n"
    );
  }
  // Vercel continues a build on exit 1 and cancels it on exit 0.
  process.exitCode = ignored ? 0 : 1;
}
