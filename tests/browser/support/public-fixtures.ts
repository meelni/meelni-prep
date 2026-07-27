import type { Page, Route } from "@playwright/test";

import { publicQuestions } from "../harness/fixtures";

const NEXT_ORIGIN = "http://127.0.0.1:3218";
const HARNESS_ORIGIN = "http://127.0.0.1:4173";
const NEXT_PUBLIC_PATHS = new Set(["/", "/pricing", "/auth/signup"]);
const NEXT_INTERNAL_PREFETCH_PATHS = new Set([
  "/auth/signin",
  "/blog",
  "/companies",
  "/contact",
  "/dashboard/new-interview",
  "/explore",
  "/privacy",
  "/terms",
]);
const FIXTURED_COMPANY_LOGOS = new Set(
  [
    "Google",
    "Microsoft",
    "Amazon",
    "Netflix",
    "Stripe",
    "Airbnb",
    "Uber",
    "DoorDash",
    "Coinbase",
    "Atlassian",
    "Adobe",
    "Shopify",
  ].map((company) => `https://cdn.magicui.design/companies/${company}.svg`)
);

export type BrowserActivityGuard = {
  assertClean: () => void;
  unexpected: string[];
};

type BrowserActivityGuardOptions = {
  allowedConsoleErrors?: RegExp[];
};

export async function installBrowserActivityGuard(
  page: Page,
  target: "next" | "harness",
  options: BrowserActivityGuardOptions = {}
): Promise<BrowserActivityGuard> {
  const unexpected: string[] = [];
  const allowedOrigin = target === "next" ? NEXT_ORIGIN : HARNESS_ORIGIN;

  page.on("pageerror", (error) => {
    unexpected.push(`pageerror:${error.name}:${error.message}`);
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !options.allowedConsoleErrors?.some((pattern) =>
        pattern.test(message.text())
      )
    ) {
      unexpected.push(`console:${message.text()}`);
    }
  });

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const isAllowedNextRequest =
      target === "next" &&
      url.origin === allowedOrigin &&
      (NEXT_PUBLIC_PATHS.has(url.pathname) ||
        (route.request().method() === "GET" &&
          url.searchParams.has("_rsc") &&
          NEXT_INTERNAL_PREFETCH_PATHS.has(url.pathname)) ||
        (url.pathname.startsWith("/_next/") &&
          url.pathname !== "/_next/image") ||
        url.pathname === "/api/questions" ||
        url.pathname === "/api/livekit/demo-token" ||
        /\.(?:css|gif|ico|jpe?g|otf|png|svg|webp|woff2?)$/.test(url.pathname));
    const isAllowedHarnessRequest =
      target === "harness" && url.origin === allowedOrigin;

    if (isAllowedNextRequest || isAllowedHarnessRequest) {
      await route.continue();
      return;
    }

    unexpected.push(`network:${route.request().method()}:${url.href}`);
    await route.abort("blockedbyclient");
  });

  if (target === "next") {
    await page.addInitScript(() => {
      window.localStorage.setItem("cookie-consent", "declined");
    });
    await page.context().addCookies([
      {
        name: "meelni_feature_flag_meelni_reactivation_access",
        value: "on",
        url: NEXT_ORIGIN,
        sameSite: "Lax",
      },
    ]);
  }

  return {
    unexpected,
    assertClean() {
      if (unexpected.length > 0) {
        throw new Error(
          `Unexpected browser activity:\n${unexpected.join("\n")}`
        );
      }
    },
  };
}

export async function installPublicNetworkFixtures(page: Page) {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const href =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const url = new URL(href, window.location.origin);

      if (url.pathname === "/api/livekit/demo-token") {
        return new Promise<Response>(() => {
          // Keep the loading state stable while the dialog focus contract runs.
        });
      }

      return nativeFetch(input, init);
    };
  });

  const fulfillCompanyLogo = async (route: Route, imageUrl: string) => {
    const company = imageUrl.slice(imageUrl.lastIndexOf("/") + 1, -4);
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="40" viewBox="0 0 112 40" role="img" aria-label="${company}"><rect width="112" height="40" rx="8" fill="#111827"/><text x="56" y="25" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="12">${company}</text></svg>`,
    });
  };

  await page.route("**/api/analytics/consent", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        analyticsPseudonym: null,
        consent: {
          decision: "declined",
          policyVersion: 1,
          source: "legacy_decline",
          decidedAt: "2026-07-18T00:00:00.000Z",
          scope: "anonymous",
        },
        persistence: {
          browser: true,
          account: false,
          browserOnly: true,
        },
      }),
    });
  });

  await page.route(
    "https://cdn.magicui.design/companies/*.svg",
    async (route) => {
      const imageUrl = route.request().url();
      if (!FIXTURED_COMPANY_LOGOS.has(imageUrl)) {
        await route.fallback();
        return;
      }

      await fulfillCompanyLogo(route, imageUrl);
    }
  );

  await page.route("**/_next/image?**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const imageUrl = requestUrl.searchParams.get("url");

    if (!imageUrl || !FIXTURED_COMPANY_LOGOS.has(imageUrl)) {
      await route.fallback();
      return;
    }

    await fulfillCompanyLogo(route, imageUrl);
  });

  await page.route("**/api/questions?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        questions: publicQuestions,
        pagination: {
          total: publicQuestions.length,
          limit: 20,
          offset: 0,
          hasMore: false,
        },
      }),
    });
  });
}
