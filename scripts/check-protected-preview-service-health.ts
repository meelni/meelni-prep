import {
  parseProtectedServiceHealthPreviewOrigin,
  parseServiceHealthUrl,
  runServiceHealthSynthetic,
} from "../lib/operations/service-health-synthetic";

async function main() {
  const url = parseServiceHealthUrl(process.env.HEALTHCHECK_URL);
  const expectedOrigin = parseProtectedServiceHealthPreviewOrigin(
    process.env.MEELNI_HEALTHCHECK_PREVIEW_ORIGIN
  );
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!url || !expectedOrigin || !bypassSecret) return fail();

  const result = await runServiceHealthSynthetic({
    url,
    protectedPreview: { bypassSecret, expectedOrigin },
  });
  const output = `${JSON.stringify(result)}\n`;
  if (result.status === "passed") process.stdout.write(output);
  else {
    process.stderr.write(output);
    process.exitCode = 1;
  }
}

function fail() {
  process.stderr.write(
    `${JSON.stringify({
      synthetic: "meelni_service_health",
      version: 1,
      status: "failed",
      code: "health_endpoint_invalid",
    })}\n`
  );
  process.exitCode = 1;
}

void main().catch(fail);
