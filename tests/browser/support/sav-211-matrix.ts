import type { Locator, Page } from "@playwright/test";

export type Sav211ScenarioId =
  | "feedback-partial"
  | "feedback-insufficient"
  | "feedback-loading"
  | "feedback-pending"
  | "feedback-processing"
  | "feedback-failed"
  | "feedback-unavailable"
  | "feedback-compare"
  | "consent-undecided"
  | "consent-accepted"
  | "consent-declined";

export type Sav211BrowserScenario = {
  expectedText: string;
  id: Sav211ScenarioId;
};

export const SAV_211_BROWSER_SCENARIOS: Sav211BrowserScenario[] = [
  {
    id: "feedback-partial",
    expectedText: "Based on part of the interview",
  },
  {
    id: "feedback-insufficient",
    expectedText: "Unable to review",
  },
  { id: "feedback-loading", expectedText: "Loading feedback" },
  { id: "feedback-pending", expectedText: "Feedback queue is delayed" },
  {
    id: "feedback-processing",
    expectedText: "Feedback is taking longer",
  },
  { id: "feedback-failed", expectedText: "Feedback review failed" },
  { id: "feedback-unavailable", expectedText: "Feedback unavailable" },
  { id: "feedback-compare", expectedText: "Compare Attempts" },
  { id: "consent-undecided", expectedText: "Cookie preferences" },
  { id: "consent-accepted", expectedText: "Consent layout fixture" },
  { id: "consent-declined", expectedText: "Consent layout fixture" },
];

export function sav211ScenarioHref(id: Sav211ScenarioId) {
  return `http://127.0.0.1:4173/?scenario=${id}`;
}

export function sav211PrimaryAction(
  page: Page,
  id: Sav211ScenarioId
): Locator | null {
  switch (id) {
    case "feedback-partial":
    case "feedback-unavailable":
      return page.getByRole("link", { name: "Back to dashboard" });
    case "feedback-insufficient":
      return page.getByRole("link", { name: "Start a new mock interview" });
    case "feedback-loading":
      return null;
    case "feedback-pending":
      return page.getByRole("button", { name: "Queue feedback" });
    case "feedback-processing":
      return page.getByRole("button", { name: "Restart review" });
    case "feedback-failed":
      return page.getByRole("button", { name: "Try feedback again" });
    case "feedback-compare":
      return page.getByRole("radio").first();
    case "consent-undecided":
      return page.getByRole("button", { name: "Allow analytics" });
    case "consent-accepted":
    case "consent-declined":
      return page.getByRole("button", { name: "Continue practice" });
  }
}
