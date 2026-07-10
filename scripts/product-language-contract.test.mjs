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
  "docs/architecture/spec-workflow.md",
  "docs/seo/IMPLEMENTATION_CHECKLIST.md",
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
const GENERATED_CUSTOMER_COPY_FILES = [
  "lib/evaluation/prompts.ts",
  "lib/evaluation/drill-generator.ts",
];
const FEEDBACK_EXPERIENCE_ROOTS = ["app/feedback", "components/feedback"];
const PUBLIC_CUSTOMER_CONTENT_ROOTS = ["content", "docs/api", "public/docs"];
const PUBLIC_CUSTOMER_CONTENT_FILES = ["docs/openapi.yaml"];
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
const PROHIBITION_CUE = /\b(?:do not|don't|avoid|must not|never|cannot)\b/gi;
const PROHIBITION_BREAK = /[,.;]|\b(?:but|however|yet)\b/i;
const FITNESS_LANGUAGE = /\b(?:gym|rep|reps|workout|workouts|drill|drills)\b/i;
const UNSUPPORTED_FEEDBACK_TIMING =
  /\b(?:real[- ]time|instant|immediate)\b.{0,30}\bfeedback\b|\bfeedback\b.{0,30}\b(?:real[- ]time|instant|immediate)\b/i;
const UNSUPPORTED_QUANTIFIED_LATENCY =
  /\b(?:takes?|ready|arrives?|complete[sd]?|done)\b.{0,24}\b(?:in|within|under|less than|about|around)?\s*(?:a|an|\d+)\s*(?:seconds?|minutes?|secs?|mins?)\b|\bexpect\b.{0,30}\b(?:feedback|review|analysis)\b.{0,20}\b(?:in|within|under|less than|about|around)\s*(?:a|an|\d+)\s*(?:seconds?|minutes?|secs?|mins?)\b|\b(?:usually|typically)?\s*(?:in|within|under|less than|about|around)\s*(?:a|an|\d+)\s*(?:seconds?|minutes?|secs?|mins?)\s*(?:for|until)\s*(?:feedback|review|analysis)\b/i;
const UNSUPPORTED_OUTCOME_PROMISE =
  /\b(?:ace|crush|master)\b.{0,40}\binterviews?\b|\bland\b.{0,30}\b(?:offers?|dream role)\b|\binterviews?\b.{0,40}\b(?:ace|crush|master)\b/i;
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
    .replace(/\[\s*(["'])drills\1\s*\]/g, ".compatibilityField")
    .replace(
      /`drills`(?=[^.\n]{0,120}\b(?:API|database|provider) compatibility key\b)/gi,
      "`compatibilityField`"
    )
    .replace(/`\/dashboard\/new-rep`/g, "`/dashboard/compatibility-route`");
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

function stringLiteralContent(source) {
  const sanitized = stripExactCompatibilityIdentifiers(source);
  return [...sanitized.matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*)\1/g)]
    .map((match) => match[2])
    .join("\n");
}

function findForbiddenCanonicalClaims(source) {
  const violations = [];
  const lines = stripExactCompatibilityIdentifiers(source).split("\n");

  for (const [index, line] of lines.entries()) {
    for (const [label, pattern] of FORBIDDEN_CANONICAL_CLAIMS) {
      const matches = patternMatches(line, pattern);
      if (
        matches.some(
          (match) => !isExplicitlyProhibitedOccurrence(line, match.index)
        )
      ) {
        violations.push({ line: index + 1, label });
      }
    }
  }

  return violations;
}

function patternMatches(line, pattern) {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  return [...line.matchAll(new RegExp(pattern.source, flags))];
}

function isExplicitlyProhibitedOccurrence(line, matchIndex) {
  const prefix = line.slice(0, matchIndex);
  const cues = [...prefix.matchAll(new RegExp(PROHIBITION_CUE.source, "gi"))];
  const cue = cues.at(-1);
  if (!cue) return false;

  const clauseAfterCue = prefix.slice((cue.index ?? 0) + cue[0].length);
  return !PROHIBITION_BREAK.test(clauseAfterCue);
}

function findGuidancePatternViolations(source, pattern) {
  const lines = stripExactCompatibilityIdentifiers(source).split("\n");
  const violations = [];

  for (const [index, line] of lines.entries()) {
    const matches = patternMatches(line, pattern);
    if (
      matches.some(
        (match) => !isExplicitlyProhibitedOccurrence(line, match.index)
      )
    ) {
      violations.push(index + 1);
    }
  }

  return violations;
}

test("active product surfaces use interview-practice language", async () => {
  const files = [
    ...new Set([
      ...(await Promise.all(UI_ROOTS.map(sourceFiles))).flat(),
      ...CONTRACT_FILES,
      ...CUSTOMER_COPY_FILES,
      ...PUBLIC_CUSTOMER_CONTENT_FILES,
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
    ["unsupported outcome promise", UNSUPPORTED_OUTCOME_PROMISE],
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

test("generated feedback copy uses focused-practice language", async () => {
  const violations = [];

  for (const file of GENERATED_CUSTOMER_COPY_FILES) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    const generatedCopy = stringLiteralContent(source);

    if (findGuidancePatternViolations(generatedCopy, FITNESS_LANGUAGE).length) {
      violations.push(`${file}: fitness metaphor`);
    }
    if (UNSUPPORTED_FEEDBACK_TIMING.test(generatedCopy)) {
      violations.push(`${file}: unsupported feedback timing`);
    }
    if (UNSUPPORTED_QUANTIFIED_LATENCY.test(generatedCopy)) {
      violations.push(`${file}: unsupported quantified latency`);
    }
    if (UNSUPPORTED_OUTCOME_PROMISE.test(generatedCopy)) {
      violations.push(`${file}: unsupported outcome promise`);
    }
  }

  assert.deepEqual(violations, []);
});

test("feedback experience makes no unsupported quantified latency promise", async () => {
  const files = (
    await Promise.all(FEEDBACK_EXPERIENCE_ROOTS.map(sourceFiles))
  ).flat();
  const violations = [];

  for (const file of files) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    if (UNSUPPORTED_QUANTIFIED_LATENCY.test(stringLiteralContent(source))) {
      violations.push(file);
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
    for (const line of findGuidancePatternViolations(
      source,
      FITNESS_LANGUAGE
    )) {
      violations.push(`${file}:${line}`);
    }
    for (const line of findGuidancePatternViolations(
      source,
      UNSUPPORTED_FEEDBACK_TIMING
    )) {
      violations.push(`${file}:${line}: unsupported feedback timing`);
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
  assert.match(
    stripExactCompatibilityIdentifiers(
      "A compatible schema tells users to complete practice drills."
    ),
    FITNESS_LANGUAGE
  );
  assert.doesNotMatch(
    stripExactCompatibilityIdentifiers(
      "Preserve `drills` only where it is an existing API compatibility key."
    ),
    FITNESS_LANGUAGE
  );
});

test("guidance exceptions cannot hide prohibited copy on mixed lines", () => {
  assert.deepEqual(
    findGuidancePatternViolations(
      "This compatible schema tells users to complete practice drills.",
      FITNESS_LANGUAGE
    ),
    [1]
  );
  assert.deepEqual(
    findGuidancePatternViolations(
      "Do not call Meelni a gym, but promote practice drills to customers.",
      FITNESS_LANGUAGE
    ),
    [1]
  );
  assert.deepEqual(
    findGuidancePatternViolations(
      "Do not call Meelni a gym, marketing promotes practice drills.",
      FITNESS_LANGUAGE
    ),
    [1]
  );
  assert.deepEqual(
    findGuidancePatternViolations(
      "Do not frame Meelni as a gym or call interviews reps.",
      FITNESS_LANGUAGE
    ),
    []
  );
  assert.deepEqual(
    findGuidancePatternViolations(
      "Do not promise instant feedback, marketing promises immediate feedback.",
      UNSUPPORTED_FEEDBACK_TIMING
    ),
    [1]
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

test("feedback timing guard rejects unsupported quantified latency promises", () => {
  for (const claim of [
    "This usually takes less than a minute.",
    "Your review will be ready in 30 seconds.",
    "Expect feedback in under a minute.",
    "Your feedback arrives within 30 seconds.",
    "Usually under a minute for feedback.",
    "Your review should be done in 30 seconds.",
  ]) {
    assert.match(claim, UNSUPPORTED_QUANTIFIED_LATENCY);
  }
  assert.doesNotMatch(
    "You can leave this page and return when your review is ready.",
    UNSUPPORTED_QUANTIFIED_LATENCY
  );
});

test("public copy guard rejects unsupported interview-outcome promises", () => {
  assert.match(
    "Master your PM interviews and land your dream role.",
    UNSUPPORTED_OUTCOME_PROMISE
  );
  assert.match(
    "Ready to ace your Meta interview?",
    UNSUPPORTED_OUTCOME_PROMISE
  );
  assert.doesNotMatch(
    "Prepare for your Meta interview with realistic practice.",
    UNSUPPORTED_OUTCOME_PROMISE
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
      [
        "Do not call Meelni a PM interview gym.",
        "Do not use New Rep.",
        "Do not claim an interview readiness score.",
      ].join("\n")
    ),
    []
  );

  assert.deepEqual(
    findForbiddenCanonicalClaims(
      "Do not call Meelni a PM interview gym, but advertise a New Rep."
    ),
    [{ line: 1, label: "legacy launch action" }]
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
