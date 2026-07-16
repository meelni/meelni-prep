import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: dbMocks }));

import { createClient } from "@/lib/supabase/server";
import { GET, PUT } from "./route";

describe("/api/user/settings privacy contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not expose deprecated transcript or analytics preference columns", async () => {
    const storedSettings = {
      displayName: "Candidate",
      defaultInterviewType: "product_sense",
      defaultDifficulty: "medium",
      questionRecency: "current",
      emailNotifications: true,
      sessionCompletionEmail: true,
      feedbackReadyEmail: true,
      weeklyProgressReport: false,
      theme: "system",
      autoSaveTranscripts: false,
      saveTranscripts: false,
      shareAnonymousData: false,
    };
    const limit = vi.fn().mockResolvedValue([storedSettings]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    dbMocks.select.mockReturnValue({ from });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.settings).toMatchObject({
      displayName: "Candidate",
      defaultInterviewType: "product_sense",
      defaultDifficulty: "medium",
    });
    expect(body.settings).not.toHaveProperty("autoSaveTranscripts");
    expect(body.settings).not.toHaveProperty("saveTranscripts");
    expect(body.settings).not.toHaveProperty("shareAnonymousData");
  });

  it("rejects deprecated inert controls instead of pretending to save them", async () => {
    const request = new NextRequest("http://localhost/api/user/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ saveTranscripts: false }),
    });

    const response = await PUT(request);

    expect(response.status).toBe(400);
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it("redacts hostile database error names and messages from read logs", async () => {
    const sentinel = "PRIVATE_SETTINGS_SENTINEL_do_not_log";
    const databaseError = new Error(sentinel);
    databaseError.name = sentinel;
    dbMocks.select.mockImplementation(() => {
      throw databaseError;
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(500);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(sentinel);
    expect(errorSpy).toHaveBeenCalledWith("settings_read_failed", {
      error_code: "SETTINGS_READ_FAILED",
      error_class: "Error",
    });
  });

  it("redacts hostile database error names and messages from update logs", async () => {
    const sentinel = "PRIVATE_SETTINGS_SENTINEL_do_not_log";
    const databaseError = new Error(sentinel);
    databaseError.name = sentinel;
    dbMocks.insert.mockImplementation(() => {
      throw databaseError;
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = new NextRequest("http://localhost/api/user/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme: "system" }),
    });

    const response = await PUT(request);

    expect(response.status).toBe(500);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(sentinel);
    expect(errorSpy).toHaveBeenCalledWith("settings_update_failed", {
      error_code: "SETTINGS_UPDATE_FAILED",
      error_class: "Error",
    });
  });
});
