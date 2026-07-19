import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AuthProvider } from "@/app/providers/auth-provider";
import { FEATURE_GATES } from "@/lib/feature-flags/gates";
import { StatsigProvider } from "@/lib/feature-flags/statsig-provider";
import {
  PublicActivationButton,
  PublicActivationInlineLink,
} from "./public-activation-action";

function renderActivation(enabled: boolean) {
  return renderToStaticMarkup(
    <AuthProvider>
      <StatsigProvider
        initialGateValues={{
          [FEATURE_GATES.meelniReactivationAccess]: enabled,
        }}
      >
        <PublicActivationButton href="/dashboard/new-interview?questionId=q-1">
          Start selected question
        </PublicActivationButton>
      </StatsigProvider>
    </AuthProvider>
  );
}

function renderInlineActivation(enabled: boolean) {
  return renderToStaticMarkup(
    <AuthProvider>
      <StatsigProvider
        initialGateValues={{
          [FEATURE_GATES.meelniReactivationAccess]: enabled,
        }}
      >
        <PublicActivationInlineLink
          href="/dashboard/new-interview"
          className="text-primary hover:text-primary/80 underline"
        >
          Start from article
        </PublicActivationInlineLink>
      </StatsigProvider>
    </AuthProvider>
  );
}

test("public activation CTA is inert and truthful while relaunch is off", () => {
  const html = renderActivation(false);

  assert.match(html, /disabled=""/);
  assert.match(html, /Practice currently paused/);
  assert.doesNotMatch(html, /<a\b/);
  assert.doesNotMatch(html, /questionId=q-1/);
});

test("public activation CTA preserves its exact destination while relaunch is on", () => {
  const html = renderActivation(true);

  assert.match(html, /href="\/dashboard\/new-interview\?questionId=q-1"/);
  assert.match(html, /Start selected question/);
  assert.doesNotMatch(html, /disabled=""/);
});

test("paused inline activation is inert and drops active link styling", () => {
  const html = renderInlineActivation(false);

  assert.match(html, /<span[^>]*aria-disabled="true"/);
  assert.match(html, /cursor-not-allowed/);
  assert.match(html, /no-underline/);
  assert.doesNotMatch(html, /<a\b/);
  assert.doesNotMatch(html, /text-primary/);
  assert.doesNotMatch(html, /hover:/);
  assert.doesNotMatch(html, />Start from article</);
});

test("available inline activation preserves its destination and active styling", () => {
  const html = renderInlineActivation(true);

  assert.match(html, /href="\/dashboard\/new-interview"/);
  assert.match(html, /text-primary/);
  assert.match(html, /underline/);
  assert.match(html, /hover:text-primary\/80/);
  assert.match(html, />Start from article</);
});
