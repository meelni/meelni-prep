import { publicQuestions, transcriptTurns } from "./fixtures";

const nativeFetch = window.fetch.bind(window);

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
