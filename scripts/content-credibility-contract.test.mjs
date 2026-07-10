import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

async function source(file) {
  return readFile(path.join(ROOT, file), "utf8");
}

test("active acquisition surfaces do not hardcode the retired corpus total", async () => {
  const files = [
    "app/explore/layout.tsx",
    "app/explore/metadata.ts",
    "app/explore/page.tsx",
    "components/explore/hero.tsx",
    "components/explore/structured-data.tsx",
    "components/question-bank/empty-state.tsx",
    "components/structured-data.tsx",
  ];

  const violations = [];
  for (const file of files) {
    if (/2,?879/.test(await source(file))) violations.push(file);
  }

  assert.deepEqual(violations, []);
});

test("company pages keep volatile legacy fields outside presentation", async () => {
  const files = ["app/companies/page.tsx", "app/companies/[slug]/page.tsx"];
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
});

test("unsupported company-process articles remain unpublished", async () => {
  const text = await source("lib/blog-data.ts");
  const ids = [
    "product-sense-volunteering-meta",
    "product-sense-education-meta",
    "analytical-thinking-instagram-reels",
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
  const text = await source("app/companies/[slug]/page.tsx");

  assert.match(text, /illustrative practice questions tagged to/i);
  assert.doesNotMatch(text, /real .* interview question asked at/i);
  assert.match(
    text,
    /Confirm the current stages and timing with your\s+recruiter/
  );
  assert.doesNotMatch(text, /"@type": "FAQPage"/);
});
