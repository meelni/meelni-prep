import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const INDEXABLE_PUBLIC_PATHS = [
  "/",
  "/explore",
  "/companies",
  "/pricing",
  "/blog",
  "/privacy",
];

export const NON_INDEXABLE_QA_PATHS = ["/contact", "/terms"];

export const PUBLIC_CRAWL_SEEDS = [
  ...INDEXABLE_PUBLIC_PATHS,
  ...NON_INDEXABLE_QA_PATHS,
  "/robots.txt",
  "/sitemap.xml",
];

export const CANONICAL_ORIGIN = "https://www.meelni.com";
const CANONICAL_INTERVIEW_LAUNCH_PATH = "/dashboard/new-interview";
const LEGACY_INTERVIEW_LAUNCH_PATHS = ["/setup", "/dashboard/new-rep"];
const CANONICAL_SITEMAP = `${CANONICAL_ORIGIN}/sitemap.xml`;
const REQUIRED_PUBLIC_PATHS = INDEXABLE_PUBLIC_PATHS;
const REQUIRED_PRIVATE_PATHS = [
  "/api",
  "/auth",
  "/dashboard",
  "/feedback",
  "/interview",
  "/pricing/canceled",
  "/pricing/success",
  "/setup",
];

const FORBIDDEN_PUBLIC_MARKERS = [
  "github.com/your-repo",
  "humans@conductor.build",
  "mockmate.app",
  "mockmate.vercel.app",
  "mockmate.livekit.cloud",
];

const ALLOWED_PUBLIC_FILES = new Set(["fonts/commit-mono-regular.otf"]);

const PUBLIC_BINARY_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".otf",
  ".png",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
]);

const PUBLIC_TEXT_EXTENSIONS = new Set([
  "",
  ".css",
  ".htm",
  ".html",
  ".js",
  ".json",
  ".map",
  ".md",
  ".mjs",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml",
  ".yaml",
  ".yml",
]);

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

export function isForbiddenPublicRoute(route) {
  const pathname = new URL(route, CANONICAL_ORIGIN).pathname;
  return (
    pathname === "/docs" ||
    pathname.startsWith("/docs/") ||
    /^\/test(?:-|\/|$)/.test(pathname)
  );
}

function robotsDirectiveValues(document, name) {
  const directive = `${name.toLowerCase()}:`;
  return document
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter((line) => line.toLowerCase().startsWith(directive))
    .map((line) => line.slice(line.indexOf(":") + 1).trim());
}

export function assertPublicRobotsDocument(document) {
  const userAgents = robotsDirectiveValues(document, "user-agent");
  const allows = robotsDirectiveValues(document, "allow");
  const disallows = robotsDirectiveValues(document, "disallow");
  const sitemaps = robotsDirectiveValues(document, "sitemap");

  if (userAgents.length !== 1 || userAgents[0] !== "*") {
    throw new Error("robots.txt must contain one wildcard user-agent policy");
  }
  if (!sitemaps.includes(CANONICAL_SITEMAP)) {
    throw new Error("robots.txt is missing the canonical sitemap URL");
  }

  if (disallows.includes("/")) {
    if (allows.length > 0) {
      throw new Error("fail-closed robots.txt must not also allow routes");
    }
    return { mode: "fail-closed" };
  }

  if (!allows.includes("/")) {
    throw new Error("Production robots.txt is missing Allow: /");
  }
  if (disallows.length > 0) {
    throw new Error(
      "Production robots.txt must let crawlers observe response-level noindex boundaries"
    );
  }

  return { mode: "production" };
}

