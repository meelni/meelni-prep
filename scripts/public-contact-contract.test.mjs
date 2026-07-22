import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("contact remains feature-gated and promises only durable storage", async () => {
  const [page, client, route] = await Promise.all([
    readFile(new URL("../app/contact/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../components/contact/contact-page-client.tsx", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../app/api/contact/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(client, /if \(!activation\.canActivate\)/);
  assert.match(client, /Contact form temporarily unavailable/);
  assert.match(client, /mailto:support@meelni\.com/);
  assert.match(client, /mailto:billing@meelni\.com/);
  assert.match(client, /state === "stored"/);
  assert.match(client, /Request saved/);
  assert.doesNotMatch(
    client,
    /Message Sent|within \d+ hours|delivered|received your message/i
  );
  assert.match(route, /resolveReactivationAccess/);
  assert.match(route, /"contact_unavailable"/);
  assert.match(route, /status: result\.duplicate \? 200 : 202/);
  assert.doesNotMatch(
    route,
    /console\.(?:log|warn|error)|RESEND_API_KEY|received your message/i
  );
  assert.match(client, /role="radiogroup"/);
  assert.match(client, /role="radio"/);
  assert.match(client, /aria-checked=/);
  assert.match(client, /aria-pressed=\{undefined\}/);
  assert.equal(
    client.match(/href="\/dashboard\/settings\?section=plan-credits"/g)?.length,
    2
  );
  assert.doesNotMatch(client, /href="\/dashboard\?section=/);
  assert.doesNotMatch(client, /could not reach the support inbox/i);
  assert.match(client, /could not confirm your request was saved/i);
});
