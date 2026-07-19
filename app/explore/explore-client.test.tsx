import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { AuthProvider } from "@/app/providers/auth-provider";
import { AnalyticsConsentProvider } from "@/app/providers/analytics-consent-provider";
import { ANONYMOUS_CONSENT_SUBJECT } from "@/lib/analytics/consent-contract";
import { FEATURE_GATES } from "@/lib/feature-flags/gates";
import { StatsigProvider } from "@/lib/feature-flags/statsig-provider";
import { ExploreClient } from "./explore-client";

const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

test("Explore server render exposes the initial corpus, count, and schema", () => {
  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/explore">
        <SearchParamsContext.Provider value={new URLSearchParams()}>
          <AuthProvider>
            <AnalyticsConsentProvider
              initialResolvedForSubject={ANONYMOUS_CONSENT_SUBJECT}
            >
              <StatsigProvider
                initialGateValues={{
                  [FEATURE_GATES.meelniReactivationAccess]: false,
                }}
              >
                <ExploreClient
                  initialLoadError={null}
                  initialTotal={41}
                  initialQuestions={[
                    {
                      id: "question-1",
                      company: "Example Company",
                      questionText:
                        "How would you measure success for a new PM product?",
                      questionType: "Execution",
                      askedAt: "2025-11-20T00:00:00.000Z",
                      isActive: true,
                      createdAt: null,
                    },
                  ]}
                />
              </StatsigProvider>
            </AnalyticsConsentProvider>
          </AuthProvider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );

  assert.match(html, /Browse 41 available practice questions/);
  assert.match(html, /How would you measure success for a new PM product\?/);
  assert.match(html, /Practice currently paused/);
  assert.match(html, /disabled=""/);
  assert.match(html, /"@type":"ItemList"/);
  assert.match(html, /"@type":"Dataset"/);
  assert.doesNotMatch(html, /acceptedAnswer|aggregateRating|dateModified/);
});

test("Explore server render keeps question activation available when relaunch is on", () => {
  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/explore">
        <SearchParamsContext.Provider value={new URLSearchParams()}>
          <AuthProvider>
            <AnalyticsConsentProvider
              initialResolvedForSubject={ANONYMOUS_CONSENT_SUBJECT}
            >
              <StatsigProvider
                initialGateValues={{
                  [FEATURE_GATES.meelniReactivationAccess]: true,
                }}
              >
                <ExploreClient
                  initialLoadError={null}
                  initialTotal={1}
                  initialQuestions={[
                    {
                      id: "question-1",
                      company: "Example Company",
                      questionText: "How would you improve activation?",
                      questionType: "Product Sense",
                      askedAt: null,
                      isActive: true,
                      createdAt: null,
                    },
                  ]}
                />
              </StatsigProvider>
            </AnalyticsConsentProvider>
          </AuthProvider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );

  assert.match(html, /Practice question/);
  assert.doesNotMatch(html, /Practice currently paused/);
  const questionControl = html.match(
    /<button[^>]*aria-label="Practice question: How would you improve activation\?"[^>]*>/
  );
  assert.ok(questionControl);
  assert.match(questionControl[0], /aria-busy="true"/);
});

test("Explore server failure never invents corpus facts or schema", () => {
  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/explore">
        <SearchParamsContext.Provider value={new URLSearchParams()}>
          <AuthProvider>
            <AnalyticsConsentProvider
              initialResolvedForSubject={ANONYMOUS_CONSENT_SUBJECT}
            >
              <StatsigProvider
                initialGateValues={{
                  [FEATURE_GATES.meelniReactivationAccess]: false,
                }}
              >
                <ExploreClient
                  initialLoadError="Questions are temporarily unavailable."
                  initialTotal={0}
                  initialQuestions={[]}
                />
              </StatsigProvider>
            </AnalyticsConsentProvider>
          </AuthProvider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );

  assert.match(html, /Questions are temporarily unavailable/);
  assert.doesNotMatch(html, /Browse 0 available practice questions/);
  assert.doesNotMatch(html, /"@type":"ItemList"/);
});
