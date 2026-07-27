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
const bookmarkedQuestionIds = new Set<string>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function installSyntheticFetch() {
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
    if (url.pathname.endsWith("/transcript")) {
      return json({ turns: transcriptTurns });
    }
    if (url.pathname === "/api/user/export") {
      return json({ status: "queued" }, 202);
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
