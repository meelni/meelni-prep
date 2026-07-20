import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusedPracticeAttempt } from "@meelni/core";

vi.mock("@/lib/workflows/focused-practice-attempt", () => ({
  startFocusedPracticeAttemptWorkflow: vi.fn(),
  readFocusedPracticeAttemptWorkflow: vi.fn(),
  completeFocusedPracticeAttemptWorkflow: vi.fn(),
}));

import {
  completeFocusedPracticeAttemptWorkflow,
  readFocusedPracticeAttemptWorkflow,
  startFocusedPracticeAttemptWorkflow,
} from "@/lib/workflows/focused-practice-attempt";
import {
  handleCompleteFocusedPracticeAttempt,
  handleReadFocusedPracticeAttempt,
  handleStartFocusedPracticeAttempt,
  type FocusedPracticeRouteDependencies,
} from "@/lib/http/focused-practice-attempts";

const ATTEMPT = {
  attemptId: "019c0000-0000-7000-8000-000000000001",
  userId: "019c0000-0000-7000-8000-000000000002",
  sourceSessionId: "019c0000-0000-7000-8000-000000000003",
  sourceFeedbackId: "019c0000-0000-7000-8000-000000000004",
  contractVersion: "focused-practice-attempt.v1",
  lifecycleVersion: 0,
  state: "in_progress",
  feedbackVersion: {},
  plan: {},
  sourceFinding: {},
  startedAt: "2026-07-19T12:00:00.000Z",
  completedAt: null,
  completion: null,
} as unknown as FocusedPracticeAttempt;

function dependencies(
  authentication:
    | { ok: true; userId: string }
    | {
        ok: false;
        reason: "unauthorized" | "authentication_check_failed";
      } = { ok: true, userId: ATTEMPT.userId }
): FocusedPracticeRouteDependencies {
  return {
    authenticate: vi.fn().mockResolvedValue(authentication),
    resolveRelaunchAccess: vi.fn().mockResolvedValue(true),
    repository: {} as never,
    isDeletionPending: vi.fn().mockResolvedValue(false),
    now: () => new Date("2026-07-19T12:00:00.000Z"),
    createAttemptId: () => ATTEMPT.attemptId,
  };
}

