import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLIC_ORIGIN,
  PUBLIC_SOCIAL_IMAGE_ALT,
  PUBLIC_SOCIAL_IMAGE_PATH,
  publicMetadata,
  publicUrl,
} from "./public-metadata";

test("public metadata emits a canonical URL and matching social defaults", () => {
  const metadata = publicMetadata("/companies/google", {
    title: "Google PM Interview Guide",
    description: "Visible Google PM interview guide content.",
  });

  assert.equal(PUBLIC_ORIGIN, "https://www.meelni.com");
  assert.deepEqual(metadata.alternates, {
    canonical: publicUrl("/companies/google"),
  });
  assert.equal(metadata.openGraph?.url, publicUrl("/companies/google"));
  assert.equal(metadata.openGraph?.title, "Google PM Interview Guide");
  assert.equal(
    metadata.twitter?.description,
    "Visible Google PM interview guide content."
  );
  assert.deepEqual(metadata.openGraph?.images, [
    {
      url: PUBLIC_SOCIAL_IMAGE_PATH,
      width: 1200,
      height: 630,
      alt: PUBLIC_SOCIAL_IMAGE_ALT,
    },
  ]);
  assert.equal(PUBLIC_SOCIAL_IMAGE_ALT, "Meelni - Live PM interview practice");
  assert.deepEqual(metadata.twitter?.images, metadata.openGraph?.images);
  assert.deepEqual(metadata.robots, { index: true, follow: true });
});

test("route-specific social metadata can override shared defaults", () => {
  const metadata = publicMetadata("/explore", {
    title: "Explore",
    openGraph: { images: ["/explore-image"] },
    twitter: { card: "summary", images: ["/twitter-explore"] },
  });

  assert.deepEqual(metadata.openGraph?.images, ["/explore-image"]);
  assert.deepEqual(metadata.twitter, {
    card: "summary",
    images: ["/twitter-explore"],
    title: "Explore",
  });
});
