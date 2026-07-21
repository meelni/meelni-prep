import { NextRequest } from "next/server";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  readUserAnalyticsConsentRecord: vi.fn(),
  writeUserAnalyticsConsent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/db/analytics-consent", () => ({
  readUserAnalyticsConsentRecord: mocks.readUserAnalyticsConsentRecord,
  writeUserAnalyticsConsent: mocks.writeUserAnalyticsConsent,
}));

import { GET, PUT } from "./route";

const undecided = {
  decision: "undecided",
  policyVersion: null,
  source: null,
  decidedAt: null,
  scope: null,
};

describe("analytics consent API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });
    mocks.readUserAnalyticsConsentRecord.mockResolvedValue({
      consent: undecided,
      revision: 0,
    });
    mocks.writeUserAnalyticsConsent.mockImplementation(
      async (_userId, consent, expectedRevision) => ({
        consent,
        revision: expectedRevision + 1,
        status: "applied",
      })
    );
  });

  it("persists anonymous acceptance in an HttpOnly browser cookie", async () => {
    const response = await PUT(
      request({
        decision: "accepted",
        expectedRevision: 0,
        policyVersion: 1,
        source: "banner",
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join(";")).toContain(
      "__Host-meelni_analytics_consent=v1.accepted."
    );
    expect(response.headers.getSetCookie().join(";")).toContain("HttpOnly");
    expect(response.headers.getSetCookie().join(";")).toContain("Secure");
    expect(response.headers.getSetCookie().join(";")).not.toContain("Domain=");
    expect(mocks.writeUserAnalyticsConsent).not.toHaveBeenCalled();
  });

  it("persists signed-in acceptance before setting the browser cookie", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    const response = await PUT(
      request({
        decision: "accepted",
        expectedRevision: 0,
        policyVersion: 1,
        source: "settings",
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.writeUserAnalyticsConsent).toHaveBeenCalledOnce();
    expect((await response.json()).persistence.account).toBe(true);
  });

  it("requires the last observed revision for signed-in writes", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    const response = await PUT(
      request({
        decision: "accepted",
        policyVersion: 1,
        source: "settings",
      })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "consent_revision_required",
    });
    expect(mocks.writeUserAnalyticsConsent).not.toHaveBeenCalled();
  });

  it("rejects an outdated policy version without persistence", async () => {
    const response = await PUT(
      request({
        decision: "accepted",
        policyVersion: 2,
        source: "banner",
      })
    );
    expect(response.status).toBe(409);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("rejects legacy acceptance instead of upgrading it to explicit consent", async () => {
    const response = await PUT(
      request({
        decision: "accepted",
        policyVersion: 1,
        source: "legacy_decline",
      })
    );
    expect(response.status).toBe(400);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("fails closed when signed-in acceptance cannot reach the database", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.writeUserAnalyticsConsent.mockRejectedValue(new Error("db down"));
    const response = await PUT(
      request({
        decision: "accepted",
        expectedRevision: 0,
        policyVersion: 1,
        source: "banner",
      })
    );
    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("returns the atomic account winner when a stale acceptance loses to decline", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    const accountDecline = {
      decision: "declined",
      policyVersion: 1,
      source: "settings",
      decidedAt: "2026-07-10T12:01:00.000Z",
      scope: "account",
    };
    mocks.writeUserAnalyticsConsent.mockResolvedValue({
      consent: accountDecline,
      revision: 2,
      status: "conflict",
    });
    const response = await PUT(
      request({
        decision: "accepted",
        expectedRevision: 1,
        policyVersion: 1,
        source: "settings",
      })
    );
    expect(response.status).toBe(409);
    expect((await response.json()).consent).toEqual(accountDecline);
    expect(response.headers.getSetCookie().join(";")).toContain("v1.declined.");
  });

  it("fails closed when authentication cannot determine account state", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("auth unavailable"),
    });
    const response = await PUT(
      request({
        decision: "accepted",
        policyVersion: 1,
        source: "banner",
      })
    );
    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("applies withdrawal to the browser even when account sync fails", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.writeUserAnalyticsConsent.mockRejectedValue(new Error("db down"));
    const response = await PUT(
      request({
        decision: "declined",
        expectedRevision: 0,
        policyVersion: 1,
        source: "settings",
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join(";")).toContain("v1.declined.");
    expect((await response.json()).persistence.account).toBe(false);
  });

  it("does not require a prior account-consent read to persist withdrawal", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.readUserAnalyticsConsentRecord.mockRejectedValue(
      new Error("db read down")
    );
    mocks.writeUserAnalyticsConsent.mockRejectedValue(
      new Error("db write down")
    );
    const response = await PUT(
      request({
        decision: "declined",
        expectedRevision: 0,
        policyVersion: 1,
        source: "settings",
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join(";")).toContain("v1.declined.");
    expect(mocks.readUserAnalyticsConsentRecord).not.toHaveBeenCalled();
  });

  it("blocks cross-site writes before auth or persistence", async () => {
    const response = await PUT(
      request(
        { decision: "declined", policyVersion: 1, source: "banner" },
        { origin: "https://attacker.example", "sec-fetch-site": "cross-site" }
      )
    );
    expect(response.status).toBe(403);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("returns an undecided no-store snapshot without prior choice", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/analytics/consent")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).consent).toEqual(undecided);
  });

  it("does not promote anonymous browser acceptance into a signed-in account", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-2" } },
      error: null,
    });
    mocks.readUserAnalyticsConsentRecord.mockResolvedValue({
      consent: undecided,
      revision: 0,
    });
    const getRequest = new NextRequest(
      "http://localhost:3000/api/analytics/consent",
      {
        headers: {
          cookie:
            "__Host-meelni_analytics_consent=v1.accepted.1783684800000.banner.anonymous",
        },
      }
    );
    const response = await GET(getRequest);
    expect((await response.json()).consent).toEqual(undecided);
    expect(mocks.writeUserAnalyticsConsent).not.toHaveBeenCalled();
  });

  it("keeps a legacy browser decline local when a shared browser is signed in", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "shared-browser-account" } },
      error: null,
    });
    const response = await PUT(
      request({
        decision: "declined",
        policyVersion: 1,
        source: "legacy_decline",
      })
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.consent).toMatchObject({
      decision: "declined",
      source: "legacy_decline",
      scope: "account",
    });
    expect(body.persistence).toEqual({
      browser: true,
      account: false,
      accountRevision: null,
      browserOnly: true,
    });
    expect(mocks.writeUserAnalyticsConsent).not.toHaveBeenCalled();
  });
});

function request(body: object, extraHeaders: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/analytics/consent", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}
