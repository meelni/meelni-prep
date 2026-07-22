import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const ROOTS = ["app", "components", "lib"];
const EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
const INVALID_TOKEN_WRAPPER =
  /(?:hsl|rgb|rgba)\(\s*var\(--[a-z0-9-]+\)\s*(?:(?:\/|,)[^)]*)?\)/g;

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function isTestSourceFile(file) {
  return (
    /(?:^|[\\/])__tests__[\\/]/.test(file) ||
    /\.(?:test|spec)\.(?:js|jsx|ts|tsx)$/.test(file)
  );
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      yield* walk(path);
      continue;
    }

    const extension = entry.name.slice(entry.name.lastIndexOf("."));
    if (EXTENSIONS.has(extension)) {
      yield path;
    }
  }
}

async function* walkAll(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      yield* walkAll(path);
      continue;
    }

    yield path;
  }
}

test("design tokens are not wrapped in legacy hsl()/rgb() color functions", async () => {
  const violations = [];

  for (const root of ROOTS) {
    for await (const file of walk(root)) {
      const content = await readFile(file, "utf8");
      const matches = content.matchAll(INVALID_TOKEN_WRAPPER);

      for (const match of matches) {
        const line = content.slice(0, match.index).split("\n").length;
        violations.push(`${file}:${line} ${match[0]}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("analytics privacy actions preserve the 44px touch-target contract", async () => {
  const banner = await readFile("components/cookie-consent-banner.tsx", "utf8");
  const settings = await readFile(
    "components/dashboard/sections/settings.tsx",
    "utf8"
  );

  for (const label of [
    "Read the privacy draft",
    "Decline",
    "Allow analytics",
  ]) {
    const labelIndex = banner.indexOf(label);
    assert.notEqual(labelIndex, -1, `missing consent banner action: ${label}`);
    assert.match(
      banner.slice(Math.max(0, labelIndex - 500), labelIndex + 100),
      /min-h-11/,
      `${label} must retain a 44px minimum target`
    );
  }

  for (const label of ["Retry account sync", "Turn off", '"Allow"']) {
    const labelIndex = settings.lastIndexOf(label);
    assert.notEqual(
      labelIndex,
      -1,
      `missing privacy settings action: ${label}`
    );
    assert.match(
      settings.slice(Math.max(0, labelIndex - 500), labelIndex + 100),
      /min-h-11/,
      `${label} must retain a 44px minimum target`
    );
  }
});

test("ui source tree does not keep tracked backup files", async () => {
  const violations = [];

  for (const root of ROOTS) {
    for await (const file of walkAll(root)) {
      if (file.endsWith(".bak")) {
        violations.push(file);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("design system front door includes agent-scale operating rules", async () => {
  const design = await readFile("DESIGN.md", "utf8");
  const maturity = await readFile(
    "docs/design/2026-07-08-agent-design-system-maturity.md",
    "utf8"
  );
  const examples = await readFile(
    "docs/design/2026-07-08-canonical-ui-patterns.md",
    "utf8"
  );
  const externalLenses = await readFile(
    "docs/design/2026-07-08-external-design-lenses.md",
    "utf8"
  );
  const externalLensSkill = await readFile(
    ".agents/skills/meelni-design-review-orchestrator/SKILL.md",
    "utf8"
  );
  const externalLensReference = await readFile(
    ".agents/skills/meelni-design-review-orchestrator/references/external-design-lenses.md",
    "utf8"
  );
  const externalLensDecision = await readFile(
    "docs/decisions/2026-07-08-external-design-lens-adoption.md",
    "utf8"
  );
  const requiredDesignSections = [
    "### Action Hierarchy",
    "### Route And Shell Decision Tree",
    "### Component Decision Tree",
    "### Required States",
    "### Agent UI Change Checklist",
    "### External Design Lenses",
    "2026-07-08-agent-design-system-maturity.md",
    "2026-07-08-canonical-ui-patterns.md",
    "2026-07-08-external-design-lenses.md",
  ];
  const requiredMaturitySections = [
    "## Current Action Audit",
    "## Action Hierarchy",
    "## Shell Decision Matrix",
    "## Component Composition Rules",
    "## State Coverage",
    "## Guardrail Strategy",
    "## Agent Checklist",
    "## External Design Lenses",
  ];
  const requiredExampleSections = [
    "## Route Shell Examples",
    "## Action Cluster Examples",
    "## State Examples",
    "## Primitive Examples",
    "## Anti-Patterns To Avoid",
    "## When To Add A New Example",
  ];
  const requiredExampleReferences = [
    "components/dashboard/layout/dashboard-page.tsx",
    "components/dashboard/sections/overview.tsx",
    "components/feedback/feedback-surface.tsx",
    "app/interview/page.tsx",
    "components/marketing/marketing-surface.tsx",
    "components/auth/auth-shell.tsx",
    "components/ui/selectable-card.tsx",
    "components/ui/segmented-control.tsx",
    "components/ui/filter-pill.tsx",
    "components/dashboard/sections/settings.tsx",
  ];
  const requiredExternalLensSections = [
    "## Source Of Truth",
    "## Lens Roles",
    "## Integration Policy",
    "## Agent Workflow",
    "## Rollout",
  ];
  const requiredExternalLensPolicyTerms = [
    "Meelni wins",
    "Impeccable",
    "ibelick/ui-skills",
    "Taste Skill",
    "advisory",
    "hooks or CI",
  ];
  const requiredExternalLensSkillTerms = [
    "Meelni route taxonomy",
    "meelni-ui-design-system",
    "Impeccable",
    "ui-skills",
    "Taste Skill",
    "External lens recommendations",
  ];
  const violations = [];

  for (const section of requiredDesignSections) {
    if (!design.includes(section)) {
      violations.push(`DESIGN.md:${section}`);
    }
  }

  for (const section of requiredMaturitySections) {
    if (!maturity.includes(section)) {
      violations.push(`maturity:${section}`);
    }
  }

  if (!maturity.includes("2026-07-08-canonical-ui-patterns.md")) {
    violations.push("maturity:canonical-ui-patterns-link");
  }

  for (const section of requiredExampleSections) {
    if (!examples.includes(section)) {
      violations.push(`examples:${section}`);
    }
  }

  for (const reference of requiredExampleReferences) {
    if (!examples.includes(reference)) {
      violations.push(`examples:${reference}`);
    }
  }

  for (const section of requiredExternalLensSections) {
    if (!externalLenses.includes(section)) {
      violations.push(`external-lenses:${section}`);
    }
  }

  for (const term of requiredExternalLensPolicyTerms) {
    if (
      !externalLenses.includes(term) ||
      !externalLensReference.includes(term)
    ) {
      violations.push(`external-lenses:${term}`);
    }
  }

  for (const term of requiredExternalLensSkillTerms) {
    if (!externalLensSkill.includes(term)) {
      violations.push(`external-lens-skill:${term}`);
    }
  }

  if (
    !externalLensDecision.includes(
      "Meelni will adopt external design ecosystems as calibrated advisory lenses"
    )
  ) {
    violations.push("decision:advisory-lenses");
  }

  assert.deepEqual(violations, []);
});

test("raw native buttons stay inside approved primitives or control groups", async () => {
  const allowedRawButtonFiles = new Set([
    "components/dashboard/dashboard-surface.tsx",
    "components/demo-modal.tsx",
    "components/ui/filter-pill.tsx",
    "components/ui/segmented-control.tsx",
    "components/ui/selectable-card.tsx",
  ]);
  const violations = [];

  for (const root of ["app", "components"]) {
    for await (const file of walk(root)) {
      if (
        !file.endsWith(".tsx") ||
        file.startsWith("app/test-") ||
        isTestSourceFile(file)
      ) {
        continue;
      }

      const content = await readFile(file, "utf8");
      const usesRawButton =
        content.includes("<button") || content.includes("motion.button");

      if (usesRawButton && !allowedRawButtonFiles.has(file)) {
        violations.push(file);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("production control guardrails classify test sources consistently", () => {
  assert.equal(isTestSourceFile("app/interview/page-lifecycle.test.tsx"), true);
  assert.equal(isTestSourceFile("components/card.spec.tsx"), true);
  assert.equal(isTestSourceFile("app/interview/__tests__/page.tsx"), true);
  assert.equal(isTestSourceFile("app\\interview\\__tests__\\page.tsx"), true);
  assert.equal(isTestSourceFile("app/interview/page.tsx"), false);
  assert.equal(isTestSourceFile("components/testimonials.tsx"), false);
});

test("production app page routes are classified in the product container audit", async () => {
  const docs = await readFile(
    "docs/design/2026-07-08-product-container-audit.md",
    "utf8"
  );
  const violations = [];

  if (!docs.includes("## Production Route Inventory")) {
    violations.push("docs:Production Route Inventory");
  }

  for await (const file of walkAll("app")) {
    if (!file.endsWith("page.tsx") || file.startsWith("app/test-")) {
      continue;
    }

    if (!docs.includes(file)) {
      violations.push(file);
    }
  }

  assert.deepEqual(violations, []);
});

test("referenced custom design utilities are declared in globals.css", async () => {
  const globals = await readFile("app/globals.css", "utf8");
  const source = [];

  for (const root of ROOTS) {
    for await (const file of walk(root)) {
      source.push(await readFile(file, "utf8"));
    }
  }

  const allSource = source.join("\n");
  const expectations = [
    {
      className: "bg-surface",
      declared: globals.includes("--color-surface:"),
    },
    {
      className: "gradient-text",
      declared: globals.includes(".gradient-text"),
    },
    {
      className: "gradient-bg",
      declared: globals.includes(".gradient-bg"),
    },
  ];

  const missing = expectations
    .filter(
      ({ className, declared }) => allSource.includes(className) && !declared
    )
    .map(({ className }) => className);

  assert.deepEqual(missing, []);
});

test("priority product surfaces use shared action primitives", async () => {
  const files = [
    "app/interview/page.tsx",
    "components/dashboard/layout/sidebar.tsx",
    "components/sections/hero.tsx",
  ];
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (content.includes("<button")) {
      violations.push(file);
    }
    if (
      file === "components/dashboard/layout/sidebar.tsx" &&
      (/[hw]-\[/.test(content) || content.includes("size={18}"))
    ) {
      violations.push(`${file}:arbitrary-icon-size`);
    }
  }

  assert.deepEqual(violations, []);
});

test("priority product surfaces use shared app-surface primitives", async () => {
  const surfaceSource = await readFile("components/ui/app-surface.tsx", "utf8");
  const requiredExports = [
    "AppSurface",
    "AppSurfaceHeader",
    "AppSurfaceTitle",
    "AppSurfaceDescription",
    "StatusPill",
  ];
  const missingExports = requiredExports.filter(
    (name) =>
      !surfaceSource.includes(` ${name}`) &&
      !surfaceSource.includes(`{ ${name}`)
  );

  const priorityFiles = [
    {
      file: "app/interview/page.tsx",
      requiredImports: ["AppSurface", "StatusPill"],
    },
    {
      file: "components/dashboard/layout/sidebar.tsx",
      requiredImports: ["AppSurface"],
    },
  ];
  const missingImports = [];

  for (const { file, requiredImports } of priorityFiles) {
    const content = await readFile(file, "utf8");
    for (const importName of requiredImports) {
      if (!content.includes(importName)) {
        missingImports.push(`${file}:${importName}`);
      }
    }
  }

  assert.deepEqual([...missingExports, ...missingImports], []);
});

test("auth pages use shared form and action primitives", async () => {
  const files = [
    "app/auth/signin/page.tsx",
    "app/auth/signup/page.tsx",
    "app/auth/forgot-password/page.tsx",
    "app/auth/reset-password/page.tsx",
  ];
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (content.includes("<button")) {
      violations.push(`${file}:button`);
    }
    if (content.includes("<input")) {
      violations.push(`${file}:input`);
    }
  }

  assert.deepEqual(violations, []);
});

test("setup selectors use the shared selectable-card primitive", async () => {
  const selectableCardSource = await readFile(
    "components/ui/selectable-card.tsx",
    "utf8"
  );
  const requiredExports = [
    "SelectableCard",
    "SelectableCardIcon",
    "SelectableCardCheck",
    "SelectableCardLockOverlay",
  ];
  const missingExports = requiredExports.filter(
    (name) =>
      !selectableCardSource.includes(` ${name}`) &&
      !selectableCardSource.includes(`{ ${name}`)
  );

  const files = [
    "app/setup/components/round-selector.tsx",
    "app/setup/components/difficulty-selector.tsx",
    "components/dashboard/setup-modal.tsx",
    "components/dashboard/setup-modal/smart-defaults-card.tsx",
  ];
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (!content.includes("SelectableCard")) {
      violations.push(`${file}:SelectableCard`);
    }
    if (content.includes("<Card")) {
      violations.push(`${file}:Card`);
    }
    if (content.includes("<svg")) {
      violations.push(`${file}:svg`);
    }
    if (content.includes("motion.button")) {
      violations.push(`${file}:motion.button`);
    }
    if (/min-h-\[(?:2|2\.5)rem\]/.test(content)) {
      violations.push(`${file}:arbitrary-description-height`);
    }
    if (
      file === "components/dashboard/setup-modal.tsx" &&
      !content.includes("@/components/ui/input")
    ) {
      violations.push(`${file}:Input`);
    }
    if (
      file === "components/dashboard/setup-modal.tsx" &&
      !content.includes('from "@/components/ui/select"')
    ) {
      violations.push(`${file}:Select`);
    }
    if (
      file === "components/dashboard/setup-modal.tsx" &&
      content.includes("<input")
    ) {
      violations.push(`${file}:input`);
    }
    if (
      file === "components/dashboard/setup-modal.tsx" &&
      content.includes("<select")
    ) {
      violations.push(`${file}:select`);
    }
  }

  assert.deepEqual([...missingExports, ...violations], []);
});

test("interview launch CTAs use the canonical dashboard launch route", async () => {
  const legacySetupCta =
    /(?:href=["']\/setup(?:[?#"'])|router\.push\((?:["'`]\/setup)|window\.location\.href\s*=\s*["']\/setup|\]\(\/setup(?:[?#)]))/;
  const allowedFiles = new Set(["app/setup/page.tsx"]);
  const violations = [];

  for (const root of ["app", "components", "lib"]) {
    for await (const file of walk(root)) {
      if (
        (!file.endsWith(".tsx") && !file.endsWith(".ts")) ||
        file.startsWith("app/test-")
      ) {
        continue;
      }
      if (allowedFiles.has(file)) {
        continue;
      }

      const content = await readFile(file, "utf8");
      if (legacySetupCta.test(content)) {
        violations.push(file);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("authenticated product routes follow the product container taxonomy", async () => {
  const docs = await readFile(
    "docs/design/2026-07-08-product-container-audit.md",
    "utf8"
  );
  const setupPage = await readFile("app/setup/page.tsx", "utf8");
  const newRepPage = await readFile("app/dashboard/new-rep/page.tsx", "utf8");
  const newInterviewPage = await readFile(
    "app/dashboard/new-interview/page.tsx",
    "utf8"
  );
  const interviewPage = await readFile("app/interview/page.tsx", "utf8");
  const interviewRoomSurface = await readFile(
    "app/interview/components/interview-room-surface.tsx",
    "utf8"
  );
  const feedbackResultPage = await readFile(
    "app/feedback/[sessionId]/page.tsx",
    "utf8"
  );
  const feedbackComparePage = await readFile(
    "app/feedback/[sessionId]/compare/page.tsx",
    "utf8"
  );
  const feedbackComparisonReview = await readFile(
    "components/feedback/feedback-comparison-review.tsx",
    "utf8"
  );
  const feedbackReview = await readFile(
    "components/feedback/feedback-review.tsx",
    "utf8"
  );
  const dashboardSections = [
    "components/dashboard/sections/overview.tsx",
    "components/dashboard/sections/history.tsx",
    "components/dashboard/sections/questions.tsx",
    "components/dashboard/sections/analytics.tsx",
    "components/dashboard/sections/settings.tsx",
  ];
  const violations = [];

  for (const heading of [
    "Dashboard Workspace",
    "Feedback Review Workspace",
    "Focused Interview Room",
    "Auth Flow",
    "Compatibility Redirects",
    "Public And Content Pages",
    "Production Route Inventory",
  ]) {
    if (!docs.includes(heading)) {
      violations.push(`docs:${heading}`);
    }
  }

  if (
    !setupPage.includes("permanentRedirect(") ||
    !setupPage.includes("buildNewInterviewHrefFromPageSearchParams")
  ) {
    violations.push("app/setup/page.tsx:http-interview-launch-redirect");
  }
  if (setupPage.includes("SetupContent")) {
    violations.push("app/setup/page.tsx:standalone-setup-content");
  }
  if (
    !newRepPage.includes("permanentRedirect(") ||
    !newRepPage.includes("buildNewInterviewHrefFromPageSearchParams")
  ) {
    violations.push(
      "app/dashboard/new-rep/page.tsx:http-interview-launch-redirect"
    );
  }
  if (!newInterviewPage.includes("SetupContent")) {
    violations.push("app/dashboard/new-interview/page.tsx:SetupContent");
  }
  if (await fileExists("app/setup/interview-launch-redirect.tsx")) {
    violations.push("app/setup/interview-launch-redirect.tsx:client-fallback");
  }
  for (const file of dashboardSections) {
    const content = await readFile(file, "utf8");
    if (!content.includes("DashboardPage")) {
      violations.push(`${file}:DashboardPage`);
    }
  }

  if (!feedbackResultPage.includes("FeedbackReview")) {
    violations.push("app/feedback/[sessionId]/page.tsx:FeedbackReview");
  }
  if (!feedbackComparePage.includes("FeedbackComparisonReview")) {
    violations.push(
      "app/feedback/[sessionId]/compare/page.tsx:FeedbackComparisonReview"
    );
  }
  if (!feedbackComparisonReview.includes("FeedbackReviewShell")) {
    violations.push(
      "components/feedback/feedback-comparison-review.tsx:FeedbackReviewShell"
    );
  }
  if (!feedbackReview.includes("FeedbackStatusPage")) {
    violations.push(
      "components/feedback/feedback-review.tsx:FeedbackStatusPage"
    );
  }

  for (const banned of ["DashboardLayout", "DashboardPage"]) {
    if (interviewPage.includes(banned)) {
      violations.push(`app/interview/page.tsx:${banned}`);
    }
  }
  for (const required of [
    "LiveKitRoomWrapper",
    "InterviewRoomContent",
    "InterviewRoomSurface",
    "StatusPill",
  ]) {
    if (!interviewPage.includes(required)) {
      violations.push(`app/interview/page.tsx:${required}`);
    }
  }
  for (const required of ["AppSurfaceHeader", "StatusPill"]) {
    if (!interviewRoomSurface.includes(required)) {
      violations.push(
        `app/interview/components/interview-room-surface.tsx:${required}`
      );
    }
  }

  assert.deepEqual(violations, []);
});

test("setup difficulty selector uses one neutral selection tone", async () => {
  const file = "app/setup/components/difficulty-selector.tsx";
  const content = await readFile(file, "utf8");
  const rawDifficultyTone =
    /\b(?:from|to|bg|text|border)-(?:emerald|green|orange|red|rose|yellow)-\d+(?:\/\d+)?\b/;
  const requiredTokens = ["bg-dashboard-panel", "text-primary"];
  const violations = requiredTokens.filter((token) => !content.includes(token));
  for (const retiredTone of [
    "bg-success",
    "text-success",
    "bg-warning",
    "text-warning",
    "bg-destructive",
    "text-destructive",
  ]) {
    if (content.includes(retiredTone)) violations.push(retiredTone);
  }

  if (rawDifficultyTone.test(content)) {
    violations.push(`${file}:raw-difficulty-tone`);
  }

  assert.deepEqual(violations, []);
});

test("primary active states use semantic foreground tokens", async () => {
  const expectations = [
    {
      file: "components/mobile-drawer.tsx",
      required: [],
      banned: ["text-white"],
    },
    {
      file: "components/dashboard/setup-modal/step-indicator.tsx",
      required: ["text-primary-foreground", "bg-primary-foreground"],
      banned: ["text-white", "bg-white"],
    },
    {
      file: "app/setup/setup-content.tsx",
      required: ["text-primary-foreground"],
      banned: ["text-white"],
    },
  ];
  const violations = [];

  for (const { file, required, banned } of expectations) {
    const content = await readFile(file, "utf8");

    for (const token of required) {
      if (!content.includes(token)) {
        violations.push(`${file}:${token}`);
      }
    }

    for (const token of banned) {
      if (content.includes(token)) {
        violations.push(`${file}:${token}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("priority overlays use the shared overlay color token", async () => {
  const globals = await readFile("app/globals.css", "utf8");
  const files = [
    {
      file: "components/ui/dialog.tsx",
      required: "bg-overlay/80",
    },
    {
      file: "components/dashboard/setup-modal.tsx",
      required: "bg-overlay/50",
    },
    {
      file: "components/dashboard/sections/billing.tsx",
      required: "bg-overlay/50",
    },
    {
      file: "components/dashboard/layout/dashboard-layout.tsx",
      required: "bg-overlay/50",
    },
    {
      file: "app/interview/components/end-session-modal.tsx",
      required: "bg-overlay/50",
    },
  ];
  const violations = [];

  if (!globals.includes("--color-overlay: var(--overlay);")) {
    violations.push("app/globals.css:--color-overlay");
  }

  if (!globals.includes("--overlay:")) {
    violations.push("app/globals.css:--overlay");
  }

  for (const { file, required } of files) {
    const content = await readFile(file, "utf8");

    if (!content.includes(required)) {
      violations.push(`${file}:${required}`);
    }

    if (content.includes("bg-black/")) {
      violations.push(`${file}:bg-black`);
    }
  }

  assert.deepEqual(violations, []);
});

test("interview control rail uses semantic surface tokens", async () => {
  const file = "app/interview/components/interview-controls.tsx";
  const content = await readFile(file, "utf8");
  const required = ["bg-card/80", "border-border"];
  const banned = ["bg-white/", "border-white/"];
  const violations = [];

  for (const token of required) {
    if (!content.includes(token)) {
      violations.push(`${file}:${token}`);
    }
  }

  for (const token of banned) {
    if (content.includes(token)) {
      violations.push(`${file}:${token}`);
    }
  }

  assert.deepEqual(violations, []);
});

test("demo modal cinematic chrome uses semantic dark-surface tokens", async () => {
  const file = "components/demo-modal.tsx";
  const content = await readFile(file, "utf8");
  const required = [
    "bg-overlay/95",
    "from-overlay",
    "via-overlay",
    "to-primary/20",
    "bg-primary-foreground/",
    "border-primary-foreground/",
    "text-primary-foreground",
  ];
  const banned = [
    "bg-black",
    "from-black",
    "via-black",
    "to-purple",
    "bg-white/",
    "border-white/",
    "text-white",
  ];
  const violations = [];

  for (const token of required) {
    if (!content.includes(token)) {
      violations.push(`${file}:${token}`);
    }
  }

  for (const token of banned) {
    if (content.includes(token)) {
      violations.push(`${file}:${token}`);
    }
  }

  assert.deepEqual(violations, []);
});

test("voice orb surfaces use shared runtime color tokens", async () => {
  const tokenSource = await readFile("lib/design-tokens.ts", "utf8").catch(
    () => ""
  );
  const files = [
    "components/ui/orb.tsx",
    "components/demo-modal.tsx",
    "app/interview/components/audio-visualizer.tsx",
    "app/interview/components/interview-stage.tsx",
  ];
  const violations = [];

  if (!tokenSource.includes("MEELNI_ORB_COLORS")) {
    violations.push("lib/design-tokens.ts:MEELNI_ORB_COLORS");
  }

  for (const file of files) {
    const content = await readFile(file, "utf8");

    if (!content.includes("MEELNI_ORB_COLORS")) {
      violations.push(`${file}:MEELNI_ORB_COLORS`);
    }

    if (
      file === "components/ui/orb.tsx" &&
      !content.includes("colors = MEELNI_ORB_COLORS")
    ) {
      violations.push(`${file}:default-orb-colors`);
    }

    if (/colors=\{\[\s*["']#[0-9A-Fa-f]{6}/.test(content)) {
      violations.push(`${file}:inline-orb-colors`);
    }

    if (
      /\[[\s\n]*["']#[0-9A-Fa-f]{6}["'][\s\n]*,[\s\n]*["']#[0-9A-Fa-f]{6}["'][\s\n]*\]/.test(
        content
      )
    ) {
      violations.push(`${file}:hex-color-pair`);
    }
  }

  assert.deepEqual(violations, []);
});

test("landing section grid uses semantic color tokens", async () => {
  const file = "components/section.tsx";
  const content = await readFile(file, "utf8");
  const violations = [];

  if (!content.includes('color="var(--muted-foreground)"')) {
    violations.push(`${file}:muted-foreground-grid-color`);
  }

  if (/color="#[0-9A-Fa-f]{6}"/.test(content)) {
    violations.push(`${file}:literal-grid-color`);
  }

  assert.deepEqual(violations, []);
});

test("auth shell uses shared third-party brand color tokens", async () => {
  const tokenSource = await readFile("lib/design-tokens.ts", "utf8");
  const file = "components/auth/auth-shell.tsx";
  const content = await readFile(file, "utf8");
  const violations = [];

  if (!tokenSource.includes("GOOGLE_LOGO_COLORS")) {
    violations.push("lib/design-tokens.ts:GOOGLE_LOGO_COLORS");
  }

  if (!content.includes("GOOGLE_LOGO_COLORS")) {
    violations.push(`${file}:GOOGLE_LOGO_COLORS`);
  }

  if (/fill="#[0-9A-Fa-f]{6}"/.test(content)) {
    violations.push(`${file}:literal-google-fill`);
  }

  assert.deepEqual(violations, []);
});

test("landing border text uses semantic foreground treatment", async () => {
  const file = "components/ui/border-number.tsx";
  const content = await readFile(file, "utf8");
  const required = [
    "before:from-foreground/",
    "before:to-muted-foreground/",
    "after:bg-muted-foreground/",
    "after:[text-shadow:0_1px_0_var(--background)]",
  ];
  const banned = ["neutral-", "white", "black", "text-["];
  const violations = [];

  for (const token of required) {
    if (!content.includes(token)) {
      violations.push(`${file}:${token}`);
    }
  }

  for (const token of banned) {
    if (content.includes(token)) {
      violations.push(`${file}:${token}`);
    }
  }

  assert.deepEqual(violations, []);
});

test("landing checkered background uses semantic color defaults", async () => {
  const componentFile = "components/ui/checkered-background.tsx";
  const heroFile = "components/sections/hero.tsx";
  const component = await readFile(componentFile, "utf8");
  const hero = await readFile(heroFile, "utf8");
  const violations = [];

  if (!component.includes('color = "var(--primary)"')) {
    violations.push(`${componentFile}:semantic-default-color`);
  }

  if (/#[0-9A-Fa-f]{6}/.test(component)) {
    violations.push(`${componentFile}:literal-color`);
  }

  if (!hero.includes('color="var(--primary)"')) {
    violations.push(`${heroFile}:semantic-checkered-color`);
  }

  assert.deepEqual(violations, []);
});

test("dot pattern uses semantic decorative color", async () => {
  const file = "components/ui/dot-pattern.tsx";
  const content = await readFile(file, "utf8");
  const violations = [];

  if (!content.includes("text-muted-foreground/80")) {
    violations.push(`${file}:muted-foreground`);
  }

  if (content.includes("text-neutral-")) {
    violations.push(`${file}:neutral-color`);
  }

  assert.deepEqual(violations, []);
});

test("tailwind indicator uses semantic dev surface tokens", async () => {
  const file = "components/tailwind-indicator.tsx";
  const content = await readFile(file, "utf8");
  const required = ["bg-popover", "text-popover-foreground", "border-border"];
  const banned = ["bg-gray-", "text-white"];
  const violations = [];

  for (const token of required) {
    if (!content.includes(token)) {
      violations.push(`${file}:${token}`);
    }
  }

  for (const token of banned) {
    if (content.includes(token)) {
      violations.push(`${file}:${token}`);
    }
  }

  assert.deepEqual(violations, []);
});

test("live waveform uses semantic canvas color fallback", async () => {
  const file = "components/ui/live-waveform.tsx";
  const content = await readFile(file, "utf8");
  const violations = [];

  if (!content.includes('getPropertyValue("--foreground")')) {
    violations.push(`${file}:foreground-token-fallback`);
  }

  if (content.includes('"#000"') || content.includes("'#000'")) {
    violations.push(`${file}:literal-black-fallback`);
  }

  assert.deepEqual(violations, []);
});

test("priority dashboard cards use shared dashboard surface primitives", async () => {
  const surfaceSource = await readFile(
    "components/dashboard/dashboard-surface.tsx",
    "utf8"
  );
  const requiredExports = [
    "DashboardMetricCard",
    "DashboardChartCard",
    "DashboardStateCard",
    "DashboardSkeletonCard",
    "DashboardSectionCard",
    "DashboardActionCard",
  ];
  const missingExports = requiredExports.filter(
    (name) =>
      !surfaceSource.includes(` ${name}`) &&
      !surfaceSource.includes(`{ ${name}`)
  );

  const expectations = [
    {
      file: "components/dashboard/stats-cards.tsx",
      requiredImport: "DashboardMetricCard",
    },
    {
      file: "components/dashboard/charts/clipped-area-chart.tsx",
      requiredImport: "DashboardChartCard",
    },
    {
      file: "components/dashboard/charts/glowing-radar-chart.tsx",
      requiredImport: "DashboardChartCard",
    },
    {
      file: "components/dashboard/charts/performance-trend.tsx",
      requiredImport: "DashboardChartCard",
    },
    {
      file: "components/dashboard/charts/competency-breakdown.tsx",
      requiredImport: "DashboardChartCard",
    },
    {
      file: "components/dashboard/charts/score-by-type.tsx",
      requiredImport: "DashboardChartCard",
    },
    {
      file: "components/dashboard/charts/time-investment.tsx",
      requiredImport: "DashboardChartCard",
    },
    {
      file: "components/dashboard/charts/type-distribution.tsx",
      requiredImport: "DashboardChartCard",
    },
    {
      file: "components/dashboard/error.tsx",
      requiredImport: "DashboardStateCard",
    },
    {
      file: "components/dashboard/loading.tsx",
      requiredImport: "DashboardSkeletonCard",
    },
    {
      file: "components/dashboard/weakest-area-card.tsx",
      requiredImport: "DashboardActionCard",
    },
    {
      file: "components/dashboard/sections/history.tsx",
      requiredImport: "DashboardSkeletonCard",
    },
    {
      file: "components/dashboard/session-list.tsx",
      requiredImport: "DashboardStateCard",
    },
    {
      file: "components/dashboard/session-list.tsx",
      requiredImport: "DashboardActionCard",
    },
    {
      file: "components/dashboard/score-chart.tsx",
      requiredImport: "DashboardChartCard",
    },
    {
      file: "components/dashboard/score-chart.tsx",
      requiredImport: "DashboardStateCard",
    },
    {
      file: "components/dashboard/competency-radar.tsx",
      requiredImport: "DashboardChartCard",
    },
    {
      file: "components/dashboard/competency-radar.tsx",
      requiredImport: "DashboardStateCard",
    },
    {
      file: "components/dashboard/sections/billing.tsx",
      requiredImport: "DashboardSectionCard",
    },
    {
      file: "components/dashboard/sections/billing.tsx",
      requiredImport: "DashboardStateCard",
    },
    {
      file: "components/dashboard/sections/billing.tsx",
      requiredImport: "DashboardSkeletonCard",
    },
    {
      file: "components/dashboard/sections/billing.tsx",
      requiredImport: "DashboardActionCard",
    },
    {
      file: "components/dashboard/sections/questions.tsx",
      requiredImport: "DashboardSkeletonCard",
    },
    {
      file: "components/dashboard/quota-exceeded-modal.tsx",
      requiredImport: "DashboardSectionCard",
    },
    {
      file: "components/dashboard/quota-exceeded-modal.tsx",
      requiredImport: "DashboardActionCard",
    },
    {
      file: "components/dashboard/tier-upgrade-modal.tsx",
      requiredImport: "DashboardSectionCard",
    },
    {
      file: "components/dashboard/tier-upgrade-modal.tsx",
      requiredImport: "DashboardActionCard",
    },
  ];
  const missingImports = [];

  for (const { file, requiredImport } of expectations) {
    const content = await readFile(file, "utf8");
    if (!content.includes(requiredImport)) {
      missingImports.push(`${file}:${requiredImport}`);
    }
    if (
      file === "components/dashboard/sections/analytics.tsx" &&
      content.includes("@/components/ui/card")
    ) {
      missingImports.push(`${file}:ui/card`);
    }
    if (
      file === "components/dashboard/sections/overview.tsx" &&
      content.includes("@/components/ui/card")
    ) {
      missingImports.push(`${file}:ui/card`);
    }
    if (
      [
        "components/dashboard/weakest-area-card.tsx",
        "components/dashboard/sections/history.tsx",
        "components/dashboard/session-list.tsx",
        "components/dashboard/score-chart.tsx",
        "components/dashboard/competency-radar.tsx",
        "components/dashboard/error.tsx",
        "components/dashboard/loading.tsx",
        "components/dashboard/sections/settings.tsx",
        "components/dashboard/sections/billing.tsx",
        "components/dashboard/sections/questions.tsx",
        "components/dashboard/quota-exceeded-modal.tsx",
        "components/dashboard/tier-upgrade-modal.tsx",
      ].includes(file) &&
      content.includes("@/components/ui/card")
    ) {
      missingImports.push(`${file}:ui/card`);
    }
    if (
      file === "components/dashboard/sections/billing.tsx" &&
      content.includes("<button")
    ) {
      missingImports.push(`${file}:button`);
    }
    if (
      file === "components/dashboard/sections/questions.tsx" &&
      content.includes("<button")
    ) {
      missingImports.push(`${file}:button`);
    }
    if (
      file === "components/dashboard/error.tsx" &&
      /bg-(?:orange|red|green|blue|purple)-500|text-(?:orange|red|green|blue|purple)-500/.test(
        content
      )
    ) {
      missingImports.push(`${file}:status-color`);
    }
  }

  const settingsSource = await readFile(
    "components/dashboard/sections/settings.tsx",
    "utf8"
  );
  if (!settingsSource.includes("DashboardPage")) {
    missingImports.push(
      "components/dashboard/sections/settings.tsx:DashboardPage"
    );
  }
  if (!settingsSource.includes("SETTINGS_CATEGORY_ORDER")) {
    missingImports.push(
      "components/dashboard/sections/settings.tsx:SETTINGS_CATEGORY_ORDER"
    );
  }

  assert.deepEqual([...missingExports, ...missingImports], []);
});

test("priority chart configs use shared chart tokens instead of literal colors", async () => {
  const files = [
    "components/dashboard/charts/glowing-radar-chart.tsx",
    "components/dashboard/charts/performance-trend.tsx",
    "components/dashboard/charts/clipped-area-chart.tsx",
    "components/dashboard/charts/score-by-type.tsx",
    "components/dashboard/charts/time-investment.tsx",
    "components/dashboard/charts/competency-breakdown.tsx",
  ];
  const violations = [];
  const literalColor = /color:\s*["']#[0-9A-Fa-f]{3,6}["']/;

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (literalColor.test(content)) {
      violations.push(file);
    }
  }

  assert.deepEqual(violations, []);
});

test("dashboard charts use named height utilities", async () => {
  const globals = await readFile("app/globals.css", "utf8");
  const files = [
    "components/dashboard/score-chart.tsx",
    "components/dashboard/competency-radar.tsx",
    "components/dashboard/charts/clipped-area-chart.tsx",
    "components/dashboard/charts/glowing-radar-chart.tsx",
    "components/dashboard/charts/performance-trend.tsx",
    "components/dashboard/charts/competency-breakdown.tsx",
    "components/dashboard/charts/score-by-type.tsx",
    "components/dashboard/charts/time-investment.tsx",
    "components/dashboard/charts/type-distribution.tsx",
  ];
  const violations = [];
  const requiredUtilities = [
    ".h-chart-sm",
    ".h-chart-md",
    ".h-chart-md-plus",
    ".h-chart-feedback",
    ".h-chart-radar",
    ".h-chart-lg",
    ".max-h-chart-radar-sm",
    ".max-h-chart-lg",
  ];

  for (const utility of requiredUtilities) {
    if (!globals.includes(utility)) {
      violations.push(`app/globals.css:${utility}`);
    }
  }

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (/\b(?:h|max-h)-\[(?:250|280|300|320|350|360|400)px\]/.test(content)) {
      violations.push(`${file}:arbitrary-chart-height`);
    }
  }

  assert.deepEqual(violations, []);
});

test("dashboard surface primitives use named size utilities", async () => {
  const globals = await readFile("app/globals.css", "utf8");
  const file = "components/dashboard/dashboard-surface.tsx";
  const content = await readFile(file, "utf8");
  const violations = [];
  const requiredUtilities = [
    ".min-h-dashboard-metric-card",
    ".min-h-dashboard-chart-card",
  ];

  for (const utility of requiredUtilities) {
    if (!globals.includes(utility)) {
      violations.push(`app/globals.css:${utility}`);
    }
  }

  if (/\b(?:h|min-h)-\[(?:140|360|460)px\]/.test(content)) {
    violations.push(`${file}:arbitrary-dashboard-surface-size`);
  }

  assert.deepEqual(violations, []);
});

test("dashboard loading states use shared loading primitive", async () => {
  const globals = await readFile("app/globals.css", "utf8");
  const surfaceSource = await readFile(
    "components/dashboard/dashboard-surface.tsx",
    "utf8"
  );
  const pageFiles = [
    "app/dashboard/page.tsx",
    "app/dashboard/analytics/page.tsx",
    "app/dashboard/history/page.tsx",
    "app/dashboard/questions/page.tsx",
    "app/dashboard/settings/page.tsx",
  ];
  const loadingFiles = [
    ...pageFiles,
    "components/dashboard/sections/billing.tsx",
    "components/dashboard/sections/overview.tsx",
    "components/dashboard/sections/questions.tsx",
  ];
  const violations = [];

  if (!globals.includes(".min-h-dashboard-loading")) {
    violations.push("app/globals.css:.min-h-dashboard-loading");
  }

  if (!surfaceSource.includes("DashboardLoadingState")) {
    violations.push(
      "components/dashboard/dashboard-surface.tsx:DashboardLoadingState"
    );
  }

  for (const file of pageFiles) {
    const content = await readFile(file, "utf8");
    if (!content.includes("DashboardLoadingState")) {
      violations.push(`${file}:DashboardLoadingState`);
    }
    if (content.includes("function SectionLoading")) {
      violations.push(`${file}:SectionLoading`);
    }
    if (content.includes('from "lucide-react"')) {
      violations.push(`${file}:local-loader-icon`);
    }
  }

  for (const file of loadingFiles) {
    const content = await readFile(file, "utf8");
    if (content.includes("min-h-[400px]")) {
      violations.push(`${file}:arbitrary-loading-height`);
    }
  }

  assert.deepEqual(violations, []);
});

test("shared chart markers use named radius scale utilities", async () => {
  const file = "components/ui/chart.tsx";
  const content = await readFile(file, "utf8");
  const violations = [];

  if (content.includes("rounded-[2px]")) {
    violations.push(`${file}:arbitrary-radius`);
  }

  if (!content.includes("rounded-sm")) {
    violations.push(`${file}:rounded-sm`);
  }

  assert.deepEqual(violations, []);
});

test("example chart components use semantic chart and surface tokens", async () => {
  const globals = await readFile("app/globals.css", "utf8");
  const files = [
    "components/charts/clipped-area-chart.tsx",
    "components/charts/default-multiple-bar-chart.tsx",
    "components/charts/glowing-bar-vertical-chart.tsx",
    "components/charts/glowing-stroke-radar-chart.tsx",
    "components/charts/gradient-bar-chart.tsx",
    "components/charts/partial-line-chart.tsx",
    "components/charts/rounded-pie-chart.tsx",
  ];
  const violations = [];

  if (!globals.includes(".max-h-chart-sm")) {
    violations.push("app/globals.css:.max-h-chart-sm");
  }

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (/color:\s*["']#[0-9A-Fa-f]{3,6}["']/.test(content)) {
      violations.push(`${file}:chart-config-literal`);
    }
    if (/\b(?:text|bg|border)-\[#[0-9A-Fa-f]{3,8}\]/.test(content)) {
      violations.push(`${file}:tailwind-literal`);
    }
    if (/\bmax-h-\[250px\]/.test(content)) {
      violations.push(`${file}:arbitrary-chart-height`);
    }
  }

  assert.deepEqual(violations, []);
});

test("dashboard helper callouts use semantic status tokens", async () => {
  const globals = await readFile("app/globals.css", "utf8");
  const missingTokens = [
    "--color-success:",
    "--color-warning:",
    "--color-info:",
    "--success:",
    "--warning:",
    "--info:",
  ].filter((token) => !globals.includes(token));

  const files = [
    "components/dashboard/stats/trend-indicator.tsx",
    "components/dashboard/weakest-area-card.tsx",
    "components/dashboard/charts/type-distribution.tsx",
    "components/dashboard/charts/clipped-area-chart.tsx",
  ];
  const rawStatusColor =
    /\b(?:bg|text|border|hover:bg|hover:border)-(?:green|orange|blue|red|purple)-500(?:\/\d+)?\b/;
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (rawStatusColor.test(content)) {
      violations.push(`${file}:raw-status-color`);
    }
  }

  assert.deepEqual([...missingTokens, ...violations], []);
});

test("shared status primitives use semantic status tokens", async () => {
  const files = ["components/ui/badge.tsx", "components/ui/app-surface.tsx"];
  const rawStatusUtility =
    /\b(?:bg|text|border|hover:bg|dark:bg|dark:text|dark:border)-(?:amber|blue|emerald|green|orange|purple|red|yellow)-\d+(?:\/\d+)?\b/;
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (rawStatusUtility.test(content)) {
      violations.push(`${file}:raw-status-utility`);
    }
  }

  assert.deepEqual(violations, []);
});

test("dashboard status badges use shared semantic status variants", async () => {
  const badgeSource = await readFile("components/ui/badge.tsx", "utf8");
  const files = [
    "components/dashboard/session-list.tsx",
    "components/dashboard/sections/billing.tsx",
    "components/dashboard/quota-exceeded-modal.tsx",
  ];
  const rawStatusUtility =
    /\b(?:bg|text|border|hover:bg|hover:text|hover:border)-(?:amber|blue|yellow)-\d+(?:\/\d+)?\b/;
  const violations = [];

  for (const variant of ["warning:", "info:"]) {
    if (!badgeSource.includes(variant)) {
      violations.push(`components/ui/badge.tsx:${variant}`);
    }
  }

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (rawStatusUtility.test(content)) {
      violations.push(`${file}:raw-status-utility`);
    }
  }

  assert.deepEqual(violations, []);
});

test("dashboard overview status indicators use semantic tokens", async () => {
  const file = "components/dashboard/sections/overview.tsx";
  const content = await readFile(file, "utf8");
  const rawStatusUtility =
    /\b(?:bg|text|border)-(?:blue|green|orange|purple)-500(?:\/\d+)?\b/;
  const requiredTokens = ["bg-primary", "text-primary"];
  const violations = requiredTokens.filter((token) => !content.includes(token));

  if (rawStatusUtility.test(content)) {
    violations.push(`${file}:raw-status-utility`);
  }

  assert.deepEqual(violations, []);
});

test("dashboard analytics comparison indicators use semantic tokens", async () => {
  const files = [
    "components/dashboard/sections/analytics.tsx",
    "components/dashboard/charts/score-by-type.tsx",
  ];
  const rawStatusUtility =
    /\b(?:bg|text|border)-(?:green|orange|red)-500(?:\/\d+)?\b/;
  const requiredTokens = ["text-success", "text-warning"];
  const violations = [];
  const source = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    source.push(content);
    if (rawStatusUtility.test(content)) {
      violations.push(`${file}:raw-status-utility`);
    }
  }

  const combinedSource = source.join("\n");
  for (const token of requiredTokens) {
    if (!combinedSource.includes(token)) {
      violations.push(token);
    }
  }

  assert.deepEqual(violations, []);
});

test("interview runtime indicators use semantic status tokens", async () => {
  const globals = await readFile("app/globals.css", "utf8");
  const files = [
    "app/interview/components/agent-state-badge.tsx",
    "app/interview/components/connection-indicator.tsx",
    "app/interview/components/end-session-modal.tsx",
    "app/interview/components/interview-controls.tsx",
  ];
  const messageFiles = [
    "app/interview/components/transcript-panel.tsx",
    "components/feedback/feedback-transcript.tsx",
  ];
  const rawStatusUtility =
    /\b(?:bg|text|border|shadow|hover:bg|hover:text|hover:border)-(?:blue|purple|green|red|amber|orange)-\d+(?:\/\d+)?\b/;
  const requiredTokens = [
    "text-info",
    "bg-info",
    "text-warning",
    "bg-warning",
    "text-success",
    "bg-success",
    "text-destructive",
    "bg-destructive",
  ];
  const violations = [];
  const source = [];

  if (!globals.includes(".max-w-message-bubble")) {
    violations.push("app/globals.css:.max-w-message-bubble");
  }

  for (const file of files) {
    const content = await readFile(file, "utf8");
    source.push(content);
    if (rawStatusUtility.test(content)) {
      violations.push(`${file}:raw-status-utility`);
    }
  }

  const combinedSource = source.join("\n");
  for (const token of requiredTokens) {
    if (!combinedSource.includes(token)) {
      violations.push(token);
    }
  }

  for (const file of messageFiles) {
    const content = await readFile(file, "utf8");
    if (!content.includes("max-w-message-bubble")) {
      violations.push(`${file}:max-w-message-bubble`);
    }
    if (content.includes("max-w-[80%]")) {
      violations.push(`${file}:arbitrary-message-width`);
    }
  }

  assert.deepEqual(violations, []);
});

test("demo modal status indicators use semantic status tokens", async () => {
  const file = "components/demo-modal.tsx";
  const content = await readFile(file, "utf8");
  const rawStatusUtility =
    /\b(?:bg|text|border|hover:bg)-(?:blue|purple|green|red)-(?:100|200|400|500)(?:\/\d+)?\b/;
  const requiredTokens = [
    "text-info",
    "bg-info",
    "border-info",
    "text-primary",
    "bg-primary",
    "border-primary",
    "text-success",
    "bg-success",
    "border-success",
    "text-destructive",
    "bg-destructive",
    "border-destructive",
  ];
  const violations = requiredTokens.filter((token) => !content.includes(token));

  if (rawStatusUtility.test(content)) {
    violations.push(`${file}:raw-status-utility`);
  }

  assert.deepEqual(violations, []);
});

test("dismiss actions use shared button primitives", async () => {
  const files = [
    "components/cookie-consent-banner.tsx",
    "components/demo-modal.tsx",
  ];
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (!content.includes("@/components/ui/button")) {
      violations.push(`${file}:Button`);
    }
    if (content.includes("<button")) {
      violations.push(`${file}:button`);
    }
  }

  assert.deepEqual(violations, []);
});

test("priority microcopy uses shared type scale utilities", async () => {
  const files = [
    "components/demo-modal.tsx",
    "components/dashboard/charts/glowing-radar-chart.tsx",
  ];
  const arbitraryMicrocopy = /\btext-\[(?:9px|10px|0\.70rem)\]\b/;
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (!content.includes("text-label")) {
      violations.push(`${file}:text-label`);
    }
    if (arbitraryMicrocopy.test(content)) {
      violations.push(`${file}:arbitrary-microcopy`);
    }
  }

  assert.deepEqual(violations, []);
});

test("landing feature selector uses shared controls and semantic status tokens", async () => {
  const file = "components/feature-selector.tsx";
  const content = await readFile(file, "utf8");
  const rawStatusUtility =
    /\b(?:bg|text|border)-(?:red|yellow|green|amber|cyan)-(?:400|500)(?:\/\d+)?\b/;
  const requiredTokens = [
    "Button",
    "text-info",
    "bg-info",
    "bg-warning",
    "bg-success",
    "bg-destructive",
  ];
  const violations = requiredTokens.filter((token) => !content.includes(token));

  if (content.includes("<button")) {
    violations.push(`${file}:button`);
  }
  if (rawStatusUtility.test(content)) {
    violations.push(`${file}:raw-status-utility`);
  }

  assert.deepEqual(violations, []);
});

test("landing feature cards use semantic product tones", async () => {
  const file = "components/sections/features.tsx";
  const content = await readFile(file, "utf8");
  const rawFeatureTone =
    /\b(?:from|to|shadow|bg)-(?:cyan|blue|purple|pink|orange|red|green|emerald|indigo)-\d+(?:\/\d+)?\b/;
  const requiredTokens = [
    "text-primary",
    "bg-primary",
    "border-border",
    "text-muted-foreground",
    "text-display-section",
  ];
  const violations = requiredTokens.filter((token) => !content.includes(token));

  if (rawFeatureTone.test(content)) {
    violations.push(`${file}:raw-feature-tone`);
  }
  if (content.includes("shadow-[")) {
    violations.push(`${file}:raw-shadow`);
  }

  assert.deepEqual(violations, []);
});

test("auth setup and settings status messages use semantic tokens", async () => {
  const files = [
    "components/auth/auth-shell.tsx",
    "app/setup/setup-content.tsx",
    "components/dashboard/sections/settings.tsx",
  ];
  const rawStatusUtility =
    /\b(?:bg|text|border)-(?:emerald|red)-(?:400|500|600|700)(?:\/\d+)?\b/;
  const requiredTokens = [
    "border-success",
    "bg-success",
    "text-success",
    "border-destructive",
    "bg-destructive",
    "text-destructive",
  ];
  const violations = [];
  const source = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    source.push(content);
    if (rawStatusUtility.test(content)) {
      violations.push(`${file}:raw-status-utility`);
    }
  }

  const combinedSource = source.join("\n");
  for (const token of requiredTokens) {
    if (!combinedSource.includes(token)) {
      violations.push(token);
    }
  }

  assert.deepEqual(violations, []);
});

test("chart trend badges use semantic badge variants", async () => {
  const files = [
    "components/charts/default-multiple-bar-chart.tsx",
    "components/charts/glowing-bar-vertical-chart.tsx",
    "components/charts/glowing-stroke-radar-chart.tsx",
    "components/charts/gradient-bar-chart.tsx",
    "components/charts/partial-line-chart.tsx",
    "components/charts/rounded-pie-chart.tsx",
  ];
  const rawTrendBadge = /\b(?:bg|text|border)-(?:green|red)-500(?:\/\d+)?\b/;
  const requiredVariants = ['variant="success"', 'variant="destructive"'];
  const violations = [];
  const source = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    source.push(content);
    if (rawTrendBadge.test(content)) {
      violations.push(`${file}:raw-trend-badge`);
    }
  }

  const combinedSource = source.join("\n");
  for (const variant of requiredVariants) {
    if (!combinedSource.includes(variant)) {
      violations.push(variant);
    }
  }

  assert.deepEqual(violations, []);
});

test("animated number demo uses shared controls and semantic tones", async () => {
  const files = ["components/ui/animated-number.tsx"];
  const rawDemoTone =
    /\b(?:bg|text|border|hover:bg|hover:text|hover:border)-(?:amber|blue|green|purple|red)-500(?:\/\d+)?\b/;
  const requiredTokens = ["Button", "text-success", "text-destructive"];
  const violations = [];
  const source = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    source.push(content);
    if (content.includes("<button")) {
      violations.push(`${file}:button`);
    }
    if (rawDemoTone.test(content)) {
      violations.push(`${file}:raw-demo-tone`);
    }
  }

  const combinedSource = source.join("\n");
  for (const token of requiredTokens) {
    if (!combinedSource.includes(token)) {
      violations.push(token);
    }
  }

  assert.deepEqual(violations, []);
});

test("question bank child components use shared controls", async () => {
  const globals = await readFile("app/globals.css", "utf8");
  const textareaSource = await readFile(
    "components/ui/textarea.tsx",
    "utf8"
  ).catch(() => "");
  const missingExports = textareaSource.includes("Textarea")
    ? []
    : ["components/ui/textarea.tsx:Textarea"];
  const files = [
    "components/question-bank/bulk-action-toolbar.tsx",
    "components/question-bank/filter-popover.tsx",
    "components/question-bank/mobile-filter-drawer.tsx",
    "components/question-bank/question-card.tsx",
    "components/question-bank/practice-sets-list.tsx",
    "components/question-bank/practice-set-dialog.tsx",
    "components/question-bank/search-autocomplete.tsx",
  ];
  const violations = [];
  const requiredUtilities = [
    ".max-h-question-filter-panel",
    ".h-question-filter-drawer",
  ];

  for (const utility of requiredUtilities) {
    if (!globals.includes(utility)) {
      violations.push(`app/globals.css:${utility}`);
    }
  }

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (content.includes("<button")) {
      violations.push(`${file}:button`);
    }
    if (!content.includes("@/components/ui/button")) {
      violations.push(`${file}:Button`);
    }
    if (/min-h-\[(?:44|48)px\]/.test(content)) {
      violations.push(`${file}:arbitrary-touch-target`);
    }
    if (
      /left-\[280px\]|max-w-\[calc\(100vw-2rem\)\]|min-h-\[140px\]/.test(
        content
      )
    ) {
      violations.push(`${file}:arbitrary-question-bank-layout`);
    }
    if (/\b(?:h|max-h)-\[60vh\]/.test(content)) {
      violations.push(`${file}:arbitrary-filter-panel-height`);
    }
  }

  const formExpectations = [
    {
      file: "components/question-bank/search-autocomplete.tsx",
      requiredImports: ["@/components/ui/input"],
      bannedPatterns: ["<input"],
    },
    {
      file: "components/question-bank/practice-set-dialog.tsx",
      requiredImports: [
        "@/components/ui/dialog",
        "@/components/ui/input",
        "@/components/ui/label",
        "@/components/ui/textarea",
      ],
      bannedPatterns: ["<input", "<textarea"],
    },
  ];

  for (const { file, requiredImports, bannedPatterns } of formExpectations) {
    const content = await readFile(file, "utf8");
    for (const requiredImport of requiredImports) {
      if (!content.includes(requiredImport)) {
        violations.push(`${file}:${requiredImport}`);
      }
    }
    for (const bannedPattern of bannedPatterns) {
      if (content.includes(bannedPattern)) {
        violations.push(`${file}:${bannedPattern}`);
      }
    }
  }

  assert.deepEqual([...missingExports, ...violations], []);
});

test("marketing index pages use shared marketing surfaces and actions", async () => {
  const surfaceSource = await readFile(
    "components/marketing/marketing-surface.tsx",
    "utf8"
  ).catch(() => "");
  const requiredExports = [
    "MarketingPage",
    "MarketingHero",
    "MarketingEyebrow",
    "MarketingCard",
    "MarketingCtaCard",
    "MarketingMetaRow",
  ];
  const missingExports = requiredExports.filter(
    (name) =>
      !surfaceSource.includes(` ${name}`) &&
      !surfaceSource.includes(`{ ${name}`)
  );

  const files = ["app/blog/page.tsx", "app/companies/page.tsx"];
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const importName of requiredExports) {
      if (!content.includes(importName)) {
        violations.push(`${file}:${importName}`);
      }
    }
    if (!content.includes("@/components/ui/button")) {
      violations.push(`${file}:Button`);
    }
    if (content.includes("<svg")) {
      violations.push(`${file}:svg`);
    }
    if (content.includes("text-[")) {
      violations.push(`${file}:arbitrary-text`);
    }
  }

  assert.deepEqual([...missingExports, ...violations], []);
});

test("pricing result pages use shared marketing state surfaces", async () => {
  const files = [
    "app/pricing/success/checkout-success-client.tsx",
    "app/pricing/canceled/page.tsx",
  ];
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const importName of ["MarketingPage", "MarketingCtaCard"]) {
      if (!content.includes(importName)) {
        violations.push(`${file}:${importName}`);
      }
    }
    if (!content.includes("@/components/ui/button")) {
      violations.push(`${file}:Button`);
    }
    if (content.includes("@/components/ui/card")) {
      violations.push(`${file}:ui/card`);
    }
    if (/\b(?:bg|text|border)-green-500/.test(content)) {
      violations.push(`${file}:raw-success-color`);
    }
  }

  assert.deepEqual(violations, []);
});

test("pricing pages use shared public-page status surfaces", async () => {
  const expectations = [
    {
      file: "app/pricing/page.tsx",
      requiredImports: [
        "MarketingPage",
        "MarketingHero",
        "MarketingCtaCard",
        "@/components/ui/button",
      ],
    },
    {
      file: "components/sections/pricing.tsx",
      requiredImports: ["@/components/ui/button", "getPublicPricingPlans"],
    },
  ];
  const rawPublicStatusColor =
    /\b(?:bg|text|border|from|via|to|hover:bg)-(?:amber|blue|green|orange|purple|gray)-(?:50|100|500|600|700|800|900)(?:\/\d+)?\b/;
  const violations = [];

  for (const { file, requiredImports } of expectations) {
    const content = await readFile(file, "utf8");
    for (const importName of requiredImports) {
      if (!content.includes(importName)) {
        violations.push(`${file}:${importName}`);
      }
    }
    if (content.includes("<button")) {
      violations.push(`${file}:button`);
    }
    if (content.includes("<svg")) {
      violations.push(`${file}:svg`);
    }
    if (rawPublicStatusColor.test(content)) {
      violations.push(`${file}:raw-public-status-color`);
    }
  }

  assert.deepEqual(violations, []);
});

test("legal pages use shared marketing article primitives", async () => {
  const files = ["app/privacy/page.tsx", "app/terms/page.tsx"];
  const requiredImports = [
    "Header",
    "MarketingPage",
    "MarketingArticleHeader",
    "MarketingEyebrow",
    "MarketingProse",
  ];
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const importName of requiredImports) {
      if (!content.includes(importName)) {
        violations.push(`${file}:${importName}`);
      }
    }
    if (content.includes("min-h-screen bg-background")) {
      violations.push(`${file}:bespoke-page-shell`);
    }
    if (content.includes("max-w-4xl mx-auto px-6 py-16")) {
      violations.push(`${file}:bespoke-content-shell`);
    }
    if (content.includes("<button")) {
      violations.push(`${file}:button`);
    }
    if (content.includes("<svg")) {
      violations.push(`${file}:svg`);
    }
    if (content.includes("text-[")) {
      violations.push(`${file}:arbitrary-text`);
    }
  }

  assert.deepEqual(violations, []);
});

test("lower landing sections use semantic status and text primitives", async () => {
  const expectations = [
    {
      file: "components/sections/use-cases.tsx",
      requiredImports: [
        "IntegrationIconBadge",
        "bg-muted",
        "text-muted-foreground",
      ],
      bannedPatterns: [
        /\b(?:bg|text|border)-(?:blue|green|neutral|purple|slate|yellow|red)-(?:200|400|500|800)(?:\/\d+)?\b/,
        /\btext-white\b/,
        /shadow-\[/,
      ],
    },
    {
      file: "components/sections/footer.tsx",
      requiredImports: ["@/components/ui/button", "Icons.logo"],
      bannedPatterns: [/\b(?:bg|text|border)-green-500(?:\/\d+)?\b/, /text-\[/],
    },
  ];
  const violations = [];

  for (const { file, requiredImports, bannedPatterns } of expectations) {
    const content = await readFile(file, "utf8");
    for (const importName of requiredImports) {
      if (!content.includes(importName)) {
        violations.push(`${file}:${importName}`);
      }
    }
    for (const pattern of bannedPatterns) {
      if (pattern.test(content)) {
        violations.push(`${file}:${pattern.source}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("public top chrome uses semantic status and type primitives", async () => {
  const expectations = [
    {
      file: "components/discontinued-banner.tsx",
      requiredImports: ["StatusPill"],
      bannedPatterns: [
        /\b(?:bg|text|border|from|via|to)-amber-500(?:\/\d+)?\b/,
        /text-amber-/,
      ],
    },
    {
      file: "components/sections/header.tsx",
      requiredImports: ["Header"],
      bannedPatterns: [/text-\[/, /h-\[2px\]/],
    },
    {
      file: "components/mobile-drawer.tsx",
      requiredImports: ["Icons.logo"],
      bannedPatterns: [/h-\[40px\]/],
    },
    {
      file: "components/theme-toggle.tsx",
      requiredImports: ["@/components/ui/button"],
      bannedPatterns: [/[hw]-\[/],
    },
  ];
  const violations = [];

  for (const { file, requiredImports, bannedPatterns } of expectations) {
    const content = await readFile(file, "utf8");
    for (const importName of requiredImports) {
      if (!content.includes(importName)) {
        violations.push(`${file}:${importName}`);
      }
    }
    for (const pattern of bannedPatterns) {
      if (pattern.test(content)) {
        violations.push(`${file}:${pattern.source}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("landing content sections use shared type scale utilities", async () => {
  const files = [
    "components/sections/blog.tsx",
    "components/sections/features.tsx",
    "components/sections/testimonials.tsx",
  ];
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (content.includes("text-[")) {
      violations.push(`${file}:arbitrary-text`);
    }
  }

  assert.deepEqual(violations, []);
});

test("landing hero display type uses a named responsive utility", async () => {
  const globals = await readFile("app/globals.css", "utf8");
  const hero = await readFile("components/sections/hero.tsx", "utf8");
  const violations = [];

  if (!globals.includes(".text-display-hero")) {
    violations.push("app/globals.css:text-display-hero");
  }

  if (!hero.includes("text-display-hero")) {
    violations.push("components/sections/hero.tsx:text-display-hero");
  }

  if (hero.includes("text-[") || hero.includes("leading-[")) {
    violations.push("components/sections/hero.tsx:arbitrary-display-type");
  }

  assert.deepEqual(violations, []);
});

test("explore question surfaces use shared form and action primitives", async () => {
  const checkboxSource = await readFile(
    "components/ui/checkbox.tsx",
    "utf8"
  ).catch(() => "");
  const missingExports = checkboxSource.includes("Checkbox")
    ? []
    : ["components/ui/checkbox.tsx:Checkbox"];
  const structuredData = await readFile(
    "components/explore/structured-data.tsx",
    "utf8"
  );

  const expectations = [
    {
      file: "app/explore/explore-client.tsx",
      requiredImports: [
        "@/components/ui/input",
        "@/components/ui/button",
        "@/components/ui/select",
      ],
      bannedPatterns: ["<input", "<button", "<select", "top-["],
    },
    {
      file: "components/explore/question-signin-modal.tsx",
      requiredImports: ["@/components/ui/button", "@/components/ui/dialog"],
      bannedPatterns: [
        "<button",
        'document.addEventListener("keydown"',
        "document.body.style.overflow",
      ],
    },
    {
      file: "components/explore/explore-question-list-item.tsx",
      requiredImports: ["@/components/ui/button"],
      bannedPatterns: ["<button", "opacity-0"],
    },
    {
      file: "components/explore/conversion-cta.tsx",
      requiredImports: ["@/components/ui/button"],
      bannedPatterns: ["<button"],
    },
    {
      file: "components/question-bank/question-card.tsx",
      requiredImports: ["@/components/ui/checkbox", "@/components/ui/button"],
      bannedPatterns: ["<input", "min-h-[140px]"],
    },
    {
      file: "components/explore/public-question-card.tsx",
      requiredImports: ["@/components/ui/badge"],
      bannedPatterns: ["min-h-[140px]"],
    },
  ];
  const violations = [];

  for (const { file, requiredImports, bannedPatterns } of expectations) {
    const content = await readFile(file, "utf8");
    for (const importName of requiredImports) {
      if (!content.includes(importName)) {
        violations.push(`${file}:${importName}`);
      }
    }
    for (const bannedPattern of bannedPatterns) {
      if (content.includes(bannedPattern)) {
        violations.push(`${file}:${bannedPattern}`);
      }
    }
    if (
      file === "app/explore/explore-client.tsx" &&
      !content.includes("top-header")
    ) {
      violations.push(`${file}:top-header`);
    }
    if (
      file === "components/explore/explore-question-list-item.tsx" &&
      (!content.includes("Practice question") ||
        !content.includes("whitespace-normal") ||
        !content.includes("min-w-0") ||
        content.includes('itemProp="author"') ||
        content.includes('itemProp="dateCreated"'))
    ) {
      violations.push(`${file}:mobile-practice-affordance`);
    }
    if (
      file === "components/explore/question-signin-modal.tsx" &&
      (!content.includes('closeClassName="flex h-11 w-11') ||
        !content.includes("max-h-[calc(100dvh_-_2rem)]") ||
        !content.includes("w-[calc(100%_-_2rem)]") ||
        !content.includes("onCloseAutoFocus"))
    ) {
      violations.push(`${file}:mobile-dialog-bounds`);
    }
    if (
      file === "app/explore/explore-client.tsx" &&
      (!content.includes('aria-label="Question pages"') ||
        !content.includes('aria-label="Loading questions"') ||
        !content.includes('className="min-h-11 pl-10"') ||
        !content.includes('className="min-h-11 w-full rounded-lg'))
    ) {
      violations.push(`${file}:responsive-list-states`);
    }
    if (
      file === "app/explore/explore-client.tsx" &&
      !content.includes("publicAvailability.totalQuestions !== null")
    ) {
      violations.push(`${file}:truthful-structured-data-gate`);
    }
    if (
      file === "app/explore/explore-client.tsx" &&
      content.includes("query: debouncedSearchQuery")
    ) {
      violations.push(`${file}:raw-search-analytics`);
    }
  }

  if (
    structuredData.includes('"@type": "FAQPage"') ||
    structuredData.includes("acceptedAnswer") ||
    structuredData.includes("dateModified: new Date()") ||
    structuredData.includes("datePublished") ||
    structuredData.includes("primaryImageOfPage") ||
    structuredData.includes('"@type": "DataDownload"') ||
    structuredData.includes("temporalCoverage") ||
    structuredData.includes("spatialCoverage")
  ) {
    violations.push("components/explore/structured-data.tsx:invented-schema");
  }

  assert.deepEqual([...missingExports, ...violations], []);
});

test("dashboard question filters use shared controls and semantic type colors", async () => {
  const file = "components/dashboard/sections/questions.tsx";
  const content = await readFile(file, "utf8");
  const violations = [];
  const requiredImports = ["@/components/ui/input", "@/components/ui/button"];
  const rawQuestionTypeColor =
    /\b(?:bg|text|border)-(?:blue|green|purple|orange)-500(?:\/\d+)?\b/;

  for (const importName of requiredImports) {
    if (!content.includes(importName)) {
      violations.push(`${file}:${importName}`);
    }
  }
  if (content.includes("<input")) {
    violations.push(`${file}:input`);
  }
  if (rawQuestionTypeColor.test(content)) {
    violations.push(`${file}:raw-question-type-color`);
  }
  if (content.includes("shadow-[")) {
    violations.push(`${file}:arbitrary-shadow`);
  }
  if (/min-h-\[(?:44|48)px\]/.test(content)) {
    violations.push(`${file}:arbitrary-touch-target`);
  }

  assert.deepEqual(violations, []);
});

test("blog detail page uses shared marketing article primitives", async () => {
  const surfaceSource = await readFile(
    "components/marketing/marketing-surface.tsx",
    "utf8"
  );
  const requiredExports = [
    "MarketingArticleHeader",
    "MarketingProse",
    "MarketingCtaCard",
    "MarketingPage",
    "MarketingMetaRow",
  ];
  const missingExports = requiredExports.filter(
    (name) =>
      !surfaceSource.includes(` ${name}`) &&
      !surfaceSource.includes(`{ ${name}`)
  );

  const file = "app/blog/[id]/page.tsx";
  const content = await readFile(file, "utf8");
  const violations = [];

  for (const importName of requiredExports) {
    if (!content.includes(importName)) {
      violations.push(`${file}:${importName}`);
    }
  }
  if (!content.includes("@/components/ui/button")) {
    violations.push(`${file}:Button`);
  }
  if (content.includes("<svg")) {
    violations.push(`${file}:svg`);
  }
  if (content.includes("text-[")) {
    violations.push(`${file}:arbitrary-text`);
  }
  if (/\b(?:bg|text|border)-(?:red|green)-500/.test(content)) {
    violations.push(`${file}:raw-status-color`);
  }

  assert.deepEqual([...missingExports, ...violations], []);
});

test("contact states use shared marketing, form, and action primitives", async () => {
  const file = "components/contact/contact-page-client.tsx";
  const content = await readFile(file, "utf8");
  const violations = [];

  const requiredImports = [
    "MarketingPage",
    "MarketingHero",
    "MarketingEyebrow",
    "MarketingCard",
    "@/components/ui/button",
    "@/components/ui/input",
    "@/components/ui/textarea",
    "@/components/ui/selectable-card",
    "usePublicActivationDecision",
  ];

  for (const importName of requiredImports) {
    if (!content.includes(importName)) {
      violations.push(`${file}:${importName}`);
    }
  }
  if (content.includes("@/components/ui/card")) {
    violations.push(`${file}:ui/card`);
  }
  if (content.includes("<button")) {
    violations.push(`${file}:button`);
  }
  if (/\b(?:bg|text|border)-(?:red|green)-500/.test(content)) {
    violations.push(`${file}:raw-status-color`);
  }

  assert.deepEqual(violations, []);
});

test("company detail page uses shared marketing article primitives", async () => {
  const file = "app/companies/[slug]/company-detail-client.tsx";
  const content = await readFile(file, "utf8");
  const violations = [];

  const requiredImports = [
    "MarketingPage",
    "MarketingArticleHeader",
    "MarketingEyebrow",
    "MarketingMetaRow",
    "MarketingCtaCard",
    "@/components/ui/button",
  ];

  for (const importName of requiredImports) {
    if (!content.includes(importName)) {
      violations.push(`${file}:${importName}`);
    }
  }
  if (content.includes("<button")) {
    violations.push(`${file}:button`);
  }
  if (content.includes("<svg")) {
    violations.push(`${file}:svg`);
  }
  if (content.includes("text-[")) {
    violations.push(`${file}:arbitrary-text`);
  }

  assert.deepEqual(violations, []);
});

test("priority feedback surfaces use shared feedback primitives", async () => {
  const surfaceSource = await readFile(
    "components/feedback/feedback-surface.tsx",
    "utf8"
  );
  const requiredExports = [
    "FeedbackReviewShell",
    "FeedbackSectionCard",
    "FeedbackScoreCard",
    "FeedbackStateCard",
    "FeedbackStatusPage",
    "FeedbackMetricCard",
    "FeedbackActionItem",
  ];
  const missingExports = requiredExports.filter(
    (name) =>
      !surfaceSource.includes(` ${name}`) &&
      !surfaceSource.includes(`{ ${name}`)
  );

  const expectations = [
    {
      file: "components/feedback/attempt-comparison.tsx",
      requiredImports: ["FeedbackSectionCard", "FeedbackActionItem"],
    },
    {
      file: "components/feedback/feedback-comparison-review.tsx",
      requiredImports: [
        "FeedbackReviewShell",
        "FeedbackSectionCard",
        "FeedbackStateCard",
        "FeedbackStatusPage",
        "SelectableCard",
      ],
    },
    {
      file: "components/feedback/feedback-review.tsx",
      requiredImports: [
        "CompletedV2Review",
        "CompletedLegacyReview",
        "FeedbackLifecycleStatus",
        "toFeedbackViewState",
      ],
    },
    {
      file: "components/feedback/feedback-completed-review.tsx",
      requiredImports: [
        "FeedbackReviewShell",
        "FeedbackSectionCard",
        "FeedbackFindingCard",
        "FeedbackScoreSummary",
        "FeedbackTranscriptSection",
      ],
    },
    {
      file: "components/feedback/feedback-lifecycle-status.tsx",
      requiredImports: [
        "FeedbackStatusPage",
        "FeedbackReviewShell",
        "FeedbackSectionCard",
      ],
    },
    {
      file: "components/feedback/feedback-finding-card.tsx",
      requiredImports: ["StatusPill", "Button"],
    },
  ];
  const violations = [];

  for (const { file, requiredImports } of expectations) {
    const content = await readFile(file, "utf8");
    for (const importName of requiredImports) {
      if (!content.includes(importName)) {
        violations.push(`${file}:${importName}`);
      }
    }
    if (content.includes("@/components/ui/card")) {
      violations.push(`${file}:ui/card`);
    }
    if (
      [
        "components/feedback/feedback-comparison-review.tsx",
        "components/feedback/feedback-completed-review.tsx",
        "components/feedback/feedback-lifecycle-status.tsx",
      ].includes(file) &&
      content.includes("<button")
    ) {
      violations.push(`${file}:button`);
    }
    if (
      [
        "components/feedback/feedback-comparison-review.tsx",
        "components/feedback/feedback-completed-review.tsx",
        "components/feedback/feedback-lifecycle-status.tsx",
      ].includes(file) &&
      (content.includes("container mx-auto") ||
        content.includes("bg-background min-h-screen") ||
        content.includes("from-background via-background"))
    ) {
      violations.push(`${file}:standalone-shell`);
    }
  }

  assert.deepEqual([...missingExports, ...violations], []);
});

test("feedback surface tones use semantic status tokens", async () => {
  const file = "components/feedback/feedback-surface.tsx";
  const content = await readFile(file, "utf8");
  const rawStatusUtility =
    /\b(?:bg|text|border|to|dark:border)-(?:amber|blue|emerald|green|orange|purple|red|yellow)-\d+(?:\/\d+)?\b/;
  const requiredTokens = [
    "border-success",
    "bg-success",
    "text-success",
    "border-warning",
    "bg-warning",
    "text-warning",
    "border-info",
    "bg-info",
    "text-info",
    "border-destructive",
    "bg-destructive",
    "text-destructive",
  ];
  const violations = requiredTokens.filter((token) => !content.includes(token));

  if (rawStatusUtility.test(content)) {
    violations.push(`${file}:raw-status-utility`);
  }

  assert.deepEqual(violations, []);
});

test("feedback result indicators use semantic status tokens", async () => {
  const files = [
    "components/feedback/feedback-surface.tsx",
    "components/feedback/feedback-review.tsx",
    "components/feedback/feedback-completed-review.tsx",
    "components/feedback/feedback-lifecycle-status.tsx",
    "components/feedback/feedback-finding-card.tsx",
    "components/feedback/attempt-comparison.tsx",
  ];
  const rawStatusUtility =
    /\b(?:bg|text|border)-(?:blue|green|orange|red|yellow)-500(?:\/\d+)?\b/;
  const requiredTokens = [
    "text-success",
    "bg-success",
    "text-info",
    "bg-info",
    "text-warning",
    "bg-warning",
    "text-destructive",
    "bg-destructive",
  ];
  const source = [];
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    source.push(content);
    if (rawStatusUtility.test(content)) {
      violations.push(`${file}:raw-status-utility`);
    }
  }

  const combinedSource = source.join("\n");
  for (const token of requiredTokens) {
    if (!combinedSource.includes(token)) {
      violations.push(token);
    }
  }

  assert.deepEqual(violations, []);
});

test("feedback eligibility UI and validator consume one canonical policy", async () => {
  const policy = await readFile(
    "packages/core/src/feedback-eligibility.ts",
    "utf8"
  );
  const validator = await readFile(
    "lib/evaluation/session-validator.ts",
    "utf8"
  );
  const lifecycle = await readFile(
    "components/feedback/feedback-lifecycle-status.tsx",
    "utf8"
  );
  const violations = [];

  for (const threshold of [
    "minTurns: 5",
    "minDurationMinutes: 5",
    "minSubstantiveResponses: 3",
  ]) {
    if (!policy.includes(threshold)) {
      violations.push(`feedback-eligibility:${threshold}`);
    }
  }

  if (!validator.includes("FEEDBACK_ELIGIBILITY_POLICY")) {
    violations.push(
      "lib/evaluation/session-validator.ts:FEEDBACK_ELIGIBILITY_POLICY"
    );
  }

  for (const staleClaim of ["need 10+ min", "need 10+ turns"]) {
    if (lifecycle.includes(staleClaim)) {
      violations.push(`feedback-lifecycle-status:${staleClaim}`);
    }
  }

  assert.deepEqual(violations, []);
});
