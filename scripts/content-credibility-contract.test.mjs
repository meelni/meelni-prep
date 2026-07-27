import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

async function source(file) {
  return readFile(path.join(ROOT, file), "utf8");
}

test("active acquisition surfaces do not hardcode the retired corpus total", async () => {
  const files = [
    "app/explore/layout.tsx",
    "app/explore/page.tsx",
    "components/explore/hero.tsx",
    "components/explore/structured-data.tsx",
    "components/question-bank/empty-state.tsx",
  ];

  const violations = [];
  for (const file of files) {
    if (/2,?879/.test(await source(file))) violations.push(file);
  }

  assert.deepEqual(violations, []);
});

test("the active pricing footer cannot publish a stale copyright year", async () => {
  const pricing = await source("app/pricing/page.tsx");

  assert.match(pricing, /new Date\(\)\.getFullYear\(\)/);
  assert.doesNotMatch(pricing, /&copy;\s+20\d{2}/);
});

test("active Explore schema excludes invented claim properties", async () => {
  const text = await source("components/explore/structured-data.tsx");
  const forbidden = [
    "FAQPage",
    "acceptedAnswer",
    "dateModified",
    "datePublished",
    "aggregateRating",
    "DataDownload",
    "temporalCoverage",
    "spatialCoverage",
    "asked at",
  ];

  for (const claim of forbidden) {
    assert.equal(text.includes(claim), false, claim);
  }

  await assert.rejects(
    access(path.join(ROOT, "components/structured-data.tsx"))
  );
});

test("company pages keep volatile legacy fields outside presentation", async () => {
  const files = [
    "app/companies/page.tsx",
    "app/companies/[slug]/page.tsx",
    "app/companies/[slug]/company-detail-client.tsx",
  ];
  const forbidden = [
    "interviewDuration",
    "interviewRounds",
    "difficulty",
    "salaryLevels",
    "salaryNote",
    "interviewStages",
    "roleOverview",
    "interviewTips",
    "preparationSteps",
    "company.description",
  ];
  const violations = [];

  for (const file of files) {
    const text = await source(file);
    for (const field of forbidden) {
      if (text.includes(field)) violations.push(`${file}: ${field}`);
    }
  }

  assert.deepEqual(violations, []);

  const listPage = await source("app/companies/page.tsx");
  const detailPage = await source("app/companies/[slug]/page.tsx");
  const detailClient = await source(
    "app/companies/[slug]/company-detail-client.tsx"
  );

  assert.doesNotMatch(listPage, /^"use client";/);
  assert.doesNotMatch(detailClient, /lib\/data\/companies|type\s+Company\b/);
  assert.match(detailPage, /toPublicCompanyGuide\(company\)/);
  assert.match(detailPage, /CompanyDetailClient company=\{publicCompany\}/);
});

test("Explore failures cannot emit exact-zero copy or schema", async () => {
  const page = await source("app/explore/page.tsx");
  const client = await source("app/explore/explore-client.tsx");

  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(page, /loadPublicQuestionCorpus/);
  assert.match(client, /resolvePublicQuestionAvailability/);
  assert.match(client, /publicAvailability\.totalQuestions !== null/);
  assert.match(client, /Questions are temporarily unavailable/);
  assert.match(client, /setLoadState\("error"\)/);
});

test("unsupported company-process articles remain unpublished", async () => {
  const text = await source("lib/blog/posts.ts");
  const ids = [
    "product-sense-volunteering-meta",
    "product-sense-education-meta",
    "analytical-thinking-instagram-reels",
    "leadership-drive-failure-story",
    "big-tech-case-study-interviews",
  ];

  for (const id of ids) {
    const start = text.indexOf(`id: "${id}"`);
    assert.notEqual(start, -1, id);
    assert.match(text.slice(start, start + 160), /published:\s*false/, id);
  }

  assert.match(text, /post\.published !== false/);
});

test("company questions do not claim current interview provenance", async () => {
  const text = await source("app/companies/[slug]/company-detail-client.tsx");

  assert.match(text, /illustrative practice questions tagged to/i);
  assert.doesNotMatch(text, /real .* interview question asked at/i);
  assert.match(
    text,
    /Confirm the current stages and timing with your\s+recruiter/
  );
  assert.doesNotMatch(text, /"@type": "FAQPage"/);
});

test("unknown company guides are resolved by a server-owned not-found boundary", async () => {
  const page = await source("app/companies/[slug]/page.tsx");
  const client = await source("app/companies/[slug]/company-detail-client.tsx");

  assert.match(page, /import \{ notFound \} from "next\/navigation"/);
  assert.match(page, /if \(!company\) \{\s*notFound\(\);\s*\}/);
  assert.doesNotMatch(client, /useParams|Company not found/);
});
