import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PUBLIC_CRAWL_SEEDS,
  assertPublicBuildManifest,
  assertPublicAssetReferences,
  assertPublicRobotsDocument,
  assertPublicSitemapDocument,
  assertPublicSourceSurface,
  assertLegacyInterviewLaunchRedirects,
  crawlPublicSurface,
  extractInternalLinks,
  extractMetadataImageUrls,
  extractPublicAssetUrls,
  isForbiddenPublicRoute,
} from "./public-surface.mjs";

test("legacy launch aliases redirect permanently with exact query context", async () => {
  const calls = [];
  const result = await assertLegacyInterviewLaunchRedirects(
    "https://www.meelni.com",
    {
      fetchImpl: async (url, options) => {
        calls.push({ url: url.toString(), options });
        return new Response(null, {
          status: 308,
          headers: {
            location:
              "/dashboard/new-interview?questionId=question+1&tag=first&tag=second&company=Stripe&space=hello%20world&encoded=%2F%3F%26&blank=&flag=&returnTo=%2Fexplore%3Fcompany%3DStripe%26page%3D2",
          },
        });
      },
    }
  );

  assert.deepEqual(result, { redirectsChecked: 2 });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ options }) => options.redirect === "manual"));
  assert.match(calls[0].url, /tag=first&company=Stripe&tag=second/);
  assert.match(calls[0].url, /space=hello\+world&encoded=%2f%3f%26/);
});

test("legacy launch aliases reject a missing repeated query value", async () => {
  await assert.rejects(
    assertLegacyInterviewLaunchRedirects("https://www.meelni.com", {
      fetchImpl: async () =>
        new Response(null, {
          status: 308,
          headers: {
            location:
              "/dashboard/new-interview?questionId=question+1&tag=first&company=Stripe&space=hello%20world&encoded=%2F%3F%26&blank=&flag=&returnTo=%2Fexplore%3Fcompany%3DStripe%26page%3D2",
          },
        }),
    }),
    /changed launch query values for tag/
  );
});

test("robots documents accept fail-closed or crawlable Production policy only", () => {
  assert.deepEqual(
    assertPublicRobotsDocument(
      "User-agent: *\nDisallow: /\nSitemap: https://www.meelni.com/sitemap.xml\n"
    ),
    { mode: "fail-closed" }
  );

  const production = [
    "User-agent: *",
    "Allow: /",
    "Sitemap: https://www.meelni.com/sitemap.xml",
  ].join("\n");
  assert.deepEqual(assertPublicRobotsDocument(production), {
    mode: "production",
  });
  assert.throws(
    () =>
      assertPublicRobotsDocument(
        production.replace("Allow: /", "Allow: /\nDisallow: /api")
      ),
    /must let crawlers observe response-level noindex boundaries/
  );
});

