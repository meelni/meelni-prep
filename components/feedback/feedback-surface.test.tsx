import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Button } from "@/components/ui/button";
import {
  FEEDBACK_REVIEW_THEME,
  FeedbackActionItem,
  FeedbackReviewShell,
  FeedbackStatusPage,
} from "./feedback-surface";

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16)
  );
  const linear = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

test("feedback semantic text colors meet WCAG AA against the review panel", () => {
  const panel = FEEDBACK_REVIEW_THEME["--background"];
  const textTokens = [
    "--card-foreground",
    "--destructive",
    "--foreground",
    "--info",
    "--muted-foreground",
    "--primary",
    "--success",
    "--warning",
  ] as const;

  for (const token of textTokens) {
    const value = FEEDBACK_REVIEW_THEME[token];
    assert.match(value, /^#[0-9a-f]{6}$/i);
    assert.ok(
      contrastRatio(value, panel) >= 4.5,
      `${token} must remain readable against the feedback panel`
    );
  }
});

test("feedback owns contrast-safe shared primitive color pairings", () => {
  const pairs = [
    ["--primary-foreground", "--primary", "default button"],
    ["--foreground", "--background", "outline button"],
    ["--accent-foreground", "--accent", "hovered outline button"],
    ["--secondary-foreground", "--secondary", "secondary button"],
    ["--destructive-foreground", "--destructive", "destructive button"],
    ["--foreground", "--background", "metric value"],
    ["--muted-foreground", "--background", "metric label"],
  ] as const;

  for (const [foregroundToken, backgroundToken, label] of pairs) {
    const foreground = FEEDBACK_REVIEW_THEME[foregroundToken];
    const background = FEEDBACK_REVIEW_THEME[backgroundToken];
    assert.match(foreground, /^#[0-9a-f]{6}$/i);
    assert.match(background, /^#[0-9a-f]{6}$/i);
    assert.ok(
      contrastRatio(foreground, background) >= 4.5,
      `${label} must remain readable (${foregroundToken} on ${backgroundToken})`
    );
  }
});

test("feedback shells preserve wrapping and responsive status actions", () => {
  const longText = "evidence-".repeat(80);
  const html = renderToStaticMarkup(
    <FeedbackReviewShell
      title={longText}
      description={longText}
      action={<Button type="button">Return</Button>}
    >
      <FeedbackStatusPage
        icon={<span aria-hidden="true">!</span>}
        title={longText}
        description={longText}
        actions={<Button type="button">Continue</Button>}
      >
        <ul>
          <FeedbackActionItem title={longText}>{longText}</FeedbackActionItem>
        </ul>
      </FeedbackStatusPage>
    </FeedbackReviewShell>
  );

  assert.match(html, /min-h-dvh/);
  assert.match(html, /overflow-x-hidden/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.match(html, /sm:flex-wrap/);
  assert.match(html, /--muted-foreground:#b5b5c4/);
  assert.match(html, /--background:#1c1c21/);
  assert.match(html, /--primary-foreground:#141417/);
});