export function assertPublicSitemapDocument(document) {
  if (/<lastmod\b/i.test(document)) {
    throw new Error("sitemap.xml contains unsupported freshness evidence");
  }

  const locations = [...document.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(
    (match) => match[1].trim()
  );
  if (locations.length === 0) {
    throw new Error("sitemap.xml contains no locations");
  }
  if (new Set(locations).size !== locations.length) {
    throw new Error("sitemap.xml contains duplicate locations");
  }

  const paths = locations.map((location) => {
    const url = new URL(location);
    if (url.origin !== CANONICAL_ORIGIN) {
      throw new Error(
        `sitemap.xml contains a non-canonical origin: ${location}`
      );
    }
    if (url.search || url.hash) {
      throw new Error(`sitemap.xml contains a query or fragment: ${location}`);
    }
    if (isForbiddenPublicRoute(url.pathname)) {
      throw new Error(
        `sitemap.xml contains a forbidden route: ${url.pathname}`
      );
    }
    if (isPrivateIndexingRoute(url.pathname)) {
      throw new Error(
        `sitemap.xml contains a protected route: ${url.pathname}`
      );
    }
    if (NON_INDEXABLE_QA_PATHS.includes(url.pathname)) {
      throw new Error(
        `sitemap.xml contains a non-indexable public route: ${url.pathname}`
      );
    }
    return url.pathname;
  });

  const missingPublicPaths = REQUIRED_PUBLIC_PATHS.filter(
    (route) => !paths.includes(route)
  );
  if (missingPublicPaths.length > 0) {
    throw new Error(
      `sitemap.xml is missing public routes: ${missingPublicPaths.join(", ")}`
    );
  }

  return { locations, paths };
}

function isPrivateIndexingRoute(pathname) {
  return REQUIRED_PRIVATE_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isCrawlableInternalRoute(pathname) {
  if (pathname === "/api" || pathname.startsWith("/api/")) return false;
  if (pathname === "/_next" || pathname.startsWith("/_next/")) return false;
  return !/\.[a-z0-9]{1,8}$/i.test(pathname);
}

function isProtectedApplicationRoute(pathname) {
  return ["/auth", "/dashboard", "/feedback", "/interview", "/setup"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function routePatternMatches(pattern, pathname) {
  const patternSegments = pattern.split("/").filter(Boolean);
  const pathSegments = pathname.split("/").filter(Boolean);

  for (let index = 0; index < patternSegments.length; index += 1) {
    const segment = patternSegments[index];
    if (/^\[\[\.\.\..+\]\]$/.test(segment)) return true;
    if (/^\[\.\.\..+\]$/.test(segment)) return pathSegments.length > index;
    if (/^\[.+\]$/.test(segment)) {
      if (!pathSegments[index]) return false;
      continue;
    }
    if (segment !== pathSegments[index]) return false;
  }

  return patternSegments.length === pathSegments.length;
}

async function walkFiles(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(root, entry.name);
        return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
      })
    );
    return files.flat();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function appPageRoute(appRoot, file) {
  const relative = path.relative(appRoot, file);
  const segments = relative.split(path.sep);
  const filename = segments.pop();
  if (!/^page\.(?:js|jsx|ts|tsx)$/.test(filename ?? "")) return null;

  const routeSegments = segments.filter(
    (segment) => !(segment.startsWith("(") && segment.endsWith(")"))
  );
  return `/${routeSegments.join("/")}`.replace(/\/$/, "") || "/";
}

export async function assertPublicSourceSurface(repoRoot) {
  const appRoot = path.join(repoRoot, "app");
  const pageFiles = (await walkFiles(appRoot)).filter((file) =>
    /\/page\.(?:js|jsx|ts|tsx)$/.test(file)
  );
  const forbiddenRoutes = pageFiles
    .map((file) => appPageRoute(appRoot, file))
    .filter((route) => route && isForbiddenPublicRoute(route));

  const sourceRoots = ["app", "components", "lib"].map((directory) =>
    path.join(repoRoot, directory)
  );
  const sourceFiles = (
    await Promise.all(sourceRoots.map((root) => walkFiles(root)))
  )
    .flat()
    .filter((file) => SOURCE_EXTENSIONS.has(path.extname(file)));

  const markerFindings = [];
  for (const file of sourceFiles) {
    const contents = await readFile(file, "utf8");
    for (const marker of FORBIDDEN_PUBLIC_MARKERS) {
      if (contents.includes(marker)) {
        markerFindings.push(`${path.relative(repoRoot, file)}: ${marker}`);
      }
    }
  }

  const publicRoot = path.join(repoRoot, "public");
  const publicFiles = await walkFiles(publicRoot);
  const publicFindings = [];
  for (const file of publicFiles) {
    const relative = path.relative(publicRoot, file);
    const publicRoute = `/${relative.split(path.sep).join("/")}`;
    const extension = path.extname(file).toLowerCase();
    const relativeLower = relative.toLowerCase();
    const markers = [...FORBIDDEN_PUBLIC_MARKERS, "placeholder"];

    if (!ALLOWED_PUBLIC_FILES.has(relative)) {
      publicFindings.push(`unapproved public asset: ${relative}`);
      continue;
    }

    if (isForbiddenPublicRoute(publicRoute)) {
      publicFindings.push(`forbidden public asset: ${publicRoute}`);
      continue;
    }
    for (const marker of markers) {
      if (relativeLower.includes(marker.toLowerCase())) {
        publicFindings.push(`${relative}: ${marker}`);
      }
    }
    if (PUBLIC_BINARY_EXTENSIONS.has(extension)) continue;
    if (!PUBLIC_TEXT_EXTENSIONS.has(extension)) {
      publicFindings.push(`unclassified public asset: ${relative}`);
      continue;
    }

    const contents = await readFile(file, "utf8");
    const normalized = contents.toLowerCase();
    for (const marker of markers) {
      if (normalized.includes(marker.toLowerCase())) {
        publicFindings.push(`${relative}: ${marker}`);
      }
    }
  }

  const findings = [
    ...forbiddenRoutes.map((route) => `forbidden app route: ${route}`),
    ...markerFindings,
    ...publicFindings,
  ];

  if (findings.length > 0) {
    throw new Error(
      `Public source surface failed:\n- ${findings.join("\n- ")}`
    );
  }

  return {
    pagesInspected: pageFiles.length,
    filesInspected: sourceFiles.length + publicFiles.length,
    publicFilesInspected: publicFiles.length,
  };
}

export async function readBuildManifestRoutes(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  return Object.keys(manifest).map((entry) => {
    const withoutLeaf = entry.replace(/\/(?:page|route)$/, "");
    return withoutLeaf || "/";
  });
}

export async function assertPublicBuildManifest(manifestPath) {
  const routes = await readBuildManifestRoutes(manifestPath);
  const forbiddenRoutes = routes.filter(isForbiddenPublicRoute);

  if (forbiddenRoutes.length > 0) {
    throw new Error(
      `Production build contains forbidden routes:\n- ${forbiddenRoutes.join("\n- ")}`
    );
  }

  return { routesInspected: routes.length };
}

export function extractInternalLinks(html, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const links = new Set();
  const hrefPattern = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(hrefPattern)) {
    const href = match[1].replaceAll("&amp;", "&");
    if (href.startsWith("#") || /^(?:mailto|tel|javascript):/i.test(href))
      continue;

    let url;
    try {
      url = new URL(href, baseUrl);
    } catch {
      continue;
    }

    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol))
      continue;
    url.hash = "";
    url.search = "";
    links.add(url.toString());
  }

  return [...links];
}

