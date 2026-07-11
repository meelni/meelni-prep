import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPublicBuildManifest,
  assertPublicSourceSurface,
  crawlPublicSurface,
  readBuildManifestRoutes,
} from "./public-surface.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const args = process.argv.slice(2);
const manifestIndex = args.indexOf("--manifest");
const baseUrlIndex = args.indexOf("--base-url");

const sourceResult = await assertPublicSourceSurface(repoRoot);
console.log(
  `Public source surface passed (${sourceResult.pagesInspected} pages, ${sourceResult.filesInspected} files).`
);

if (manifestIndex !== -1) {
  const manifestArgument = args[manifestIndex + 1];
  if (!manifestArgument) throw new Error("--manifest requires a file path");
  const result = await assertPublicBuildManifest(
    path.resolve(repoRoot, manifestArgument)
  );
  console.log(
    `Public build manifest passed (${result.routesInspected} routes).`
  );
}

if (baseUrlIndex !== -1) {
  const baseUrl = args[baseUrlIndex + 1];
  if (!baseUrl) throw new Error("--base-url requires a URL");
  if (manifestIndex === -1) {
    throw new Error(
      "--base-url requires --manifest for protected-route evidence"
    );
  }
  const manifestArgument = args[manifestIndex + 1];
  if (!manifestArgument) throw new Error("--manifest requires a file path");
  const knownRoutes = await readBuildManifestRoutes(
    path.resolve(repoRoot, manifestArgument)
  );
  const result = await crawlPublicSurface(baseUrl, { knownRoutes });
  console.log(`Public route crawl passed (${result.pagesVisited} pages).`);
}
