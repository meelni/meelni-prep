import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NON_INDEXABLE_QA_PATHS,
  PUBLIC_CRAWL_SEEDS,
  CANONICAL_ORIGIN,
  assertPublicRobotsDocument,
  assertPublicSitemapDocument,
  assertPublicAssetReferences,
  assertLegacyInterviewLaunchRedirects,
  crawlPublicSurface,
  extractCanonicalUrl,
  extractMetadataImageUrls,
  extractPublicAssetUrls,
  hasNoindexDirective,
  readBuildManifestRoutes,
} from "./public-surface.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const port = process.env.PUBLIC_SURFACE_PORT ?? "3217";
const baseUrl = `http://127.0.0.1:${port}`;
const nextBin = path.join(
  repoRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next"
);
const output = [];

const server = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", "127.0.0.1", "--port", port],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:9",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        "local-public-surface-check",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

server.stdout.on("data", (chunk) => output.push(chunk.toString()));
server.stderr.on("data", (chunk) => output.push(chunk.toString()));

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Production server exited early.\n${output.join("")}`);
    }
    try {
      const response = await fetch(`${baseUrl}/privacy`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Production server did not become ready.\n${output.join("")}`
  );
}

try {
  await waitForServer();
  const metadataImages = new Map();
  const routesWithMetadataImages = new Set();
  const publicAssets = new Map();
  for (const route of [
    "/docs",
    "/test-animated-number",
    "/test-celebration",
    "/test-modal",
    "/test-modal-animations",
    "/test-progress-ring",
  ]) {
    const response = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
    if (response.status !== 404) {
      throw new Error(
        `${route} returned HTTP ${response.status}; expected 404.`
      );
    }
  }
  console.log("Removed public routes return 404 (6 checked).");
  for (const route of [
    "/api/health",
    "/auth/signin",
    "/feedback/example-session",
    "/pricing/canceled",
    "/pricing/success",
  ]) {
    const response = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
    const robotsHeader = response.headers.get("x-robots-tag") ?? "";
    if (!robotsHeader.toLowerCase().includes("noindex")) {
      throw new Error(`${route} is missing an X-Robots-Tag noindex boundary.`);
    }
  }
  console.log(
    "Provider-independent API, protected, and checkout-result routes are noindex (5 checked)."
  );

  const legacyRedirects = await assertLegacyInterviewLaunchRedirects(baseUrl);
  console.log(
    `Legacy interview launch aliases preserve exact query context over permanent HTTP redirects (${legacyRedirects.redirectsChecked} checked).`
  );

  const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
  if (!robotsResponse.ok) {
    throw new Error(`/robots.txt returned HTTP ${robotsResponse.status}.`);
  }
  const robotsResult = assertPublicRobotsDocument(await robotsResponse.text());
  console.log(
    robotsResult.mode === "production"
      ? "Compiled robots.txt exposes the reviewed Production policy."
      : "Compiled robots.txt is fail-closed; the crawlable Production policy remains contract-test evidence."
  );

  const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
  if (!sitemapResponse.ok) {
    throw new Error(`/sitemap.xml returned HTTP ${sitemapResponse.status}.`);
  }
  const sitemapResult = assertPublicSitemapDocument(
    await sitemapResponse.text()
  );
  console.log(
    `Compiled sitemap is canonical and evidence-bound (${sitemapResult.locations.length} URLs).`
  );

  for (const pathname of sitemapResult.paths) {
    const response = await fetch(`${baseUrl}${pathname}`);
    if (!response.ok) {
      throw new Error(`${pathname} returned HTTP ${response.status}.`);
    }
    const expected = new URL(pathname, CANONICAL_ORIGIN).toString();
    const html = await response.text();
    const actual = extractCanonicalUrl(html, baseUrl);
    if (actual !== expected) {
      throw new Error(
        `${pathname} canonical is ${actual ?? "missing"}; expected ${expected}.`
      );
    }
    const noindex = hasNoindexDirective(
      response.headers.get("x-robots-tag") ?? ""
    );
    if (robotsResult.mode === "fail-closed" && !noindex) {
      throw new Error(
        `${pathname} is missing the global non-Production noindex header.`
      );
    }
    if (robotsResult.mode === "production" && noindex) {
      throw new Error(`${pathname} is unexpectedly noindex in Production.`);
    }
    const routeMetadataImages = extractMetadataImageUrls(html, baseUrl);
    if (routeMetadataImages.length > 0) {
      routesWithMetadataImages.add(pathname);
    }
    for (const imageUrl of routeMetadataImages) {
      metadataImages.set(imageUrl, pathname);
    }
    for (const assetUrl of extractPublicAssetUrls(
      html,
      `${baseUrl}${pathname}`
    )) {
      publicAssets.set(assetUrl, pathname);
    }
  }
  console.log(
    `Sitemap HTML routes expose exact canonicals and ${robotsResult.mode} response indexing (${sitemapResult.paths.length} checked).`
  );

  for (const pathname of NON_INDEXABLE_QA_PATHS) {
    const response = await fetch(`${baseUrl}${pathname}`);
    const html = await response.text();
    const headerNoindex = hasNoindexDirective(
      response.headers.get("x-robots-tag") ?? ""
    );
    const metaNoindex =
      /<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'][^"']*noindex/i.test(
        html
      );
    if (!headerNoindex && !metaNoindex) {
      throw new Error(`${pathname} is missing a noindex directive.`);
    }
    if (extractCanonicalUrl(html, baseUrl) !== null) {
      throw new Error(`${pathname} must not emit a canonical URL.`);
    }
    for (const assetUrl of extractPublicAssetUrls(
      html,
      `${baseUrl}${pathname}`
    )) {
      publicAssets.set(assetUrl, pathname);
    }
  }

  const routesMissingMetadataImages = sitemapResult.paths.filter(
    (pathname) => !routesWithMetadataImages.has(pathname)
  );
  if (routesMissingMetadataImages.length > 0) {
    throw new Error(
      `Indexed routes are missing social metadata images: ${routesMissingMetadataImages.join(", ")}`
    );
  }
  const assetResult = await assertPublicAssetReferences(baseUrl, {
    metadataImages,
    publicAssets,
  });
  console.log(
    `Compiled metadata and extension-bearing assets resolve on the final host (${assetResult.metadataImages} metadata images, ${assetResult.publicAssets} public assets).`
  );

  const knownRoutes = await readBuildManifestRoutes(
    path.join(repoRoot, ".next", "server", "app-paths-manifest.json")
  );
  const result = await crawlPublicSurface(baseUrl, {
    knownRoutes,
    seeds: [...PUBLIC_CRAWL_SEEDS, ...sitemapResult.paths],
  });
  console.log(
    `Compiled localhost public route crawl passed (${result.pagesVisited} pages).`
  );
  console.log(
    `Reachable non-indexable QA pages stay outside the sitemap (${NON_INDEXABLE_QA_PATHS.join(", ")}).`
  );
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}
