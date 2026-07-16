export function resolveInterviewAppBaseUrl(
  env: NodeJS.ProcessEnv = process.env
): string {
  const configured = parseConfiguredUrl(env.NEXT_PUBLIC_APP_URL);
  if (configured) return configured;

  const vercelHost = env.VERCEL_URL?.trim();
  if (vercelHost) {
    const deploymentUrl = parseConfiguredUrl(`https://${vercelHost}`);
    if (deploymentUrl) return deploymentUrl;
  }

  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
    return "http://localhost:3000";
  }

  throw new Error("interview_app_base_url_unavailable");
}

function parseConfiguredUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return undefined;
    }
    if (parsed.username || parsed.password) return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}