test("sitemap documents expose canonical public URLs without invented freshness", () => {
  const paths = [
    "/",
    "/explore",
    "/companies",
    "/pricing",
    "/blog",
    "/blog/example",
  ];
  const document = `<urlset>${paths
    .map((route) => `<url><loc>https://www.meelni.com${route}</loc></url>`)
    .join("")}</urlset>`;

  assert.deepEqual(assertPublicSitemapDocument(document).paths, paths);
  assert.ok(PUBLIC_CRAWL_SEEDS.includes("/privacy"));
  assert.ok(PUBLIC_CRAWL_SEEDS.includes("/terms"));
  assert.ok(PUBLIC_CRAWL_SEEDS.includes("/contact"));
  assert.throws(
    () =>
      document &&
      assertPublicSitemapDocument(
        document.replace("</url>", "<lastmod>today</lastmod></url>")
      ),
    /unsupported freshness evidence/
  );
  assert.throws(
    () =>
      assertPublicSitemapDocument(
        document.replace(
          "https://www.meelni.com/blog/example",
          "https://preview.example/blog/example"
        )
      ),
    /non-canonical origin/
  );
  assert.throws(
    () =>
      assertPublicSitemapDocument(
        document.replace(
          "https://www.meelni.com/blog/example",
          "https://www.meelni.com/pricing/success"
        )
      ),
    /protected route/
  );
  assert.throws(
    () =>
      assertPublicSitemapDocument(
        document.replace(
          "https://www.meelni.com/blog/example",
          "https://www.meelni.com/privacy"
        )
      ),
    /non-indexable public route/
  );
});

test("forbidden public routes include docs and every test route family", () => {
  assert.equal(isForbiddenPublicRoute("/docs"), true);
  assert.equal(isForbiddenPublicRoute("/docs/openapi.yaml"), true);
  assert.equal(isForbiddenPublicRoute("/test-modal"), true);
  assert.equal(isForbiddenPublicRoute("/test/tools"), true);
  assert.equal(isForbiddenPublicRoute("/pricing"), false);
});

test("source guard rejects app test pages and every directly served placeholder", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "meelni-public-source-"));
  try {
    await mkdir(path.join(root, "app", "test-modal"), { recursive: true });
    await mkdir(path.join(root, "public", "docs"), { recursive: true });
    await writeFile(
      path.join(root, "app", "test-modal", "page.tsx"),
      "export default function Page() {}\n"
    );
    await writeFile(
      path.join(root, "public", "docs", "openapi.yaml"),
      "openapi: 3.0.0\n"
    );
    await writeFile(
      path.join(root, "public", "support.html"),
      "<p>Support placeholder</p>\n"
    );

    await assert.rejects(
      assertPublicSourceSurface(root),
      /forbidden app route: \/test-modal[\s\S]*unapproved public asset: docs\/openapi.yaml[\s\S]*unapproved public asset: support.html/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source guard rejects unapproved binary public assets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "meelni-public-binary-"));
  try {
    await mkdir(path.join(root, "app"), { recursive: true });
    await mkdir(path.join(root, "public"), { recursive: true });
    await writeFile(
      path.join(root, "app", "page.tsx"),
      "export default function Page() {}\n"
    );
    await writeFile(
      path.join(root, "public", "logo.png"),
      Buffer.from([0, 255, 1, 2])
    );

    await assert.rejects(
      assertPublicSourceSurface(root),
      /unapproved public asset: logo.png/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("build manifest guard rejects forbidden production routes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "meelni-public-manifest-"));
  const manifestPath = path.join(root, "app-paths-manifest.json");
  try {
    await writeFile(
      manifestPath,
      JSON.stringify({
        "/page": "app/page.js",
        "/test-celebration/page": "app/test-celebration/page.js",
      })
    );
    await assert.rejects(
      assertPublicBuildManifest(manifestPath),
      /\/test-celebration/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("link extraction keeps same-origin links and strips query variants", () => {
  const links = extractInternalLinks(
    '<a href="/contact?from=home">Contact</a><a href="https://other.example/docs">Other</a>',
    "https://www.meelni.com"
  );
  assert.deepEqual(links, ["https://www.meelni.com/contact"]);
});

test("metadata and extension-bearing asset extraction resolves HTML references", () => {
  const html = `
    <meta property="og:image" content="https://www.meelni.com/opengraph-image">
    <meta name="twitter:image" content="/opengraph-image">
    <link rel="stylesheet" href="/_next/static/app.css?v=1">
    <img src="/media/card.png" srcset="/media/card.png 1x, /media/card@2x.png 2x">
    <img src="https://assets.example/foreign.png">
  `;
  assert.deepEqual(
    extractMetadataImageUrls(html, "https://www.meelni.com/explore"),
    ["https://www.meelni.com/opengraph-image"]
  );
  assert.deepEqual(
    extractPublicAssetUrls(html, "https://www.meelni.com/explore").sort(),
    [
      "https://www.meelni.com/_next/static/app.css?v=1",
      "https://www.meelni.com/media/card.png",
      "https://www.meelni.com/media/card@2x.png",
    ]
  );
});

test("asset verification fails missing metadata and off-host final responses", async () => {
  const metadataImages = new Map([
    ["https://www.meelni.com/opengraph-image", "/explore"],
  ]);
  await assert.rejects(
    assertPublicAssetReferences("http://127.0.0.1:3217", {
      metadataImages,
      publicAssets: new Map(),
      fetchImpl: async () => new Response("missing", { status: 404 }),
    }),
    /metadata image returned HTTP 404/
  );
  await assert.rejects(
    assertPublicAssetReferences("http://127.0.0.1:3217", {
      metadataImages,
      publicAssets: new Map(),
      fetchImpl: async () => {
        const response = new Response("ok", { status: 200 });
        Object.defineProperty(response, "url", {
          value: "https://attacker.example/image.png",
        });
        return response;
      },
    }),
    /resolved outside the final host/
  );
});

test("production-like crawl follows public links and rejects forbidden destinations", async () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/") {
      response.end('<a href="/contact">Contact</a><a href="/docs">Docs</a>');
      return;
    }
    response.end("<p>Contact</p>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    await assert.rejects(
      crawlPublicSurface(`http://127.0.0.1:${address.port}`, { seeds: ["/"] }),
      /links to forbidden route \/docs/
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("production-like crawl fails on an unlisted broken internal link", async () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/") {
      response.end('<a href="/how-it-works">How it works</a>');
      return;
    }
    response.statusCode = 404;
    response.end("<p>Not found</p>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    await assert.rejects(
      crawlPublicSurface(`http://127.0.0.1:${address.port}`, { seeds: ["/"] }),
      /\/how-it-works: HTTP 404/
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("production-like crawl validates excluded protected links against the build routes", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end('<a href="/dashboard/new-interview">Start</a>');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    await assert.doesNotReject(
      crawlPublicSurface(`http://127.0.0.1:${address.port}`, {
        knownRoutes: ["/dashboard/new-interview"],
        seeds: ["/"],
      })
    );
    await assert.rejects(
      crawlPublicSurface(`http://127.0.0.1:${address.port}`, {
        knownRoutes: ["/dashboard"],
        seeds: ["/"],
      }),
      /unknown protected route \/dashboard\/new-interview/
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("production-like crawl rejects external redirects without fetching off origin", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return new Response(null, {
      status: 302,
      headers: { location: "https://attacker.example/capture" },
    });
  };

  await assert.rejects(
    crawlPublicSurface("https://www.meelni.com", {
      fetchImpl,
      seeds: ["/"],
    }),
    /redirects outside https:\/\/www.meelni.com to https:\/\/attacker.example/
  );
  assert.deepEqual(calls, ["https://www.meelni.com/"]);
});

test("deployed crawl CLI requires build-manifest evidence", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "scripts", "verify-public-surface.mjs"),
      "--base-url",
      "http://127.0.0.1:9",
    ],
    { encoding: "utf8" }
  );

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /--base-url requires --manifest for protected-route evidence/
  );
});
