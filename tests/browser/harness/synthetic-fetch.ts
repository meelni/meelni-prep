import {
  analyticsInsights,
  analyticsSessions,
  comparisonAttempts,
  comparisonFor,
  publicQuestions,
  transcriptTurns,
} from "./fixtures";

const nativeFetch = window.fetch.bind(window);
let comparisonRequests = 0;
let focusedPracticeCompleted = false;
const bookmarkedQuestionIds = new Set<string>();
type SyntheticQualityOutcome =
  | "full_scorecard"
  | "partial_scorecard"
  | "coaching_review";
type SyntheticQualitySignal = {
  contractVersion: "feedback-quality-signal.v1";
  outcome: SyntheticQualityOutcome;
  response: "helpful" | "not_helpful";
  reason:
    | "not_specific_enough"
    | "evidence_did_not_match"
    | "next_step_unclear"
    | "too_much_to_use"
    | "score_explanation_unclear"
    | "score_withholding_unclear"
    | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
const qualitySignals = new Map<string, SyntheticQualitySignal>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function installSyntheticFetch() {
  focusedPracticeCompleted = false;
  qualitySignals.clear();
  window.fetch = async (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(href, window.location.origin);

    if (url.pathname === "/api/user/settings") {
      return json({
        settings: {
          displayName: "Synthetic Candidate",
          defaultInterviewType: "product_sense",
          defaultDifficulty: "medium",
          questionRecency: "current",
          emailNotifications: true,
          sessionCompletionEmail: true,
          feedbackReadyEmail: true,
          weeklyProgressReport: false,
          theme: "system",
        },
      });
    }
    if (url.pathname === "/api/billing/subscription") {
      return json({
        tier: "starter",
        status: "active",
        planName: "Monthly Practice",
        currentPeriodEnd: "2026-08-17T00:00:00.000Z",
        cancelAtPeriodEnd: false,
      });
    }
    if (url.pathname === "/api/billing/credits") {
      return json({
        availableCredits: 3,
        reservedCredits: 0,
        nextCreditExpiresAt: "2026-08-17T00:00:00.000Z",
        trialAvailable: false,
      });
    }
    if (url.pathname === "/api/insights") {
      return json(analyticsInsights);
    }
    if (url.pathname === "/api/sessions") {
      return json({ sessions: analyticsSessions });
    }
    if (url.pathname === "/api/questions") {
      return json({
        questions: publicQuestions,
        pagination: {
          total: publicQuestions.length,
          limit: 20,
          offset: 0,
          hasMore: false,
        },
      });
    }
    if (url.pathname === "/api/questions/bookmark") {
      if (!init?.method || init.method === "GET") {
        return json({ questionIds: [...bookmarkedQuestionIds] });
      }

      if (init.method === "POST") {
        const body =
          typeof init.body === "string"
            ? (JSON.parse(init.body) as { questionId?: string })
            : {};
        if (body.questionId) bookmarkedQuestionIds.add(body.questionId);
        return json({ saved: true });
      }

      if (init.method === "DELETE") {
        const questionId = url.searchParams.get("questionId");
        if (questionId) bookmarkedQuestionIds.delete(questionId);
        return json({ saved: false });
      }
    }
    if (
      url.pathname === "/api/feedback/browser-qa-session/attempts" &&
      (!init?.method || init.method === "GET")
    ) {
      return json({
        attempts: comparisonAttempts,
        roundType: "product_sense",
      });
    }
    if (url.pathname === "/api/feedback/compare" && init?.method === "POST") {
      comparisonRequests += 1;
      if (comparisonRequests === 1) {
        return json({ error: "synthetic_comparison_unavailable" }, 503);
      }
      const body =
        typeof init.body === "string"
          ? (JSON.parse(init.body) as { sessionId1?: string })
          : {};
      return json({
        comparison: comparisonFor(body.sessionId1 ?? ""),
      });
    }
    const qualityMatch = url.pathname.match(
      /^\/api\/feedback\/([^/]+)\/quality-signal$/
    );
    if (qualityMatch) {
      const sessionId = decodeURIComponent(qualityMatch[1] ?? "");
      const outcome = qualityOutcomeForSession(sessionId);
      if (!outcome) return json({ error: "not_found" }, 404);
      const current = qualitySignals.get(sessionId) ?? null;
      if (!init?.method || init.method === "GET") {
        return json({ outcome, signal: current });
      }
      if (init.method === "PUT") {
        const body =
          typeof init.body === "string"
            ? (JSON.parse(init.body) as {
                contractVersion?: string;
                response?: string;
                reason?: SyntheticQualitySignal["reason"];
                expectedRevision?: number | null;
              })
            : {};
        if (
          body.contractVersion !== "feedback-quality-signal.v1" ||
          (body.response !== "helpful" && body.response !== "not_helpful")
        ) {
          return json({ error: "invalid_request" }, 400);
        }
        if (
          current &&
          current.response === body.response &&
          current.reason === body.reason
        ) {
          return json({ disposition: "unchanged", outcome, signal: current });
        }
        if (
          (current && body.expectedRevision !== current.revision) ||
          (!current && body.expectedRevision !== null)
        ) {
          return json(
            { error: "feedback_quality_conflict", outcome, signal: current },
            409
          );
        }
        const saved: SyntheticQualitySignal = {
          contractVersion: "feedback-quality-signal.v1",
          outcome,
          response: body.response,
          reason: body.reason ?? null,
          revision: current ? current.revision + 1 : 1,
          createdAt: current?.createdAt ?? "2026-08-13T12:00:00.000Z",
          updatedAt: current
            ? "2026-08-13T12:01:00.000Z"
            : "2026-08-13T12:00:00.000Z",
        };
        qualitySignals.set(sessionId, saved);
        return json(
          {
            disposition: current ? "updated" : "created",
            outcome,
            signal: saved,
          },
          current ? 200 : 201
        );
      }
    }
    if (url.pathname.endsWith("/transcript")) {
      return json({
        scope: "frozen",
        turns: transcriptTurns.map((turn, index) => ({
          id: `650e8400-e29b-41d4-a716-44665544000${index + 1}`,
          eventId: turn.eventId,
          speaker: turn.speaker,
          text: turn.text,
          startedAt: turn.timestamp.toISOString(),
        })),
      });
    }
    if (url.pathname === "/api/user/export") {
      return json({ status: "queued" }, 202);
    }
    if (
      url.pathname === "/api/focused-practice/attempts/start" &&
      init?.method === "POST"
    ) {
      if (
        new URLSearchParams(window.location.search).get("scenario") ===
        "feedback-focused-practice-unavailable"
      ) {
        return json({ error: "focused_practice_unavailable" }, 409);
      }
      return json(
        {
          disposition: focusedPracticeCompleted
            ? "already_completed"
            : "created",
          attempt: focusedPracticeAttempt(
            focusedPracticeCompleted ? "completed" : "in_progress"
          ),
        },
        focusedPracticeCompleted ? 200 : 201
      );
    }
    if (
      url.pathname ===
        "/api/focused-practice/attempts/synthetic-focused-practice-attempt/complete" &&
      init?.method === "POST"
    ) {
      focusedPracticeCompleted = true;
      return json({
        disposition: "completed",
        attempt: focusedPracticeAttempt("completed"),
      });
    }

    if (url.pathname.startsWith("/api/")) {
      throw new Error(
        `Browser QA fixture has no synthetic response for ${init?.method ?? "GET"} ${url.pathname}`
      );
    }
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return nativeFetch(input, init);
    }
    throw new Error(
      `Browser QA fixture blocked external request to ${url.origin}`
    );
  };
}

