import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const terms = readFileSync("app/terms/page.tsx", "utf8");
const privacy = readFileSync("app/privacy/page.tsx", "utf8");
const activeDrafts = `${terms}\n${privacy}`;
const contract = readFileSync("docs/contracts/public-legal-draft.md", "utf8");

const RETIRED_UNSUPPORTED_CLAIMS =
  /unlimited AI mock interviews|100\+ interviews|audio recordings|improve our AI models|regular security audits|within 30 days|request human review|GDPR-compliant|all employees in the same position/gi;

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

test("privacy draft keeps current audio, analytics, deletion, and training boundaries explicit", () => {
  assert.match(privacy, /not replayable audio files/i);
  assert.match(
    privacy,
    /Statsig initialization is\s+separate and does not read that choice/i
  );
  assert.match(privacy, /promises no exact erasure date/i);
  assert.match(privacy, /does not establish a separate pipeline/i);
});

test("terms draft derives billing and avoids enforceable acceptance language", () => {
  assert.match(terms, /getLegalBillingFacts\(\)/);
  assert.match(terms, /does not ask visitors to accept\s+terms/i);
  assert.doesNotMatch(terms, /By (?:accessing|using).*you (?:accept|agree)/i);
});

test("the durable contract preserves owner approval and indexing gates", () => {
  assert.match(contract, /final legal policy not approved/i);
  assert.match(contract, /noindex, nofollow/i);
  assert.match(contract, /neither route may appear in the sitemap/i);
  assert.match(contract, /accountable owner and legal approval/i);
  assert.match(contract, /tests.*cannot approve these decisions/is);
});
