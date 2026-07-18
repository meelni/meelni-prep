import type { Page } from "@playwright/test";

export type BrowserQaSurface = {
  id:
    | "landing"
    | "explore"
    | "pricing"
    | "auth"
    | "dashboard"
    | "new-interview"
    | "interview"
    | "feedback"
    | "settings";
  href: string;
  primaryAction: (page: Page) => ReturnType<Page["getByRole"]>;
  target: "next" | "harness";
};

const harness = (scenario: string) =>
  `http://127.0.0.1:4173/?scenario=${scenario}`;

export const BROWSER_QA_SURFACES: BrowserQaSurface[] = [
  {
    id: "landing",
    href: "/",
    target: "next",
    primaryAction: (page) =>
      page
        .locator("#hero")
        .getByRole("link", { name: "Start a mock interview" }),
  },
  {
    id: "explore",
    href: harness("explore"),
    target: "harness",
    primaryAction: (page) =>
      page.getByRole("button", { name: /^Practice question:/ }).first(),
  },
  {
    id: "pricing",
    href: "/pricing",
    target: "next",
    primaryAction: (page) => page.getByRole("button", { name: "Get 1 credit" }),
  },
  {
    id: "auth",
    href: "/auth/signup",
    target: "next",
    primaryAction: (page) => page.getByRole("button", { name: "Sign Up" }),
  },
  {
    id: "dashboard",
    href: harness("dashboard"),
    target: "harness",
    primaryAction: (page) =>
      page.getByRole("link", { name: "Start mock interview" }),
  },
  {
    id: "new-interview",
    href: harness("new-interview"),
    target: "harness",
    primaryAction: (page) =>
      page.getByRole("button", { name: "Start mock interview" }),
  },
  {
    id: "interview",
    href: harness("interview"),
    target: "harness",
    primaryAction: (page) =>
      page.getByRole("button", { name: "End interview" }),
  },
  {
    id: "feedback",
    href: harness("feedback"),
    target: "harness",
    primaryAction: (page) =>
      page.getByRole("link", { name: "Back to dashboard" }),
  },
  {
    id: "settings",
    href: harness("settings"),
    target: "harness",
    primaryAction: (page) => page.getByRole("button", { name: "Save changes" }),
  },
];
