import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SettingsNotice } from "@/components/dashboard/settings-notice";

test("async settings notices expose status and alert semantics", () => {
  const status = renderToStaticMarkup(
    createElement(SettingsNotice, {
      title: "Export prepared",
      description: "The export is ready.",
      announce: "polite",
    })
  );
  const alert = renderToStaticMarkup(
    createElement(SettingsNotice, {
      title: "Sign in again",
      description: "Your session expired.",
      announce: "assertive",
      focusOnMount: true,
    })
  );

  assert.match(status, /role="status"/);
  assert.match(status, /aria-live="polite"/);
  assert.match(status, /aria-atomic="true"/);
  assert.match(alert, /role="alert"/);
  assert.match(alert, /aria-live="assertive"/);
  assert.match(alert, /tabindex="-1"/);
});