function qualityOutcomeForSession(
  sessionId: string
): SyntheticQualityOutcome | null {
  if (sessionId === "browser-qa-full") return "full_scorecard";
  if (sessionId === "browser-qa-partial") return "partial_scorecard";
  if (sessionId === "browser-qa-coaching") return "coaching_review";
  return null;
}

function focusedPracticeAttempt(state: "in_progress" | "completed") {
  const base = {
    attemptId: "synthetic-focused-practice-attempt",
    sourceSessionId: "browser-qa-session",
    contractVersion: "focused-practice-attempt.v2",
    plan: {
      state: "available",
      contractVersion: "focused-practice-plan.v2",
      durationMinutes: 5,
      title: "Deepen the user insight",
      objective:
        "Connect a specific user behavior or unmet need to the product decision it changes.",
      instructions: [
        "Use only the grounded focus and exact interview evidence selected by Meelni; do not fill in missing context.",
        "Revise the part that connects the chosen user and problem to a clear product decision.",
      ],
      successCriterion:
        "The revision names one specific user insight, explains why it matters, and shows how it changes the product choice.",
      selfReviewPrompt:
        "Does the user insight change the product decision rather than merely describe the audience?",
      source: {
        questionId: "browser-qa-question",
        questionText:
          "How would you help working parents coordinate a changing schedule?",
        roundType: "product_sense",
        focusDimension: "insight",
      },
    },
    startedAt: "2026-08-13T12:00:00.000Z",
  } as const;
  return state === "in_progress"
    ? {
        ...base,
        state,
        lifecycleVersion: 0,
        completedAt: null,
        completion: null,
      }
    : {
        ...base,
        state,
        lifecycleVersion: 1,
        completedAt: "2026-08-13T12:05:00.000Z",
        completion: {
          contractVersion: "focused-practice-completion.v1",
          practicedAloud: true,
          selfReview: {
            version: "focused-practice-self-review.v1",
            kind: "self_review",
            focusDimension: "insight",
            sourceObservation:
              "The recorded answer showed grounded evidence of Specific user need.",
            sourceNextStep:
              "In focused practice, make Specific user need explicit and connect it to the next PM decision.",
            successCriterion: base.plan.successCriterion,
            prompt: base.plan.selfReviewPrompt,
            response: {
              kind: "revised_answer",
              text: "I would connect the changing schedule need directly to the coordination decision.",
            },
          },
        },
      };
}
