import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const UI_ROOTS = ["app", "components"];
const ACTIVE_GUIDANCE_ROOTS = [
  ".agents/skills/meelni-product-strategy",
  ".agents/skills/meelni-design-review-orchestrator",
];
const ACTIVE_GUIDANCE_FILES = [
  "AGENTS.md",
  "DESIGN.md",
  ".claude/PRD.md",
  "openspec/config.yaml",
  "docs/operations/skills.md",
  "docs/SEO_QUICK_WINS.md",
];
const SUPERSEDED_GUIDANCE_FILES = [
  "docs/superpowers/plans/2026-07-08-realistic-pm-rep.md",
];
const CONTRACT_FILES = [
  "lib/config.tsx",
  "lib/dashboard/contracts.ts",
  "lib/dashboard/analytics-contracts.ts",
];
const LEGACY_ROUTE_ALLOWLIST = new Set(["app/dashboard/new-rep/page.tsx"]);
const LEGACY_IDENTIFIER_ALLOWLIST = new Set([
  "app/dashboard/new-rep/page.tsx",
  "lib/analytics/interview-launch-compat.ts",
  "lib/analytics/types.ts",
]);
const PROHIBITION_CONTEXT =
  /\b(?:do not|don't|avoid|instead of|without|must not|cannot|unsupported)\b/i;
const FORBIDDEN_CANONICAL_CLAIMS = [
  ["fitness positioning", /PM(?:-focused)? interview gym|live voice reps/i],
  ["legacy launch action", /\bNew Rep\b/i],
  ["legacy dashboard label", /\bPractice Home\b/i],
  [
    "unsupported readiness claim",
    /\binterview[- ]ready\b|\breadiness score\b|\bInterview Readiness Quiz\b/i,
  ],
  ["unsupported readiness percentage", /\b\d+% ready for PM interviews\b/i],
];

async function sourceFiles(directory) {
  const entries = await readdir(path.join(ROOT, directory), {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(relativePath)));
    } else if (
      /\.(?:ts|tsx)$/.test(entry.name) &&
      !/\.test\.(?:ts|tsx)$/.test(entry.name)
    ) {
      files.push(relativePath);
    }
  }

  return files;
}

async function markdownFiles(directory) {
  const entries = await readdir(path.join(ROOT, directory), {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(relativePath)));
    } else if (/\.md$/.test(entry.name)) {
      files.push(relativePath);
    }
  }

  return files;
}

function findForbiddenCanonicalClaims(source) {
  const violations = [];

  for (const [index, line] of source.split("\n").entries()) {
    for (const [label, pattern] of FORBIDDEN_CANONICAL_CLAIMS) {
      if (pattern.test(line) && !PROHIBITION_CONTEXT.test(line)) {
        violations.push({ line: index + 1, label });
      }
    }
  }

  return violations;
}

test("active product surfaces use interview-practice language", async () => {
  const files = [
    ...(await Promise.all(UI_ROOTS.map(sourceFiles))).flat(),
    ...CONTRACT_FILES,
  ];
  const violations = [];
  const forbiddenLanguage = [
    ["fitness metaphor", /\b(?:gym|rep|reps)\b/i],
    ["legacy navigation", /\bPractice Home\b/i],
    ["unsupported readiness claim", /\breadiness\b|\bInterview-ready\b/i],
  ];

  for (const file of files) {
    if (LEGACY_ROUTE_ALLOWLIST.has(file)) continue;
    const source = await readFile(path.join(ROOT, file), "utf8");

    for (const [label, pattern] of forbiddenLanguage) {
      if (pattern.test(source)) violations.push(`${file}: ${label}`);
    }
  }

  assert.deepEqual(violations, []);
});

test("the retired launcher route exists only at its compatibility boundary", async () => {
  const files = [
    ...(await Promise.all(UI_ROOTS.map(sourceFiles))).flat(),
    ...(await sourceFiles("lib")),
  ];
  const violations = [];

  for (const file of files) {
    if (LEGACY_ROUTE_ALLOWLIST.has(file)) continue;
    const source = await readFile(path.join(ROOT, file), "utf8");
    if (source.includes("/dashboard/new-rep")) violations.push(file);
  }

  assert.deepEqual(violations, []);
});

test("canonical product guidance no longer defines Meelni as a gym", async () => {
  const files = [
    ...ACTIVE_GUIDANCE_FILES,
    ...(await Promise.all(ACTIVE_GUIDANCE_ROOTS.map(markdownFiles))).flat(),
  ];
  const violations = [];

  for (const file of files) {
    const source = await readFile(path.join(ROOT, file), "utf8");

    for (const violation of findForbiddenCanonicalClaims(source)) {
      violations.push(`${file}:${violation.line}: ${violation.label}`);
    }
  }

  assert.deepEqual(violations, []);
});

test("guidance detector rejects canonical claims but permits explicit prohibitions", () => {
  assert.deepEqual(
    findForbiddenCanonicalClaims(
      [
        "Meelni is a PM interview gym.",
        "Start a New Rep.",
        "Candidates are interview-ready after three sessions.",
      ].join("\n")
    ),
    [
      { line: 1, label: "fitness positioning" },
      { line: 2, label: "legacy launch action" },
      { line: 3, label: "unsupported readiness claim" },
    ]
  );

  assert.deepEqual(
    findForbiddenCanonicalClaims(
      "Do not call Meelni a PM interview gym, use New Rep, or claim an interview readiness score."
    ),
    []
  );
});

test("superseded guidance is explicit and points to the accepted product contract", async () => {
  for (const file of SUPERSEDED_GUIDANCE_FILES) {
    const source = await readFile(path.join(ROOT, file), "utf8");

    assert.match(source, /\*\*Superseded on 2026-07-09\. Do not execute\.\*\*/);
    assert.match(source, /\.claude\/PRD\.md/);
    assert.match(
      source,
      /2026-07-09-live-pm-interview-practice-positioning\.md/
    );
  }
});

test("legacy rep identifiers remain bounded to explicit compatibility files", async () => {
  const files = [
    ...(
      await Promise.all(
        ["app", "components", "lib", "packages"].map(sourceFiles)
      )
    ).flat(),
  ];
  const violations = [];
  const legacyIdentifier = /new[-_]rep|NewRep/;

  for (const file of files) {
    if (LEGACY_IDENTIFIER_ALLOWLIST.has(file)) continue;
    const source = await readFile(path.join(ROOT, file), "utf8");

    if (legacyIdentifier.test(`${file}\n${source}`)) violations.push(file);
  }

  assert.deepEqual(violations, []);
});

test("the live hero and metadata consume the positioning contract", async () => {
  const config = await readFile(path.join(ROOT, "lib/config.tsx"), "utf8");
  const homeMetadata = await readFile(
    path.join(ROOT, "lib/seo/home-metadata.ts"),
    "utf8"
  );

  assert.match(config, /title:\s*PRODUCT_LANGUAGE\.heroPromise/);
  assert.match(config, /description:\s*PRODUCT_LANGUAGE\.oneLine/);
  assert.match(homeMetadata, /const description = PRODUCT_LANGUAGE\.oneLine/);
});

test("primary marketing launch actions enter the canonical interview flow", async () => {
  const files = [
    "components/sections/hero.tsx",
    "components/sections/header.tsx",
    "components/mobile-drawer.tsx",
    "components/sections/footer.tsx",
    "components/sections/cta.tsx",
  ];

  for (const file of files) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    assert.match(source, /href="\/dashboard\/new-interview"/, file);
  }
});
