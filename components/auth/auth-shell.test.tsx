import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AuthInitializationStatus } from "./auth-shell";

test("auth initialization is labeled, live, and reduced-motion safe", () => {
  const html = renderToStaticMarkup(
    React.createElement(AuthInitializationStatus, {
      message: "Checking your saved sign-in",
    })
  );

  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Checking your saved sign-in/);
  assert.match(html, /motion-reduce:animate-none/);
});
