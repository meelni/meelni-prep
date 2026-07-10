// @vitest-environment jsdom

import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  unsubscribe: vi.fn(),
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

import { AuthProvider, useAuth } from "@/app/providers/auth-provider";

function AuthStatus() {
  const { isLoading } = useAuth();
  return <span>{isLoading ? "loading" : "ready"}</span>;
}

describe("AuthProvider client lifecycle", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
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
});
