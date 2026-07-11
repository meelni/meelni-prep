import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("contact surface does not accept, discard, log, or promise delivery", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/contact/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/contact/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Contact form temporarily unavailable/);
  assert.doesNotMatch(
    page,
    /<form\b|Message Sent|within \d+ hours|fetch\("\/api\/contact/
  );
  assert.match(route, /status: 503/);
  assert.doesNotMatch(
    route,
    /req\.json|console\.(?:log|error)|RESEND_API_KEY|received your message/i
  );
});
