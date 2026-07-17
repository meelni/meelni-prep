import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PUBLIC_SOCIAL_IMAGE_ALT } from "@/lib/seo/public-metadata";

import { alt, SocialImageArtwork } from "./opengraph-image";

test("social card uses the canonical live practice positioning", () => {
  const html = renderToStaticMarkup(<SocialImageArtwork />);

  assert.equal(alt, PUBLIC_SOCIAL_IMAGE_ALT);
  assert.equal(alt, "Meelni - Live PM interview practice");
  assert.match(html, />Live PM interview practice</);
  assert.doesNotMatch(html, /AI Interview Agent/i);
});
