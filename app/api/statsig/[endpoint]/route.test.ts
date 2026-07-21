import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveTrustedAnalyticsConsentState: vi.fn(),
}));

vi.mock("@/lib/analytics/trusted-consent", () => ({
  resolveTrustedAnalyticsConsentState:
    mocks.resolveTrustedAnalyticsConsentState,
}));

import { POST } from "./route";

const accepted = {
  decision: "accepted",
  policyVersion: 1,
  source: "banner",
  decidedAt: "2026-07-10T12:00:00.000Z",
  scope: "anonymous",
} as const;

describe("Statsig consent proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    {
      label: "unresolved consent",
      state: { resolved: false, consent: accepted },
    },
    {
      label: "undecided consent",
      state: {
        resolved: true,
        consent: {
          decision: "undecided",
          policyVersion: null,
          source: null,
          decidedAt: null,
          scope: null,
        },
      },
    },
    {
      label: "declined consent",
      state: {
        resolved: true,
        consent: { ...accepted, decision: "declined" },
      },
    },
    {
      label: "outdated acceptance",
      state: {
        resolved: true,
        consent: { ...accepted, policyVersion: 2 },
      },
    },
  ])("returns provider-silent success for $label", async ({ state }) => {
    mocks.resolveTrustedAnalyticsConsentState.mockResolvedValue(state);
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const response = await POST(request("initialize"), params("initialize"));

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    {
      endpoint: "initialize",
      upstream: "https://statsigapi.net/v1/initialize",
    },
    {
      endpoint: "sdk_exception",
      upstream: "https://statsigapi.net/v1/sdk_exception",
    },
  ])(
    "forwards $endpoint only after current acceptance",
    async ({ endpoint, upstream: upstreamUrl }) => {
      mocks.resolveTrustedAnalyticsConsentState.mockResolvedValue({
        resolved: true,
        consent: accepted,
      });
      const upstream = vi.fn(async (_input: RequestInfo | URL) =>
        Response.json({ feature_gates: {} }, { status: 200 })
      );
      vi.stubGlobal("fetch", upstream);

      const response = await POST(request(endpoint), params(endpoint));

      expect(response.status).toBe(200);
      expect(upstream).toHaveBeenCalledOnce();
      expect(String(upstream.mock.calls[0]?.[0])).toBe(upstreamUrl);
    }
  );

  it("keeps sdk exception reports provider-silent before consent", async () => {
    mocks.resolveTrustedAnalyticsConsentState.mockResolvedValue({
      resolved: true,
      consent: { ...accepted, decision: "declined" },
    });
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const response = await POST(
      request("sdk_exception"),
      params("sdk_exception")
    );

    expect(response.status).toBe(204);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(["rgstr", "download_config_specs"])(
    "rejects non-evaluation endpoint %s before consent or upstream work",
    async (endpoint) => {
      const upstream = vi.fn();
      vi.stubGlobal("fetch", upstream);

      const response = await POST(request(endpoint), params(endpoint));

      expect(response.status).toBe(404);
      expect(mocks.resolveTrustedAnalyticsConsentState).not.toHaveBeenCalled();
      expect(upstream).not.toHaveBeenCalled();
    }
  );
});

function request(endpoint: string) {
  return new NextRequest(`http://localhost:3000/api/statsig/${endpoint}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie:
        "meelni_analytics_consent=v1.accepted.1783684800000.banner.anonymous",
    },
    body: JSON.stringify({ user: { userID: "anon-safe" } }),
  });
}

function params(endpoint: string) {
  return { params: Promise.resolve({ endpoint }) };
}