export function extractCanonicalUrl(html, baseUrl) {
  const tag = html.match(
    /<link\b(?=[^>]*\brel=["'][^"']*\bcanonical\b[^"']*["'])[^>]*>/i
  )?.[0];
  const href = tag?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
  return href
    ? new URL(href.replaceAll("&amp;", "&"), baseUrl).toString()
    : null;
}

function htmlAttributes(tag) {
  const attributes = new Map();
  for (const match of tag.matchAll(
    /\b([:\w-]+)\s*=\s*(?:["']([^"']*)["']|([^\s>]+))/g
  )) {
    attributes.set(
      match[1].toLowerCase(),
      (match[2] ?? match[3] ?? "").replaceAll("&amp;", "&")
    );
  }
  return attributes;
}

export function extractMetadataImageUrls(html, baseUrl) {
  const images = new Set();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = htmlAttributes(match[0]);
    const key = (
      attributes.get("property") ??
      attributes.get("name") ??
      ""
    ).toLowerCase();
    if (!["og:image", "og:image:secure_url", "twitter:image"].includes(key)) {
      continue;
    }
    const content = attributes.get("content");
    if (!content) continue;
    try {
      images.add(new URL(content, baseUrl).toString());
    } catch {
      // The compiled verifier reports a missing metadata image below.
    }
  }
  return [...images];
}

export function extractPublicAssetUrls(html, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const assets = new Set();
  const candidates = [];

  for (const match of html.matchAll(
    /<(?:link|script|img|source|video)\b[^>]*>/gi
  )) {
    const attributes = htmlAttributes(match[0]);
    for (const name of ["href", "src", "poster"]) {
      const value = attributes.get(name);
      if (value) candidates.push(value);
    }
    const srcset = attributes.get("srcset");
    if (srcset) {
      candidates.push(
        ...srcset.split(",").map((entry) => entry.trim().split(/\s+/)[0])
      );
    }
  }

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate, baseUrl);
      if (
        url.origin === origin &&
        /\.[a-z0-9]{1,8}$/i.test(url.pathname.split("/").at(-1) ?? "")
      ) {
        url.hash = "";
        assets.add(url.toString());
      }
    } catch {
      // Invalid references are ignored here and remain visible to HTML checks.
    }
  }
  return [...assets];
}

