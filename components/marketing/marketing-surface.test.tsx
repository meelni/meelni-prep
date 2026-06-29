import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  MarketingHero,
  MarketingPage,
} from "@/components/marketing/marketing-surface";

test("marketing page uses the canonical plain content canvas", () => {
  const html = renderToStaticMarkup(
    React.createElement(MarketingPage, null, "content")
  );

  assert.match(html, /min-h-screen/);
  assert.match(html, /bg-background/);
  assert.doesNotMatch(html, /bg-gradient-to-b/);
});

test("marketing hero follows the Figma page-header typography scale", () => {
  const html = renderToStaticMarkup(
    React.createElement(MarketingHero, {
      eyebrow: React.createElement("span", null, "Eyebrow"),
      title: "Page title",
      description: "Page description",
    })
  );

  assert.match(html, /text-display-xl/);
  assert.match(html, /max-w-2xl/);
  assert.match(html, /pt-12/);
});
