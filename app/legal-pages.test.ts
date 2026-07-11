import assert from "node:assert/strict";
import test from "node:test";

import sitemap from "./sitemap";
import { metadata as privacyMetadata } from "./privacy/page";
import { metadata as termsMetadata } from "./terms/page";

test("Terms and Privacy drafts are explicitly unindexed and unpromoted", () => {
  for (const metadata of [privacyMetadata, termsMetadata]) {
    assert.deepEqual(metadata.robots, { index: false, follow: false });
    assert.deepEqual(metadata.alternates, { canonical: null });
    assert.equal(metadata.openGraph, null);
    assert.equal(metadata.twitter, null);
  }
});

test("Terms and Privacy drafts are absent from the sitemap", () => {
  const urls = sitemap().map(({ url }) => new URL(url).pathname);

  assert.equal(urls.includes("/terms"), false);
  assert.equal(urls.includes("/privacy"), false);
});