export async function assertPublicAssetReferences(
  baseUrl,
  { metadataImages, publicAssets, fetchImpl = fetch }
) {
  const finalOrigin = new URL(baseUrl).origin;
  for (const [declaredUrl, source] of metadataImages) {
    const declared = new URL(declaredUrl);
    if (declared.origin !== CANONICAL_ORIGIN) {
      throw new Error(
        `${source} metadata image uses non-canonical host ${declared.origin}.`
      );
    }
    const localUrl = new URL(
      `${declared.pathname}${declared.search}`,
      baseUrl
    ).toString();
    await assertAssetResponse(
      fetchImpl,
      localUrl,
      finalOrigin,
      `${source} metadata image`
    );
  }
  for (const [assetUrl, source] of publicAssets) {
    await assertAssetResponse(
      fetchImpl,
      assetUrl,
      finalOrigin,
      `${source} public asset`
    );
  }
  return {
    metadataImages: metadataImages.size,
    publicAssets: publicAssets.size,
  };
}

export async function assertLegacyInterviewLaunchRedirects(
  baseUrl,
  { fetchImpl = fetch } = {}
) {
  const query =
    "questionId=question%201&tag=first&company=Stripe&tag=second&space=hello+world&encoded=%2f%3f%26&blank=&flag&returnTo=%2Fexplore%3Fcompany%3DStripe%26page%3D2";
  const expectedParams = new URLSearchParams(query);
  const expectedKeys = [...new Set(expectedParams.keys())].sort();
  const origin = new URL(baseUrl).origin;

  for (const pathname of LEGACY_INTERVIEW_LAUNCH_PATHS) {
    const source = new URL(`${pathname}?${query}`, origin);
    const response = await fetchImpl(source, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 308) {
      throw new Error(
        `${pathname} returned HTTP ${response.status}; expected permanent redirect 308.`
      );
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`${pathname} redirect is missing Location.`);
    }
    const destination = new URL(location, source);
    if (destination.origin !== origin) {
      throw new Error(`${pathname} redirects outside ${origin}.`);
    }
    if (destination.pathname !== CANONICAL_INTERVIEW_LAUNCH_PATH) {
      throw new Error(
        `${pathname} redirects to ${destination.pathname}; expected ${CANONICAL_INTERVIEW_LAUNCH_PATH}.`
      );
    }
    const destinationKeys = [
      ...new Set(destination.searchParams.keys()),
    ].sort();
    if (JSON.stringify(destinationKeys) !== JSON.stringify(expectedKeys)) {
      throw new Error(`${pathname} changed launch query parameter keys.`);
    }
    for (const key of expectedKeys) {
      const expectedValues = expectedParams.getAll(key);
      const destinationValues = destination.searchParams.getAll(key);
      if (
        JSON.stringify(destinationValues) !== JSON.stringify(expectedValues)
      ) {
        throw new Error(`${pathname} changed launch query values for ${key}.`);
      }
    }
  }

  return { redirectsChecked: LEGACY_INTERVIEW_LAUNCH_PATHS.length };
}

