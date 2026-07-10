import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const UI_ROOTS = ["app", "components"];
const ACTIVE_GUIDANCE_ROOTS = [".agents/skills"];
const ACTIVE_GUIDANCE_FILES = [
  "AGENTS.md",
  "DESIGN.md",
  ".claude/PRD.md",
  "openspec/config.yaml",
  "docs/operations/skills.md",
  "docs/architecture/codebase-principles.md",
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
const CUSTOMER_COPY_FILES = [
  "lib/blog-data.ts",
  "lib/data/companies.ts",
  "lib/seo/home-metadata.ts",
];
const PUBLIC_CUSTOMER_CONTENT_ROOTS = ["content", "docs/api", "public/docs"];
const LEGACY_ROUTE_FILE = "app/dashboard/new-rep/page.tsx";
const LEGACY_ANALYTICS_FILES = new Set([
  "lib/analytics/interview-launch-compat.ts",
  "lib/analytics/types.ts",
]);
const LEGACY_ANALYTICS_IDENTIFIERS = [
  "new_rep_launcher_viewed",
  "new_rep_recommendation_accepted",
  "new_rep_recommendation_changed",
  "new_rep_start_attempted",
  "new_rep_start_succeeded",
  "new_rep_start_failed",
];
const PROHIBITION_CONTEXT =
  /\b(?:do not|don't|avoid|instead of|must not|cannot|unsupported)\b/i;
const MARKDOWN_LIST_ITEM = /^\s*(?:[-+*]|\d+[.)])\s+/;
const FITNESS_LANGUAGE = /\b(?:gym|rep|reps|workout|workouts|drill|drills)\b/i;
const UNSUPPORTED_FEEDBACK_TIMING =
  /\b(?:real[- ]time|instant|immediate)\b.{0,30}\bfeedback\b|\bfeedback\b.{0,30}\b(?:real[- ]time|instant|immediate)\b/i;
const LEGACY_COMPATIBILITY_CONTEXT =
  /\b(?:legacy|compatibility|compatible|identifier|field|schema)\b/i;
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

async function customerContentFiles(directory) {
  const entries = await readdir(path.join(ROOT, directory), {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await customerContentFiles(relativePath)));
    } else if (/\.(?:md|mdx|ya?ml)$/.test(entry.name)) {
      files.push(relativePath);
    }
  }

  return files;
}