function jsonRequest(body: unknown) {
  return new Request("https://meelni.test/api/focused-practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("focused-practice attempt APIs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("authenticates before any workflow and redacts authentication failures", async () => {
    const unauthorized = await handleStartFocusedPracticeAttempt(
      jsonRequest({ sourceSessionId: ATTEMPT.sourceSessionId }),
      dependencies({ ok: false, reason: "unauthorized" })
    );
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ error: "unauthorized" });
    expect(startFocusedPracticeAttemptWorkflow).not.toHaveBeenCalled();

    const failing = dependencies();
    vi.mocked(failing.authenticate).mockRejectedValue(
      new Error("postgresql://raw-secret")
    );
    const unavailable = await handleReadFocusedPracticeAttempt(
      ATTEMPT.attemptId,
      new Request("https://meelni.test/api/focused-practice"),
      failing
    );
    expect(unavailable.status).toBe(503);
    const unavailableBody = await unavailable.json();
    expect(unavailableBody).toEqual({
      error: "authentication_check_failed",
    });
    expect(JSON.stringify(unavailableBody)).not.toContain("raw-secret");
    expect(readFocusedPracticeAttemptWorkflow).not.toHaveBeenCalled();
  });

  it("fails closed at the relaunch gate before body or repository work", async () => {
    const disabled = dependencies();
    vi.mocked(disabled.resolveRelaunchAccess).mockResolvedValue(false);
    const unavailable = await handleStartFocusedPracticeAttempt(
      new Request("https://meelni.test/api/focused-practice", {
        method: "POST",
        body: "not-even-json",
      }),
      disabled
    );
    expect(unavailable.status).toBe(403);
    expect(await unavailable.json()).toEqual({
      error: "focused_practice_unavailable",
    });
    expect(startFocusedPracticeAttemptWorkflow).not.toHaveBeenCalled();

    const failing = dependencies();
    vi.mocked(failing.resolveRelaunchAccess).mockRejectedValue(
      new Error("statsig-secret-provider-detail")
    );
    const failed = await handleStartFocusedPracticeAttempt(
      jsonRequest({ sourceSessionId: ATTEMPT.sourceSessionId }),
      failing
    );
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "access_check_failed" });
    expect(startFocusedPracticeAttemptWorkflow).not.toHaveBeenCalled();
  });

  it("injects the authenticated owner and rejects extra start fields", async () => {
    vi.mocked(startFocusedPracticeAttemptWorkflow).mockResolvedValue({
      ok: true,
      disposition: "created",
      attempt: ATTEMPT,
    });
    const deps = dependencies();
    const response = await handleStartFocusedPracticeAttempt(
      jsonRequest({ sourceSessionId: ATTEMPT.sourceSessionId }),
      deps
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(startFocusedPracticeAttemptWorkflow).toHaveBeenCalledWith(
      {
        userId: ATTEMPT.userId,
        sourceSessionId: ATTEMPT.sourceSessionId,
      },
      deps
    );
    const body = await response.json();
    expect(body.attempt.userId).toBeUndefined();
    expect(body.attempt.sourceFeedbackId).toBeUndefined();

    const invalid = await handleStartFocusedPracticeAttempt(
      jsonRequest({
        sourceSessionId: ATTEMPT.sourceSessionId,
        userId: "attacker-selected-owner",
      }),
      deps
    );
    expect(invalid.status).toBe(400);
    expect(startFocusedPracticeAttemptWorkflow).toHaveBeenCalledTimes(1);
  });

  it("maps missing and cross-owner sources to the same non-enumerating response", async () => {
    vi.mocked(startFocusedPracticeAttemptWorkflow).mockResolvedValue({
      ok: false,
      reason: "not_found",
    });
    const first = await handleStartFocusedPracticeAttempt(
      jsonRequest({ sourceSessionId: "missing" }),
      dependencies()
    );
    const second = await handleStartFocusedPracticeAttempt(
      jsonRequest({ sourceSessionId: "owned-by-someone-else" }),
      dependencies()
    );
    expect(first.status).toBe(404);
    expect(second.status).toBe(404);
    expect(await first.json()).toEqual(await second.json());
  });

  it("keeps read and completion responses private and non-enumerating", async () => {
    vi.mocked(readFocusedPracticeAttemptWorkflow)
      .mockResolvedValueOnce({ ok: false, reason: "not_found" })
      .mockResolvedValueOnce({ ok: false, reason: "not_found" });
    const missing = await handleReadFocusedPracticeAttempt(
      "missing",
      new Request("https://meelni.test/api/focused-practice"),
      dependencies()
    );
    const crossOwner = await handleReadFocusedPracticeAttempt(
      "other-owner",
      new Request("https://meelni.test/api/focused-practice"),
      dependencies()
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual(await crossOwner.json());
    expect(missing.headers.get("cache-control")).toContain("no-store");

    vi.mocked(completeFocusedPracticeAttemptWorkflow).mockResolvedValue({
      ok: false,
      reason: "conflict",
    });
    const conflict = await handleCompleteFocusedPracticeAttempt(
      jsonRequest({
        contractVersion: "focused-practice-completion.v1",
        practicedAloud: true,
        response: { kind: "reflection", text: "I clarified the tradeoff." },
      }),
      ATTEMPT.attemptId,
      dependencies()
    );
    expect(conflict.status).toBe(409);
    expect(conflict.headers.get("cache-control")).toContain("no-store");
  });

  it("does not import or invoke interview, LiveKit, credit, or model paths", async () => {
    const root = process.cwd();
    const files = [
      "lib/http/focused-practice-attempts.ts",
      "lib/db/focused-practice-attempts.ts",
      "app/api/focused-practice/attempts/start/route.ts",
      "app/api/focused-practice/attempts/[attemptId]/route.ts",
      "app/api/focused-practice/attempts/[attemptId]/complete/route.ts",
    ];
    const source = (
      await Promise.all(
        files.map((file) => readFile(path.join(root, file), "utf8"))
      )
    ).join("\n");
    expect(source).not.toMatch(
      /from\s+["'][^"']*(?:livekit|openai|inngest|credit|session\/start|interview\/end)[^"']*["']/i
    );
  });
});
