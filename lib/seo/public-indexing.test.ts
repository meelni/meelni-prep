import assert from "node:assert/strict";
import test from "node:test";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import nextConfig from "@/next.config";
import { metadata as contactMetadata } from "@/app/contact/page";
import { matchesPathSegment } from "@/lib/navigation/path-segments";
import { ROBOTS_NOINDEX_HEADER, withNoindexHeader } from "./robots-header";
import { PUBLIC_ORIGIN, publicMetadata, publicUrl } from "./public-metadata";

test("Preview indexing fails closed while Production lets crawlers observe noindex", () => {
  const previous = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "preview";
    assert.deepEqual(robots().rules, { userAgent: "*", disallow: "/" });

    process.env.VERCEL_ENV = "production";
    const production = robots();
    assert.deepEqual(production.rules, {
      userAgent: "*",
      allow: "/",
    });
    assert.equal(production.sitemap, "https://www.meelni.com/sitemap.xml");
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});

test("the sitemap enumerates canonical public routes without invented freshness", async () => {
  const entries = await sitemap();
  const urls = new Set(entries.map((entry) => entry.url));

  for (const route of [
    "",
    "/explore",
    "/companies",
    "/pricing",
    "/blog",
    "/privacy",
  ]) {
    assert.ok(urls.has(publicUrl(route || "/")), route || "/");
  }
  for (const route of [
    "/interview-types/product_sense",
    "/interview-types/behavioral",
    "/interview-types/execution",
    "/interview-types/strategy",
  ]) {
    assert.ok(urls.has(publicUrl(route)), route);
  }
  assert.ok([...urls].some((url) => url.startsWith(`${PUBLIC_ORIGIN}/blog/`)));
  assert.ok(
    [...urls].some((url) => url.startsWith(`${PUBLIC_ORIGIN}/companies/`))
  );
  assert.equal(urls.has(`${PUBLIC_ORIGIN}/privacy`), true);
  assert.equal(urls.has(`${PUBLIC_ORIGIN}/terms`), false);
  assert.equal(urls.has(`${PUBLIC_ORIGIN}/contact`), false);
  assert.equal(urls.size, entries.length);
  assert.ok(entries.every((entry) => entry.lastModified === undefined));
  assert.ok(
    entries.every((entry) => new URL(entry.url).origin === PUBLIC_ORIGIN)
  );
});

test("indexable public metadata emits an explicit canonical on the final origin", () => {
  assert.equal(publicUrl("/blog/example"), `${PUBLIC_ORIGIN}/blog/example`);
  const metadata = publicMetadata("/blog", { title: "Blog" });
  assert.equal(metadata.alternates?.canonical, `${PUBLIC_ORIGIN}/blog`);
  assert.equal(metadata.openGraph?.url, `${PUBLIC_ORIGIN}/blog`);
});

test("unavailable contact remains noindex without canonical or social promotion", () => {
  assert.deepEqual(contactMetadata.robots, { index: false, follow: false });
  assert.deepEqual(contactMetadata.alternates, { canonical: null });
  assert.equal(contactMetadata.openGraph, null);
  assert.equal(contactMetadata.twitter, null);
});

test("protected and checkout-result routes emit a noindex response header", async () => {
  const previous = process.env.VERCEL_ENV;
  const expectedSources = [
    "/api",
    "/api/:path*",
    "/auth",
    "/auth/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/feedback",
    "/feedback/:path*",
    "/interview",
    "/interview/:path*",
    "/pricing/canceled",
    "/pricing/success",
    "/setup",
    "/setup/:path*",
  ];

  try {
    process.env.VERCEL_ENV = "preview";
    const previewHeaders = await nextConfig.headers?.();
    assert.ok(previewHeaders);
    const previewGlobal = previewHeaders.find(
      (candidate) => candidate.source === "/:path*"
    );
    assert.ok(previewGlobal?.headers.some(isNoindexHeader));

    process.env.VERCEL_ENV = "production";
    const productionHeaders = await nextConfig.headers?.();
    assert.ok(productionHeaders);
    const productionGlobal = productionHeaders.find(
      (candidate) => candidate.source === "/:path*"
    );
    assert.equal(productionGlobal?.headers.some(isNoindexHeader), false);

    for (const source of expectedSources) {
      const rule = productionHeaders.find(
        (candidate) => candidate.source === source
      );
      assert.ok(rule, source);
      assert.ok(rule.headers.some(isNoindexHeader), source);
    }
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});

test("protected route matching is segment-bound so SEO routes stay public", () => {
  assert.equal(matchesPathSegment("/interview", "/interview"), true);
  assert.equal(matchesPathSegment("/interview/live", "/interview"), true);
  assert.equal(
    matchesPathSegment("/interview-types/product_sense", "/interview-types"),
    true
  );
  assert.equal(
    matchesPathSegment("/questions/q-product-1", "/questions"),
    true
  );
  assert.equal(
    matchesPathSegment("/interview-types/product_sense", "/interview"),
    false
  );
});

function isNoindexHeader(header: { key: string; value: string }) {
  return (
    header.key.toLowerCase() === "x-robots-tag" &&
    header.value.toLowerCase().includes("noindex")
  );
}

test("middleware responses receive the same noindex contract", () => {
  const values = new Map<string, string>();
  const response = {
    headers: {
      set(name: string, value: string) {
        values.set(name.toLowerCase(), value);
      },
    },
  };

  assert.equal(withNoindexHeader(response), response);
  assert.equal(values.get("x-robots-tag"), ROBOTS_NOINDEX_HEADER);
});
