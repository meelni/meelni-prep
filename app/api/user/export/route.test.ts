import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/account-export", () => ({
  loadAccountExportSource: vi.fn(),
}));
vi.mock("@/lib/workflows/export-account-data", () => ({
  createAccountDataExport: vi.fn(),
}));

import { loadAccountExportSource } from "@/lib/db/account-export";
import { createClient } from "@/lib/supabase/server";
import { createAccountDataExport } from "@/lib/workflows/export-account-data";

import { GET } from "./route";

describe("GET /api/user/export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an authenticated user before reading export data", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error("missing session"),
        }),
      },
    } as never);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(loadAccountExportSource).not.toHaveBeenCalled();
  });

  it("redacts authentication provider failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(createClient).mockRejectedValue(
      new Error("service-role-secret-provider-error")
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("authentication_check_failed");
    expect(JSON.stringify(body)).not.toContain("service-role-secret");
    expect(loadAccountExportSource).not.toHaveBeenCalled();
  });

  it("downloads the authenticated user's versioned export without caching", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-one",
              email: "candidate@example.com",
              user_metadata: { full_name: "Candidate" },
            },
          },
          error: null,
        }),
      },
    } as never);
    vi.mocked(loadAccountExportSource).mockResolvedValue({} as never);
    vi.mocked(createAccountDataExport).mockReturnValue({
      schemaVersion: "1.3.0",
      exportedAt: "2026-07-10T16:00:00.000Z",
      account: { id: "user-one" },
    } as never);

    const response = await GET();

    expect(loadAccountExportSource).toHaveBeenCalledWith("user-one");
    expect(createAccountDataExport).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticatedUser: {
          id: "user-one",
          email: "candidate@example.com",
          name: "Candidate",
        },
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="meelni-account-data-2026-07-10.json"'
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        schemaVersion: "1.3.0",
        account: { id: "user-one" },
      })
    );
  });

  it("redacts internal generation failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-one", user_metadata: {} } },
          error: null,
        }),
      },
    } as never);
    vi.mocked(loadAccountExportSource).mockRejectedValue(
      new Error("postgresql://secret-provider-host")
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "account_export_failed",
      message: "We could not generate your export. Please try again.",
    });
    expect(JSON.stringify(body)).not.toContain("secret-provider-host");
  });
});
