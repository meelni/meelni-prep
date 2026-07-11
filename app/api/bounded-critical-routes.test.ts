import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  reportOperationalFailure: vi.fn(),
  startInterviewSessionWorkflow: vi.fn(),
  generateFeedback: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/internal/integrations", () => ({
  getLiveKitAgentName: vi.fn(),
  getLiveKitEnvironment: vi.fn(),
}));
vi.mock("@/lib/workflows/start-session", () => ({
  startInterviewSessionWorkflow: mocks.startInterviewSessionWorkflow,
}));
vi.mock("@/lib/db/sessions", () => ({ getSessionById: vi.fn() }));
vi.mock("@/lib/db/transcripts", () => ({ getSessionTranscript: vi.fn() }));
vi.mock("@/lib/db/feedback", () => ({
  createFeedback: vi.fn(),
  feedbackExists: vi.fn(),
}));
vi.mock("@/lib/evaluation/scorer", () => ({
  generateFeedback: mocks.generateFeedback,
}));
vi.mock("@/lib/operations/operational-events", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/operations/operational-events")
  >()),
  reportOperationalFailure: mocks.reportOperationalFailure,
}));

import { POST as generateFeedback } from "./feedback/generate/route";
import { POST as startSession } from "./session/start/route";

describe("bounded launch-critical JSON routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
          error: null,
        }),
      },
    });
  });

  for (const [name, handler] of [
    ["session start", startSession],
    ["feedback generation", generateFeedback],
  ] as const) {
    it(`${name} rejects oversized bodies without logging or workflow work`, async () => {
      const response = await handler(
        new NextRequest("http://localhost/api/test", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": String(16 * 1024 + 1),
          },
          body: "{}",
        })
      );

      expect(response.status).toBe(413);
      expect(mocks.reportOperationalFailure).not.toHaveBeenCalled();
      expect(mocks.startInterviewSessionWorkflow).not.toHaveBeenCalled();
      expect(mocks.generateFeedback).not.toHaveBeenCalled();
    });

    for (const body of ["null", "[]", '"text"', "42", "true"]) {
      it(`${name} quietly rejects the non-object JSON body ${body}`, async () => {
        const response = await handler(
          new NextRequest("http://localhost/api/test", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          })
        );

        expect(response.status).toBe(400);
        expect(mocks.reportOperationalFailure).not.toHaveBeenCalled();
        expect(mocks.startInterviewSessionWorkflow).not.toHaveBeenCalled();
        expect(mocks.generateFeedback).not.toHaveBeenCalled();
      });
    }
  }
});
