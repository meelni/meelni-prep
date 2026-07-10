import {
  parseServiceHealthUrl,
  runServiceHealthSynthetic,
} from "../lib/operations/service-health-synthetic";

async function main() {
  const url = parseServiceHealthUrl(process.env.HEALTHCHECK_URL);
  if (!url) {
    fail("health_endpoint_invalid");
    return;
  }

  const result = await runServiceHealthSynthetic({ url });
  const output = `${JSON.stringify(result)}\n`;
  if (result.status === "passed") process.stdout.write(output);
  else {
    process.stderr.write(output);
    process.exitCode = 1;
  }
}

function fail(code: "health_endpoint_invalid" | "health_endpoint_unreachable") {
  process.stderr.write(
    `${JSON.stringify({
      synthetic: "meelni_service_health",
      version: 1,
      status: "failed",
      code,
    })}\n`
  );
  process.exitCode = 1;
}

void main().catch(() => fail("health_endpoint_unreachable"));