function stripExactCompatibilityIdentifiers(source) {
  return source
    .replace(/(["'])drills\1(?=\s*:)/g, '"compatibilityField"')
    .replace(/\bdrills(?=\s*:)/g, "compatibilityField")
    .replace(/\.drills\b/g, ".compatibilityField")
    .replace(/\[\s*(["'])drills\1\s*\]/g, ".compatibilityField");
}

function stripExactLegacyIdentifiers(file, source) {
  let sanitized = source;
  if (file === LEGACY_ROUTE_FILE) {
    sanitized = sanitized.replace(/\bNewRepPage\b/g, "CompatibilityPage");
  }
  if (LEGACY_ANALYTICS_FILES.has(file)) {
    for (const identifier of LEGACY_ANALYTICS_IDENTIFIERS) {
      sanitized = sanitized.replaceAll(identifier, "compatibility_event");
    }
  }
  return sanitized;
}

function findForbiddenCanonicalClaims(source) {
  const violations = [];
  const lines = source.split("\n");

  for (const [index, line] of lines.entries()) {
    for (const [label, pattern] of FORBIDDEN_CANONICAL_CLAIMS) {
      if (pattern.test(line) && !hasProhibitionContext(lines, index)) {
        violations.push({ line: index + 1, label });
      }
    }
  }

  return violations;
}

function hasProhibitionContext(lines, index) {
  if (PROHIBITION_CONTEXT.test(lines[index])) return true;
  if (!MARKDOWN_LIST_ITEM.test(lines[index])) return false;

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const previousLine = lines[cursor];
    if (!previousLine.trim()) return false;
    if (PROHIBITION_CONTEXT.test(previousLine)) return true;
    if (!MARKDOWN_LIST_ITEM.test(previousLine)) return false;
  }

  return false;
}

test("active product surfaces use interview-practice language", async () => {
  const files = [
    ...new Set([
      ...(await Promise.all(UI_ROOTS.map(sourceFiles))).flat(),
      ...CONTRACT_FILES,
      ...CUSTOMER_COPY_FILES,
      ...(
        await Promise.all(
          PUBLIC_CUSTOMER_CONTENT_ROOTS.map(customerContentFiles)
        )
      ).flat(),
    ]),
  ];
  const violations = [];
  const forbiddenLanguage = [
    ["fitness metaphor", FITNESS_LANGUAGE],
    ["legacy navigation", /\bPractice Home\b/i],
    ["unsupported readiness claim", /\breadiness\b|\bInterview-ready\b/i],
    ["unsupported feedback timing", UNSUPPORTED_FEEDBACK_TIMING],
  ];

  for (const file of files) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    const customerCopy = stripExactCompatibilityIdentifiers(source);

    for (const [label, pattern] of forbiddenLanguage) {
      if (pattern.test(customerCopy)) violations.push(`${file}: ${label}`);
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
    const source = await readFile(path.join(ROOT, file), "utf8");
    if (source.includes("/dashboard/new-rep")) violations.push(file);
  }

  assert.deepEqual(violations, []);
  const compatibilityPage = await readFile(
    path.join(ROOT, LEGACY_ROUTE_FILE),
    "utf8"
  );
  assert.match(compatibilityPage, /InterviewLaunchRedirect/);
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

test("active product guidance uses focused-practice vocabulary", async () => {
  const files = [
    ...ACTIVE_GUIDANCE_FILES,
    ...(await Promise.all(ACTIVE_GUIDANCE_ROOTS.map(markdownFiles))).flat(),
  ];
  const violations = [];

  for (const file of files) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    const lines = source.split("\n");
    for (const [index, line] of lines.entries()) {
      if (
        FITNESS_LANGUAGE.test(line) &&
        !hasProhibitionContext(lines, index) &&
        !LEGACY_COMPATIBILITY_CONTEXT.test(line)
      ) {
        violations.push(`${file}:${index + 1}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("compatibility fields are ignored without hiding customer-facing copy", () => {
  assert.doesNotMatch(
    stripExactCompatibilityIdentifiers(
      'const response = { "drills": feedback.drills };'
    ),
    FITNESS_LANGUAGE
  );
  assert.match(
    stripExactCompatibilityIdentifiers(
      'console.log("Practice drills", feedback.drills);'
    ),
    FITNESS_LANGUAGE
  );
});

test("feedback timing guard rejects real-time, instant, and immediate product claims", () => {
  assert.match(
    "Get real-time feedback after every interview.",
    UNSUPPORTED_FEEDBACK_TIMING
  );
  assert.match(
    "Instant feedback on your PM answer.",
    UNSUPPORTED_FEEDBACK_TIMING
  );
  assert.match(
    "Focused practice with immediate feedback.",
    UNSUPPORTED_FEEDBACK_TIMING
  );
  assert.doesNotMatch(
    "Review feedback after your completed interview.",
    UNSUPPORTED_FEEDBACK_TIMING
  );
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

  assert.deepEqual(
    findForbiddenCanonicalClaims(
      [
        "Do not use these legacy terms:",
        "- PM interview gym",
        "- New Rep",
        "- interview readiness score",
      ].join("\n")
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
  const legacyIdentifier = /new[-_]rep|NewRep|newRep/;

  for (const file of files) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    const sanitized = stripExactLegacyIdentifiers(file, source);

    if (legacyIdentifier.test(sanitized)) violations.push(file);
  }

  assert.deepEqual(violations, []);
  assert.deepEqual(
    files.filter((file) => file.includes("new-rep")),
    [LEGACY_ROUTE_FILE]
  );
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
