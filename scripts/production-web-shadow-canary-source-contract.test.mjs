import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Production web Shadow canary has no ordinary-session or credential persistence wiring", async () => {
  const [client, page, action, sessionStart, startWorkflow, interviewPage] =
    await Promise.all([
      source(
        "app/dashboard/internal/preview-shadow-canary/production-shadow-canary-client.tsx"
      ),
      source("app/dashboard/internal/preview-shadow-canary/page.tsx"),
      source("lib/operations/vercel-production-web-shadow-canary.mjs"),
      source("app/api/session/start/route.ts"),
      source("lib/workflows/start-session.ts"),
      source("app/interview/page.tsx"),
    ]);

  assert.match(page, /resolveProductionWebShadowCanaryAccess/);
  assert.match(page, /notFound\(\)/);
  assert.match(client, /file\.text\(\)/);
  assert.match(client, /event\.currentTarget\.value = ""/);
  assert.match(client, /RoomAudioRenderer/);
  assert.match(client, /useAcknowledgedMicrophone/);
  assert.doesNotMatch(
    client,
    /\bfetch\s*\(|localStorage|sessionStorage|indexedDB|document\.cookie|analytics\.|console\./
  );
  assert.doesNotMatch(
    `${sessionStart}\n${startWorkflow}\n${interviewPage}`,
    /production-shadow-canary|production_shadow_canary|ProductionShadowCanary/
  );
  assert.match(action, /consumeProductionActionAuthorization/);
  assert.match(action, /MEELNI_PRODUCTION_WEB_SHADOW_EXPIRES_AT/);
  assert.doesNotMatch(action, /"--value"/);
});

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}
