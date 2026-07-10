import assert from "node:assert/strict";
import test from "node:test";

import type { Company } from "./companies";
import { toPublicCompanyGuide } from "./public-company";

test("public company projection excludes every volatile legacy field", () => {
  const sentinel = "PRIVATE_LEGACY_CLAIM";
  const company = {
    slug: "example",
    name: "Example",
    industry: "Technology",
    questionCategories: [
      { category: "Product Sense", questions: ["Design an example product."] },
    ],
    description: sentinel,
    interviewDuration: sentinel,
    interviewRounds: 99,
    difficulty: sentinel,
    salaryLevels: [{ level: sentinel, totalComp: sentinel }],
    salaryNote: sentinel,
    interviewStages: [{ stage: sentinel, duration: sentinel, description: sentinel }],
    roleOverview: sentinel,
    interviewTips: [sentinel],
    preparationSteps: [sentinel],
  } as unknown as Company;

  const publicCompany = toPublicCompanyGuide(company);

  assert.deepEqual(Object.keys(publicCompany).sort(), [
    "industry",
    "name",
    "questionCategories",
    "slug",
  ]);
  assert.equal(JSON.stringify(publicCompany).includes(sentinel), false);
});
