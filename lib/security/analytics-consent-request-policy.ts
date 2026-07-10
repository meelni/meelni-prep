import type { NextRequest } from "next/server";

export function getAnalyticsConsentRequestPolicyError(
  req: NextRequest
): { error: string; status: 403 | 415 } | null {
  const contentType = req.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return { error: "consent_json_required", status: 415 };
  }

  const origin = parseOrigin(req.headers.get("origin"));
  if (!origin || origin !== req.nextUrl.origin) {
    return { error: "consent_cross_site_request_denied", status: 403 };
  }
  const fetchSite = req.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") {
    return { error: "consent_cross_site_request_denied", status: 403 };
  }
  return null;
}

function parseOrigin(value: string | null): string | null {
  if (!value || value === "null") return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}
