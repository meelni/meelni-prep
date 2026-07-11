import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import sitemap from "./sitemap";
import {
  metadata as privacyMetadata,
  PrivacyHoldingContent,
} from "./privacy/page";
import { metadata as termsMetadata, TermsHoldingContent } from "./terms/page";

const OPERATIONAL_INTERNALS =
  /feature flag|PostHog|Statsig|session[- ]replay|automatic[- ]capture|launch blockers?|repository behavior|provider fingerprints?|subprocessors?|foundation models?|credit-ledger/i;

function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test("Terms and Privacy drafts are explicitly unindexed and unpromoted", () => {
  for (const metadata of [privacyMetadata, termsMetadata]) {
    assert.deepEqual(metadata.robots, { index: false, follow: false });
    assert.deepEqual(metadata.alternates, { canonical: null });
    assert.equal(metadata.openGraph, null);
    assert.equal(metadata.twitter, null);
  }
});

test("Terms and Privacy drafts are absent from the sitemap", () => {
  const urls = sitemap().map(({ url }) => new URL(url).pathname);

  assert.equal(urls.includes("/terms"), false);
  assert.equal(urls.includes("/privacy"), false);
});

test("legal holding pages do not direct visitors to unavailable contact", () => {
  for (const markup of [
    renderToStaticMarkup(PrivacyHoldingContent()),
    renderToStaticMarkup(TermsHoldingContent()),
  ]) {
    assert.doesNotMatch(markup, /href="\/contact"/);
    assert.doesNotMatch(visibleText(markup), /use the contact page/i);
  }
});

test("rendered legal holding pages are concise, visibly non-effective, and not legal advice", () => {
  for (const markup of [
    renderToStaticMarkup(PrivacyHoldingContent()),
    renderToStaticMarkup(TermsHoldingContent()),
  ]) {
    const text = visibleText(markup);
    assert.match(text, /not effective/i);
    assert.match(text, /not legal advice/i);
    assert.match(text, /under review|review in progress/i);
    assert.doesNotMatch(text, OPERATIONAL_INTERNALS);
    assert.ok(text.split(" ").length < 250);
  }
});

test("the privacy holding page states durable asynchronous deletion precisely", () => {
  const text = visibleText(renderToStaticMarkup(PrivacyHoldingContent()));

  assert.match(text, /durable deletion request exists/i);
  assert.match(text, /cleanup runs or retries asynchronously/i);
  assert.doesNotMatch(text, /workflow was queued|queues asynchronous/i);
});
