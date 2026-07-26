import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { publicUrl } from "@/lib/seo/public-metadata";
import sitemap from "./sitemap";
import {
  metadata as privacyMetadata,
  PrivacyPolicyContent,
} from "./privacy/page";
import { metadata as termsMetadata, TermsHoldingContent } from "./terms/page";

function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test("the final Privacy Policy is indexable while the Terms draft stays unindexed", () => {
  assert.deepEqual(privacyMetadata.robots, { index: true, follow: true });
  assert.equal(privacyMetadata.alternates?.canonical, publicUrl("/privacy"));
  assert.ok(privacyMetadata.openGraph);
  assert.ok(privacyMetadata.twitter);

  assert.deepEqual(termsMetadata.robots, { index: false, follow: false });
  assert.deepEqual(termsMetadata.alternates, { canonical: null });
  assert.equal(termsMetadata.openGraph, null);
  assert.equal(termsMetadata.twitter, null);
});

test("the sitemap includes Privacy but continues to exclude the Terms draft", async () => {
  const urls = (await sitemap()).map(({ url }) => new URL(url).pathname);

  assert.equal(urls.includes("/privacy"), true);
  assert.equal(urls.includes("/terms"), false);
});

test("legal pages do not direct visitors to the unavailable contact form", () => {
  for (const markup of [
    renderToStaticMarkup(PrivacyPolicyContent()),
    renderToStaticMarkup(TermsHoldingContent()),
  ]) {
    assert.doesNotMatch(markup, /href="\/contact"/);
  }
});

test("the final Privacy Policy states the operative data and consent boundaries", () => {
  const text = visibleText(renderToStaticMarkup(PrivacyPolicyContent()));

  assert.match(text, /Effective July 26, 2026/i);
  assert.match(text, /contact@meelni\.com/i);
  assert.match(
    text,
    /does not create or store a replayable interview-audio recording/i
  );
  assert.match(
    text,
    /Optional product analytics are off unless you choose Allow analytics/i
  );
  assert.match(text, /automatic capture and session replay are disabled/i);
  assert.match(
    text,
    /never include interview audio, transcripts, question or answer text/i
  );
  assert.match(text, /do not sell personal information/i);
  assert.match(text, /cleanup then runs or retries asynchronously/i);
  assert.match(text, /not directed to children under 13/i);
  assert.doesNotMatch(text, /review draft|not effective|not legal advice/i);
});

test("the Terms route remains a concise, visibly non-effective holding page", () => {
  const text = visibleText(renderToStaticMarkup(TermsHoldingContent()));

  assert.match(text, /not effective/i);
  assert.match(text, /not legal advice/i);
  assert.match(text, /under review|review in progress/i);
  assert.ok(text.split(" ").length < 250);
});
