import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION } from "@meelni/core";
import {
  handleReadFeedbackQualitySignal,
  handleWriteFeedbackQualitySignal,
  type FeedbackQualityRouteDependencies,
} from "@/lib/http/feedback-quality-signal";

const signal = {
  contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
  outcome: "partial_scorecard" as const,
  response: "helpful" as const,
  reason: null,
  revision: 1,
  createdAt: "2026-08-13T12:00:00.000Z",
  updatedAt: "2026-08-13T12:00:00.000Z",
};
const SESSION_ID = "10000000-0000-4000-8000-000000000001";

describe("feedback quality owner route", () => {
  let deps: FeedbackQualityRouteDependencies;

  beforeEach(() => {
    deps = dependencies();
  });

  it("authenticates before rate or body processing", async () => {
    deps.authenticate = vi.fn(async () => ({
      ok: false as const,
      reason: "unauthorized" as const,
    }));
    const response = await handleWriteFeedbackQualitySignal(
      request("not-json", {}),
      "private-session",
      deps
    );
    expect(response.status).toBe(401);
    expect(deps.consumeRateLimit).not.toHaveBeenCalled();
    expect(deps.repository.readOwned).not.toHaveBeenCalled();
  });

  it("consumes the durable owner budget before policy and target lookup", async () => {
    deps.consumeRateLimit = vi.fn(async () => ({
      allowed: false,
      retryAfterSeconds: 37,
    }));
    const response = await handleWriteFeedbackQualitySignal(
      request("not-json", {}),
      "private-session",
      deps
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("37");
    expect(deps.repository.readOwned).not.toHaveBeenCalled();
  });

  it("requires same-origin JSON and a bounded body", async () => {
    const wrongType = await handleWriteFeedbackQualitySignal(
      request("{}", {
        origin: "https://meelni.test",
        "content-type": "text/plain",
      }),
      SESSION_ID,
      deps
    );
    expect(wrongType.status).toBe(415);

    const crossSite = await handleWriteFeedbackQualitySignal(
      request("{}", {
        origin: "https://attacker.test",
        "content-type": "application/json",
        "sec-fetch-site": "cross-site",
      }),
      SESSION_ID,
      deps
    );
    expect(crossSite.status).toBe(403);

    const oversized = await handleWriteFeedbackQualitySignal(
      request(JSON.stringify({ padding: "x".repeat(1_100) })),
      SESSION_ID,
      deps
    );
    expect(oversized.status).toBe(413);
  });

  it("cancels a lengthless request stream as soon as it exceeds the bound", async () => {
    let pulls = 0;
    let cancelled = false;
    const chunks = [
      new Uint8Array(800).fill(32),
      new Uint8Array(300).fill(32),
      new Uint8Array(300).fill(32),
    ];
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          const chunk = chunks[pulls];
          pulls += 1;
          if (chunk) controller.enqueue(chunk);
          else controller.close();
        },
        cancel() {
          cancelled = true;
          return Promise.reject(new Error("synthetic cancellation failure"));
        },
      },
      { highWaterMark: 0 }
    );
    const response = await handleWriteFeedbackQualitySignal(
      streamingRequest(stream),
      SESSION_ID,
      deps
    );
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulls).toBe(2);
    expect(deps.repository.readOwned).not.toHaveBeenCalled();
  });

  it("returns owner-safe no-store state and non-enumerating absence", async () => {
    const read = await handleReadFeedbackQualitySignal(SESSION_ID, deps);
    expect(read.status).toBe(200);
    expect(read.headers.get("Cache-Control")).toContain("no-store");
    expect(await read.json()).toEqual({
      outcome: "partial_scorecard",
      signal: null,
    });

    vi.mocked(deps.repository.readOwned).mockResolvedValue({
      disposition: "not_found",
    });
    const missing = await handleReadFeedbackQualitySignal(SESSION_ID, deps);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: "feedback_quality_not_found",
    });

    vi.mocked(deps.repository.readOwned).mockResolvedValue({
      disposition: "signal_invalid",
    });
    const corrupt = await handleReadFeedbackQualitySignal(SESSION_ID, deps);
    expect(corrupt.status).toBe(404);
    expect(await corrupt.json()).toEqual({
      error: "feedback_quality_not_found",
    });
  });

  it("keeps dependency failures private and non-cacheable", async () => {
    vi.mocked(deps.repository.readOwned).mockRejectedValue(
      new Error("synthetic database failure")
    );
    const read = await handleReadFeedbackQualitySignal(SESSION_ID, deps);
    expect(read.status).toBe(503);
    expect(read.headers.get("Cache-Control")).toContain("no-store");
    expect(await read.json()).toEqual({
      error: "feedback_quality_unavailable",
    });

    vi.mocked(deps.repository.readOwned).mockResolvedValue({
      disposition: "available",
      state: { outcome: "partial_scorecard", signal: null },
    });
    vi.mocked(deps.repository.writeOwned).mockRejectedValue(
      new Error("synthetic database failure")
    );
    const write = await handleWriteFeedbackQualitySignal(
      request(JSON.stringify(command(null))),
      SESSION_ID,
      deps
    );
    expect(write.status).toBe(503);
    expect(write.headers.get("Cache-Control")).toContain("no-store");
    expect(deps.trackResponse).not.toHaveBeenCalled();
  });

  it("maps created and unchanged transitions without duplicate analytics", async () => {
    vi.mocked(deps.repository.writeOwned).mockResolvedValue({
      disposition: "created",
      state: { outcome: "partial_scorecard", signal },
    });
    const created = await handleWriteFeedbackQualitySignal(
      request(JSON.stringify(command(null))),
      SESSION_ID,
      deps
    );
    expect(created.status).toBe(201);
    expect(deps.trackResponse).toHaveBeenCalledTimes(1);

    vi.mocked(deps.repository.readOwned).mockResolvedValue({
      disposition: "available",
      state: { outcome: "partial_scorecard", signal },
    });
    vi.mocked(deps.repository.writeOwned).mockResolvedValue({
      disposition: "unchanged",
      state: { outcome: "partial_scorecard", signal },
    });
    const unchanged = await handleWriteFeedbackQualitySignal(
      request(JSON.stringify(command(null))),
      SESSION_ID,
      deps
    );
    expect(unchanged.status).toBe(200);
    expect(deps.trackResponse).toHaveBeenCalledTimes(1);
  });

  it("returns the authoritative owner-safe state on CAS conflict", async () => {
    vi.mocked(deps.repository.writeOwned).mockResolvedValue({
      disposition: "conflict",
      state: { outcome: "partial_scorecard", signal },
    });
    const response = await handleWriteFeedbackQualitySignal(
      request(JSON.stringify(command(null))),
      SESSION_ID,
      deps
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "feedback_quality_conflict",
      outcome: "partial_scorecard",
      signal,
    });
    expect(deps.trackResponse).not.toHaveBeenCalled();
  });

  it("keeps an applied first-party response when analytics fails", async () => {
    vi.mocked(deps.repository.writeOwned).mockResolvedValue({
      disposition: "created",
      state: { outcome: "partial_scorecard", signal },
    });
    deps.trackResponse = vi.fn(async () => {
      throw new Error("provider unavailable");
    });
    const response = await handleWriteFeedbackQualitySignal(
      request(JSON.stringify(command(null))),
      SESSION_ID,
      deps
    );
    expect(response.status).toBe(201);
  });

  it("does not emit after deletion wins between commit and delivery", async () => {
    vi.mocked(deps.repository.writeOwned).mockResolvedValue({
      disposition: "created",
      state: { outcome: "partial_scorecard", signal },
    });
    vi.mocked(deps.isDeletionPending)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const response = await handleWriteFeedbackQualitySignal(
      request(JSON.stringify(command(null))),
      SESSION_ID,
      deps
    );
    expect(response.status).toBe(201);
    expect(deps.trackResponse).not.toHaveBeenCalled();
  });
});