async function assertAssetResponse(fetchImpl, url, finalOrigin, label) {
  const response = await fetchImpl(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}: ${url}`);
  }
  const finalUrl = response.url || url;
  if (new URL(finalUrl).origin !== finalOrigin) {
    throw new Error(`${label} resolved outside the final host: ${finalUrl}`);
  }
}

export function hasNoindexDirective(value) {
  return /(?:^|[,\s])noindex(?:$|[,\s])/i.test(value);
}

export async function crawlPublicSurface(
  baseUrl,
  {
    fetchImpl = fetch,
    knownRoutes = null,
    maxPages = 250,
    seeds = PUBLIC_CRAWL_SEEDS,
  } = {}
) {
  const origin = new URL(baseUrl).origin;
  const queue = seeds.map((seed) => new URL(seed, origin).toString());
  const visited = new Set();
  const failures = [];

  while (queue.length > 0) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    if (visited.size >= maxPages) {
      throw new Error(
        `Public crawl exceeded its ${maxPages}-page safety limit.`
      );
    }
    visited.add(url);

    let response;
    try {
      response = await fetchImpl(url, {
        headers: { "user-agent": "meelni-public-surface-check/1.0" },
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      failures.push(
        `${url}: ${error instanceof Error ? error.message : String(error)}`
      );
      continue;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        failures.push(`${url}: HTTP ${response.status} without Location`);
        continue;
      }

      let redirectUrl;
      try {
        redirectUrl = new URL(location, url);
      } catch {
        failures.push(`${url}: invalid redirect Location ${location}`);
        continue;
      }
      if (redirectUrl.origin !== origin) {
        failures.push(
          `${url}: redirects outside ${origin} to ${redirectUrl.origin}`
        );
        continue;
      }
      redirectUrl.hash = "";
      redirectUrl.search = "";
      if (isForbiddenPublicRoute(redirectUrl.pathname)) {
        failures.push(
          `${url}: redirects to forbidden route ${redirectUrl.pathname}`
        );
      } else if (
        knownRoutes &&
        isProtectedApplicationRoute(redirectUrl.pathname)
      ) {
        if (
          !knownRoutes.some((route) =>
            routePatternMatches(route, redirectUrl.pathname)
          )
        ) {
          failures.push(
            `${url}: redirects to unknown protected route ${redirectUrl.pathname}`
          );
        }
      } else if (
        isCrawlableInternalRoute(redirectUrl.pathname) &&
        !visited.has(redirectUrl.toString())
      ) {
        queue.push(redirectUrl.toString());
      }
      continue;
    }

    if (!response.ok) {
      failures.push(`${url}: HTTP ${response.status}`);
      continue;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) continue;

    const html = await response.text();
    for (const link of extractInternalLinks(html, url)) {
      const pathname = new URL(link).pathname;
      if (isForbiddenPublicRoute(pathname)) {
        failures.push(`${url}: links to forbidden route ${pathname}`);
      } else if (knownRoutes && isProtectedApplicationRoute(pathname)) {
        if (
          !knownRoutes.some((route) => routePatternMatches(route, pathname))
        ) {
          failures.push(`${url}: links to unknown protected route ${pathname}`);
        }
      } else if (isCrawlableInternalRoute(pathname) && !visited.has(link)) {
        queue.push(link);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Public route crawl failed:\n- ${failures.join("\n- ")}`);
  }

  return { pagesVisited: visited.size };
}
