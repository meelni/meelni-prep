// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { useQueryClient } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  unsubscribe: vi.fn(),
  scrubRetiredTranscriptBrowserStorage: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/analytics/analytics-service", () => ({
  analytics: {
    identify: vi.fn(),
    reset: vi.fn(),
    track: vi.fn(),
  },
}));

vi.mock("@/lib/privacy/transcript-browser-storage", () => ({
  scrubRetiredTranscriptBrowserStorage:
    mocks.scrubRetiredTranscriptBrowserStorage,
}));

import { AuthProvider, useAuth } from "@/app/providers/auth-provider";
import { QueryProvider } from "@/app/providers/query-provider";

function AuthStatus() {
  const { isLoading } = useAuth();
  return <span>{isLoading ? "loading" : "ready"}</span>;
}

function QueryClientCapture({
  onReady,
}: {
  onReady: (client: ReturnType<typeof useQueryClient>) => void;
}) {
  const queryClient = useQueryClient();
  React.useEffect(() => {
    onReady(queryClient);
  }, [onReady, queryClient]);
  return null;
}

describe("AuthProvider client lifecycle", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps one browser client and auth listener across provider renders", async () => {
    mocks.createClient.mockImplementation(() => ({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: mocks.unsubscribe } },
        })),
      },
    }));

    const view = render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>
    );

    expect(await screen.findByText("ready")).toBeInTheDocument();
    view.rerender(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>
    );
    await waitFor(() => expect(mocks.createClient).toHaveBeenCalledTimes(1));
    expect(mocks.unsubscribe).not.toHaveBeenCalled();

    view.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("scrubs retired transcript storage when bootstrap resolves signed out", async () => {
    mocks.createClient.mockImplementation(() => ({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: mocks.unsubscribe } },
        })),
      },
    }));

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>
    );

    expect(await screen.findByText("ready")).toBeInTheDocument();
    expect(mocks.scrubRetiredTranscriptBrowserStorage).toHaveBeenCalledTimes(1);
  });

  it("keeps retired transcript storage scrubbed across sign-out", async () => {
    let authChange: ((event: string, session: null) => void) | undefined;
    mocks.createClient.mockImplementation(() => ({
      auth: {
        getSession: vi
          .fn()
          .mockResolvedValue({ data: { session: authSession("user-a") } }),
        onAuthStateChange: vi.fn((listener) => {
          authChange = listener;
          return {
            data: { subscription: { unsubscribe: mocks.unsubscribe } },
          };
        }),
      },
    }));

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>
    );
    expect(await screen.findByText("ready")).toBeInTheDocument();

    authChange?.("SIGNED_OUT", null);

    expect(mocks.scrubRetiredTranscriptBrowserStorage).toHaveBeenCalledTimes(2);
  });

  it("keeps retired transcript storage scrubbed across account replacement", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ synced: false }) })
    );
    let authChange:
      | ((event: string, session: ReturnType<typeof authSession>) => void)
      | undefined;
    mocks.createClient.mockImplementation(() => ({
      auth: {
        getSession: vi
          .fn()
          .mockResolvedValue({ data: { session: authSession("user-a") } }),
        onAuthStateChange: vi.fn((listener) => {
          authChange = listener;
          return {
            data: { subscription: { unsubscribe: mocks.unsubscribe } },
          };
        }),
      },
    }));

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>
    );
    expect(await screen.findByText("ready")).toBeInTheDocument();

    authChange?.("SIGNED_IN", authSession("user-b"));

    expect(mocks.scrubRetiredTranscriptBrowserStorage).toHaveBeenCalledTimes(1);
  });

  it("clears private React Query data when the auth subject changes", async () => {
    let authChange:
      | ((event: string, session: ReturnType<typeof authSession>) => void)
      | undefined;
    mocks.createClient.mockImplementation(() => ({
      auth: {
        getSession: vi
          .fn()
          .mockResolvedValue({ data: { session: authSession("user-a") } }),
        onAuthStateChange: vi.fn((listener) => {
          authChange = listener;
          return {
            data: { subscription: { unsubscribe: mocks.unsubscribe } },
          };
        }),
      },
    }));
    let queryClient: ReturnType<typeof useQueryClient> | undefined;

    render(
      <AuthProvider>
        <QueryProvider>
          <AuthStatus />
          <QueryClientCapture
            onReady={(client) => {
              queryClient = client;
            }}
          />
        </QueryProvider>
      </AuthProvider>
    );
    expect(await screen.findByText("ready")).toBeInTheDocument();
    await waitFor(() => expect(queryClient).toBeDefined());
    queryClient?.setQueryData(["sessions", { userId: "user-a" }, "list"], {
      sessions: [{ id: "private-session-a" }],
    });

    authChange?.("SIGNED_IN", authSession("user-b"));

    await waitFor(() => {
      expect(
        queryClient?.getQueryData(["sessions", { userId: "user-a" }, "list"])
      ).toBeUndefined();
    });
  });
});

function authSession(userId: string) {
  return {
    user: {
      id: userId,
      app_metadata: { provider: "email" },
      email: `${userId}@example.com`,
      created_at: "2026-07-10T00:00:00.000Z",
      last_sign_in_at: "2026-07-10T01:00:00.000Z",
    },
  } as never;
}
