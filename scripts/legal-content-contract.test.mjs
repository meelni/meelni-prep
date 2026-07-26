import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const terms = readFileSync("app/terms/page.tsx", "utf8");
const privacy = readFileSync("app/privacy/page.tsx", "utf8");
const legalContent = readFileSync("lib/legal/public-legal-content.ts", "utf8");
const banner = readFileSync("components/cookie-consent-banner.tsx", "utf8");
const contract = readFileSync("docs/contracts/public-legal-draft.md", "utf8");

const RETIRED_UNSUPPORTED_CLAIMS =
  /unlimited AI mock interviews|100\+ interviews|audio recordings|improve our AI models|regular security audits|within 30 days|request human review|GDPR-compliant|all employees in the same position/gi;

test("public legal pages exclude retired billing, recording, retention, and compliance claims", () => {
  assert.doesNotMatch(`${terms}\n${privacy}`, RETIRED_UNSUPPORTED_CLAIMS);
  assert.doesNotMatch(
    `${terms}\n${privacy}`,
    /\b(?:gym|reps?|workouts?|drills?)\b/i
  );
});

test("Privacy is final and indexable while Terms remains an unindexed draft", () => {
  assert.match(privacy, /publicMetadata\(\"\/privacy\"/);
  assert.match(privacy, /Privacy Policy \| Meelni/);
  assert.match(privacy, /PRIVACY_POLICY_EFFECTIVE_DATE/);
  assert.doesNotMatch(privacy, /createLegalDraftMetadata|LEGAL_DRAFT_NOTICE/);

  assert.match(terms, /createLegalDraftMetadata\(/);
  assert.match(terms, /LEGAL_DRAFT_NOTICE/);
  assert.doesNotMatch(terms, /publicMetadata\(/);
});

test("the Privacy Policy preserves implemented product-data boundaries", () => {
  assert.match(privacy, /contact@meelni\.com/);
  assert.match(
    privacy,
    /does not create or store\s+a\s+replayable interview-audio recording/i
  );
  assert.match(privacy, /Stripe processes payment-card details/i);
  assert.match(
    privacy,
    /automatic\s+capture and session replay are\s+disabled/i
  );
  assert.match(
    privacy,
    /never include\s+interview audio, transcripts, question or answer text/i
  );
  assert.match(privacy, /cleanup then\s+runs\s+or\s+retries\s+asynchronously/i);
  assert.match(privacy, /We do not sell personal information/i);
  assert.match(privacy, /not directed to children under 13/i);
});

test("the short consent notice uses the approved cookie-and-analytics language", () => {
  assert.match(banner, /title="Cookie preferences"/);
  assert.match(banner, /analytics cookies and similar technologies/i);
  assert.match(banner, /Interview content is never included/i);
  assert.match(banner, /"Decline"/);
  assert.match(banner, /"Allow analytics"/);
  assert.doesNotMatch(banner, /PostHog|Statsig|privacy draft/i);
  assert.doesNotMatch(banner, /href="\/privacy"|next\/link/i);
});

test("the durable contract records Privacy approval without approving Terms", () => {
  assert.match(contract, /Privacy Policy status:\s+approved and effective/i);
  assert.match(contract, /Terms status:\s+draft/i);
  assert.match(contract, /July 26, 2026/i);
  assert.match(contract, /contact@meelni\.com/i);
  assert.match(contract, /PostHog and Statsig/i);
  assert.match(contract, /autocapture and session replay remain disabled/i);
  assert.match(contract, /cleanup runs or retries\s+asynchronously/i);
  assert.match(contract, /must remain `noindex, nofollow`/i);
});

test("public links no longer describe the Privacy Policy as a draft", () => {
  const findings = [];
  let linksInspected = 0;

  for (const file of walkTsxFiles(["app", "components"])) {
    const source = readFileSync(file, "utf8");
    const linkPattern =
      /<(?:Link|a)\b(?=[^>]*\bhref=["']\/privacy["'])[^>]*>([\s\S]*?)<\/(?:Link|a)>/g;

    for (const match of source.matchAll(linkPattern)) {
      linksInspected += 1;
      const label = match[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (/draft/i.test(label)) findings.push(`${file}: ${label}`);
    }
  }

  assert.ok(linksInspected > 0);
  assert.deepEqual(findings, []);
});

test("Terms stays a concise holding page without enforceable acceptance language", () => {
  assert.doesNotMatch(terms, /getLegalBillingFacts\(\)/);
  assert.match(
    terms,
    /nothing on this page asks a visitor to\s+accept\s+terms/i
  );
  assert.doesNotMatch(terms, /By (?:accessing|using).*you (?:accept|agree)/i);
  assert.match(legalContent, /not legal advice/i);
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
