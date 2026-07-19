import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/account-deletions", () => ({
  markAccountDeletionFailed: vi.fn(),
  requestAccountDeletionWithCurrentSubjects: vi.fn(),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

import {
  markAccountDeletionFailed,
  requestAccountDeletionWithCurrentSubjects,
} from "@/lib/db/account-deletions";
import { inngest } from "@/lib/inngest/client";
import { createClient } from "@/lib/supabase/server";

import { DELETE, POST } from "./route";

const RECENT_SIGN_IN = new Date().toISOString();

describe("/api/user/delete", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("closes the unconfirmed DELETE method", async () => {
    const response = await DELETE();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(requestAccountDeletionWithCurrentSubjects).not.toHaveBeenCalled();
  });

  it("requires exact confirmation before authentication or persistence", async () => {
    const response = await POST(requestWith({ confirmation: "delete" }));
    expect(response.status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
    expect(requestAccountDeletionWithCurrentSubjects).not.toHaveBeenCalled();
  });

  it("requires an authenticated account", async () => {
    vi.mocked(createClient).mockResolvedValue(clientFor(null) as never);
    const response = await POST(requestWith({ confirmation: "DELETE" }));
    expect(response.status).toBe(401);
    expect(requestAccountDeletionWithCurrentSubjects).not.toHaveBeenCalled();
  });

  it("redacts authentication provider failures", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(createClient).mockRejectedValue(
      new Error("service-role-secret-provider-error")
    );

    const response = await POST(requestWith({ confirmation: "DELETE" }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("authentication_check_failed");
    expect(JSON.stringify(body)).not.toContain("service-role-secret");
    expect(readOperationalEvent(consoleError)).toMatchObject({
      operation: "account_deletion",
      errorCode: "account_deletion_auth_check_failed",
      correlationId: null,
    });
  });

  it("fails closed when the server-verified sign-in is stale", async () => {
    vi.mocked(createClient).mockResolvedValue(
      clientFor({
        id: "user-one",
        last_sign_in_at: "2026-01-01T00:00:00Z",
      }) as never
    );

    const response = await POST(requestWith({ confirmation: "DELETE" }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("reauthentication_required");
    expect(body.reauthenticateAt).toContain("/auth/signin");
    expect(requestAccountDeletionWithCurrentSubjects).not.toHaveBeenCalled();
  });

  it("persists and queues deletion without claiming provider completion", async () => {
    const client = clientFor({
      id: "user-one",
      last_sign_in_at: RECENT_SIGN_IN,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(requestAccountDeletionWithCurrentSubjects).mockResolvedValue(
      {} as never
    );
    vi.mocked(inngest.send).mockResolvedValue({} as never);

    const response = await POST(requestWith({ confirmation: "DELETE" }));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({
      status: "deletion_requested",
      message: "Deletion request saved. Account cleanup is in progress.",
    });
    expect(body).not.toHaveProperty("success");
    expect(requestAccountDeletionWithCurrentSubjects).toHaveBeenCalledWith(
      "user-one"
    );
    expect(client.auth.signOut).toHaveBeenCalled();
  });

  it("reports a durable delayed retry when event enqueue fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = clientFor({
      id: "user-one",
      last_sign_in_at: RECENT_SIGN_IN,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(requestAccountDeletionWithCurrentSubjects).mockResolvedValue(
      {} as never
    );
    vi.mocked(inngest.send).mockRejectedValue(
      new Error("provider secret should not escape")
    );

    const response = await POST(requestWith({ confirmation: "DELETE" }));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.status).toBe("deletion_retry_scheduled");
    expect(JSON.stringify(body)).not.toContain("provider secret");
    expect(markAccountDeletionFailed).toHaveBeenCalledWith(
      "user-one",
      "event_enqueue_failed"
    );
    expect(client.auth.signOut).toHaveBeenCalled();
  });

  it("reports when a durable deletion cannot record its retry state", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const client = clientFor({
      id: "user-one",
      last_sign_in_at: RECENT_SIGN_IN,
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(requestAccountDeletionWithCurrentSubjects).mockResolvedValue(
      {} as never
    );
    vi.mocked(inngest.send).mockRejectedValue(new Error("provider-secret"));
    vi.mocked(markAccountDeletionFailed).mockRejectedValue(
      new Error("database-secret")
    );

    const response = await POST(requestWith({ confirmation: "DELETE" }));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.status).toBe("deletion_retry_scheduled");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("secret");
    expect(readOperationalEvent(consoleError)).toMatchObject({
      operation: "account_deletion",
      errorCode: "account_deletion_retry_state_failed",
      severity: "critical",
      correlationId: null,
    });
  });

  it("reports a redacted warning when local sign-out does not complete", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const client = clientFor({
      id: "user-one",
      last_sign_in_at: RECENT_SIGN_IN,
    });
    client.auth.signOut.mockRejectedValue(new Error("signout-secret"));
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(requestAccountDeletionWithCurrentSubjects).mockResolvedValue(
      {} as never
    );
    vi.mocked(inngest.send).mockResolvedValue({} as never);

    const response = await POST(requestWith({ confirmation: "DELETE" }));

    expect(response.status).toBe(202);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("secret");
    expect(readOperationalEvent(consoleError)).toMatchObject({
      operation: "account_deletion",
      errorCode: "account_deletion_sign_out_failed",
      severity: "warning",
      correlationId: null,
    });
  });

  it("redacts persistence and admin errors", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(createClient).mockResolvedValue(
      clientFor({ id: "user-one", last_sign_in_at: RECENT_SIGN_IN }) as never
    );
    vi.mocked(requestAccountDeletionWithCurrentSubjects).mockRejectedValue(
      new Error("postgresql://secret-host")
    );

    const response = await POST(requestWith({ confirmation: "DELETE" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("account_deletion_request_failed");
    expect(JSON.stringify(body)).not.toContain("secret-host");
    expect(readOperationalEvent(consoleError)).toMatchObject({
      operation: "account_deletion",
      errorCode: "account_deletion_request_failed",
      severity: "critical",
      correlationId: null,
    });
  });
});

function readOperationalEvent(
  consoleError: ReturnType<typeof vi.spyOn>
): Record<string, unknown> {
  expect(consoleError).toHaveBeenCalledTimes(1);
  return JSON.parse(String(consoleError.mock.calls[0]?.[0])) as Record<
    string,
    unknown
  >;
}

function requestWith(body: unknown) {
  return new NextRequest("http://localhost/api/user/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function clientFor(user: Record<string, unknown> | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error("unauthorized"),
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}