function dependencies(): FeedbackQualityRouteDependencies {
  return {
    authenticate: vi.fn(async () => ({ ok: true as const, userId: "owner" })),
    consumeRateLimit: vi.fn(async () => ({
      allowed: true,
      retryAfterSeconds: 0,
    })),
    isDeletionPending: vi.fn(async () => false),
    repository: {
      readOwned: vi.fn(async () => ({
        disposition: "available" as const,
        state: { outcome: "partial_scorecard" as const, signal: null },
      })),
      writeOwned: vi.fn(async () => ({
        disposition: "created" as const,
        state: { outcome: "partial_scorecard" as const, signal },
      })),
    },
    trackResponse: vi.fn(async () => undefined),
  };
}

function request(body: string, headers?: Record<string, string>) {
  return new NextRequest(
    "https://meelni.test/api/feedback/session/quality-signal",
    {
      method: "PUT",
      headers: headers ?? {
        origin: "https://meelni.test",
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
      },
      body,
    }
  );
}

function streamingRequest(stream: ReadableStream<Uint8Array>) {
  return new NextRequest(
    "https://meelni.test/api/feedback/session/quality-signal",
    {
      method: "PUT",
      headers: {
        origin: "https://meelni.test",
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
      },
      body: stream,
      duplex: "half",
    } as never
  );
}

function command(expectedRevision: number | null) {
  return {
    contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
    response: "helpful",
    reason: null,
    expectedRevision,
  };
}
