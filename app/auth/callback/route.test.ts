import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/users", () => ({
  AccountDeletionPendingError: class AccountDeletionPendingError extends Error {},
  upsertUser: vi.fn(),
}));

import { AccountDeletionPendingError, upsertUser } from "@/lib/db/users";
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exchanges a code and redirects to the safe selected-question destination", async () => {
    const auth = mockSupabase({ user: null });

    const response = await GET(
      request(
        "code=oauth-code&next=%2Fdashboard%2Fnew-interview%3FquestionId%3Dquestion-1&cancelTo=%2Fexplore"
      )
    );

    expect(response.headers.get("location")).toBe(
      "https://meelni.test/dashboard/new-interview?questionId=question-1"
    );
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("oauth-code");
  });

  it("returns an explicit provider cancellation to its safe origin", async () => {
    const response = await GET(
      request("error=access_denied&cancelTo=%2Fexplore%3Fpage%3D2")
    );

    expect(response.headers.get("location")).toBe(
      "https://meelni.test/explore?page=2"
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    "signup_disabled",
    "user_banned",
    "provider_email_needs_verification",
  ])(
    "does not misclassify coded access denial as cancellation (%s)",
    async (errorCode) => {
      const response = await GET(
        request(
          `error=access_denied&error_code=${errorCode}&error_description=untrusted&cancelTo=%2Fexplore`
        )
      );
      const location = new URL(response.headers.get("location")!);

      expect(location.pathname).toBe("/auth/signin");
      expect(location.searchParams.get("error")).toBe("auth_callback_failed");
      expect(location.searchParams.get("error_code")).toBeNull();
      expect(location.searchParams.get("error_description")).toBeNull();
      expect(location.searchParams.get("cancelTo")).toBe("/explore");
      expect(createClient).not.toHaveBeenCalled();
    }
  );

  it.each(["", "error=server_error&error_description=untrusted+detail"])(
    "routes missing-code and provider failures to safe recovery (%s)",
    async (query) => {
      const response = await GET(
        request(
          [
            query,
            "next=%2Fdashboard%2Fnew-interview%3FquestionId%3Dquestion-1",
            "cancelTo=%2Fexplore",
          ]
            .filter(Boolean)
            .join("&")
        )
      );
      const location = new URL(response.headers.get("location")!);

      expect(location.pathname).toBe("/auth/signin");
      expect(location.searchParams.get("error")).toBe("auth_callback_failed");
      expect(location.searchParams.get("error_description")).toBeNull();
      expect(location.searchParams.get("redirectTo")).toBe(
        "/dashboard/new-interview?questionId=question-1"
      );
      expect(location.searchParams.get("cancelTo")).toBe("/explore");
      expect(createClient).not.toHaveBeenCalled();
    }
  );

  it("preserves handoff state when code exchange fails", async () => {
    mockSupabase({ exchangeError: new Error("expired verifier") });
    const response = await GET(
      request(
        "code=expired&next=%2Fdashboard%2Fnew-interview%3FquestionId%3Dquestion-1&cancelTo=%2Fexplore"
      )
    );
    const location = new URL(response.headers.get("location")!);

    expect(location.pathname).toBe("/auth/signin");
    expect(location.searchParams.get("error")).toBe("auth_failed");
    expect(location.searchParams.get("redirectTo")).toContain(
      "questionId=question-1"
    );
    expect(location.searchParams.get("cancelTo")).toBe("/explore");
  });

  it("preserves handoff state while safely denying a pending-deletion account", async () => {
    const auth = mockSupabase({
      user: { id: "user-1", email: "candidate@example.com", user_metadata: {} },
    });
    vi.mocked(upsertUser).mockRejectedValueOnce(
      new AccountDeletionPendingError()
    );

    const response = await GET(
      request(
        "code=oauth-code&next=%2Fdashboard%2Fnew-interview%3FquestionId%3Dquestion-1&cancelTo=%2Fexplore"
      )
    );
    const location = new URL(response.headers.get("location")!);

    expect(auth.signOut).toHaveBeenCalled();
    expect(location.searchParams.get("error")).toBe("account_deletion_pending");
    expect(location.searchParams.get("redirectTo")).toContain(
      "questionId=question-1"
    );
    expect(location.searchParams.get("cancelTo")).toBe("/explore");
  });
});

function request(query: string): Request {
  return new Request(`https://meelni.test/auth/callback?${query}`);
}

function mockSupabase({
  exchangeError = null,
  user = null,
}: {
  exchangeError?: Error | null;
  user?: {
    id: string;
    email: string;
    user_metadata: Record<string, unknown>;
  } | null;
} = {}) {
  const auth = {
    exchangeCodeForSession: vi.fn().mockResolvedValue({ error: exchangeError }),
    getUser: vi.fn().mockResolvedValue({ data: { user } }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  vi.mocked(createClient).mockResolvedValue({ auth } as never);
  return auth;
}
