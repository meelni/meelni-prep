import type { NextRequest } from "next/server";

export function getFeedbackQualityRequestPolicyError(
  request: NextRequest
): { error: string; status: 403 | 415 } | null {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return { error: "feedback_quality_json_required", status: 415 };
  }
  const origin = parseOrigin(request.headers.get("origin"));
  if (!origin || origin !== request.nextUrl.origin) {
    return { error: "feedback_quality_cross_site_request_denied", status: 403 };
  }
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  return fetchSite && fetchSite !== "same-origin"
    ? { error: "feedback_quality_cross_site_request_denied", status: 403 }
    : null;
}

function parseOrigin(value: string | null): string | null {
  if (!value || value === "null") return null;
  try {
    const url = new URL(value);
    return url.username || url.password || url.pathname !== "/"
      ? null
      : url.origin;
  } catch {
    return null;
  }
}
