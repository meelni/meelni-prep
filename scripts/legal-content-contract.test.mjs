import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const terms = readFileSync("app/terms/page.tsx", "utf8");
const privacy = readFileSync("app/privacy/page.tsx", "utf8");
const activeDrafts = `${terms}\n${privacy}`;
const legalContent = readFileSync("lib/legal/public-legal-content.ts", "utf8");
const contract = readFileSync("docs/contracts/public-legal-draft.md", "utf8");

const RETIRED_UNSUPPORTED_CLAIMS =
  /unlimited AI mock interviews|100\+ interviews|audio recordings|improve our AI models|regular security audits|within 30 days|request human review|GDPR-compliant|all employees in the same position/gi;
const PUBLIC_OPERATIONAL_INTERNALS =
  /feature flag|PostHog|Statsig|session[- ]replay|automatic[- ]capture|launch blockers?|repository behavior|provider fingerprints?|subprocessors?|foundation models?|credit-ledger/i;

test("active legal drafts exclude retired billing, recording, retention, and compliance claims", () => {
  assert.doesNotMatch(activeDrafts, RETIRED_UNSUPPORTED_CLAIMS);
  assert.doesNotMatch(activeDrafts, /\b(?:gym|reps?|workouts?|drills?)\b/i);
});

test("both legal routes use the explicit unindexed draft metadata contract", () => {
  for (const source of [terms, privacy]) {
    assert.match(source, /createLegalDraftMetadata\(/);
    assert.match(source, /LEGAL_DRAFT_NOTICE/);
    assert.doesNotMatch(source, /createPublicMetadata\(/);
    assert.doesNotMatch(source, /Last Updated|effective date:/i);
  }
});

test("public legal routes are concise holding pages without operational internals", () => {
  assert.doesNotMatch(activeDrafts, PUBLIC_OPERATIONAL_INTERNALS);
  assert.match(legalContent, /not legal advice/i);
  assert.match(legalContent, /not effective/i);
  assert.match(privacy, /durable deletion request\s+exists/i);
  assert.match(privacy, /cleanup runs or retries asynchronously/i);
  assert.doesNotMatch(privacy, /workflow was queued|queues asynchronous/i);
});

test("terms holding page avoids catalog internals and enforceable acceptance language", () => {
  assert.doesNotMatch(terms, /getLegalBillingFacts\(\)/);
  assert.match(
    terms,
    /nothing on this page asks a visitor to\s+accept\s+terms/i
  );
  assert.doesNotMatch(terms, /By (?:accessing|using).*you (?:accept|agree)/i);
});

test("the durable contract preserves owner approval and indexing gates", () => {
  assert.match(contract, /final legal policy not approved/i);
  assert.match(contract, /noindex, nofollow/i);
  assert.match(contract, /neither route may appear in the sitemap/i);
  assert.match(contract, /accountable owner and legal approval/i);
  assert.match(contract, /tests.*cannot approve these decisions/is);
  assert.match(contract, /Internal implementation review inventory/i);
  assert.match(contract, /tracks until the browser user declines/i);
  assert.match(contract, /initial background enqueue can fail/i);
  assert.match(contract, /must not\s+be copied onto the public holding pages/i);
});

test("every public inbound legal link labels the destination as a draft", () => {
  const findings = [];
  let linksInspected = 0;

  for (const file of walkTsxFiles(["app", "components"])) {
    const source = readFileSync(file, "utf8");
    const linkPattern =
      /<(?:Link|a)\b(?=[^>]*\bhref=["']\/(privacy|terms)["'])[^>]*>([\s\S]*?)<\/(?:Link|a)>/g;

    for (const match of source.matchAll(linkPattern)) {
      linksInspected += 1;
      const route = match[1];
      const label = match[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!new RegExp(`${route} draft`, "i").test(label)) {
        findings.push(`${file}: /${route} -> ${label}`);
      }
    }
  }

  assert.ok(linksInspected > 0);
  assert.deepEqual(findings, []);
});

function walkTsxFiles(roots) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.name.endsWith(".tsx")) files.push(entryPath);
    }
  };
  for (const root of roots) visit(root);
  return files;
}
