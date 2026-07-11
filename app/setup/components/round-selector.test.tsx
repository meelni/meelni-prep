import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RoundSelector } from "./round-selector";

test("selected-question mode prevents the round selector from diverging", () => {
  const html = renderToStaticMarkup(
    <RoundSelector
      selected="product_sense"
      disabled
      onSelect={() => {
        throw new Error("disabled selector must not change the round");
      }}
    />
  );

  assert.equal((html.match(/disabled=""/g) ?? []).length, 4);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Product Sense/);
});
