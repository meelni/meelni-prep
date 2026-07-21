import { NextRequest, NextResponse } from "next/server";

const ALLOWED_STATSIG_ENDPOINTS = new Set(["initialize", "rgstr", "sdk_exception"]);
const STATSIG_API_BASE_URL = "https://statsigapi.net/v1";

function copyStatsigHeaders(request: NextRequest) {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const statsigApiKey = request.headers.get("statsig-api-key");
  const statsigSdkType = request.headers.get("statsig-sdk-type");
  const statsigSdkVersion = request.headers.get("statsig-sdk-version");

  if (contentType) {
    headers.set("content-type", contentType);
  }
  if (statsigApiKey) {
    headers.set("statsig-api-key", statsigApiKey);
  }
  if (statsigSdkType) {
    headers.set("statsig-sdk-type", statsigSdkType);
  }
  if (statsigSdkVersion) {
    headers.set("statsig-sdk-version", statsigSdkVersion);
  }

  return headers;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ endpoint: string }> }
) {
  const { endpoint } = await params;

  if (!ALLOWED_STATSIG_ENDPOINTS.has(endpoint)) {
    return NextResponse.json({ error: "Unsupported Statsig endpoint" }, { status: 404 });
  }

  const upstreamUrl = new URL(`${STATSIG_API_BASE_URL}/${endpoint}`);
  upstreamUrl.search = request.nextUrl.search;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: "POST",
      headers: copyStatsigHeaders(request),
      body: await request.arrayBuffer(),
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    const contentType = upstreamResponse.headers.get("content-type");

    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }
    responseHeaders.set("cache-control", "no-store");

    if (upstreamResponse.status === 204 || upstreamResponse.status === 304) {
      return new NextResponse(null, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    }

    return new NextResponse(await upstreamResponse.arrayBuffer(), {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch {
    console.error("statsig_proxy_request_failed");
    return NextResponse.json(
      { error: "Failed to proxy Statsig request" },
      { status: 502 }
    );
  }
}
