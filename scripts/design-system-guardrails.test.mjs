import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const ROOTS = ["app", "components", "lib"];
const EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
const INVALID_TOKEN_WRAPPER =
  /\b(?:hsl|rgb)\(\s*var\(--[a-z0-9-]+\)\s*(?:\/[^)]*)?\)/g;

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
    if (
      file === "components/dashboard/setup-modal.tsx" &&
      !content.includes("@/components/ui/input")
    ) {
      violations.push(`${file}:Input`);
    }
    if (
      file === "components/dashboard/setup-modal.tsx" &&
      content.includes("<input")
    ) {
      violations.push(`${file}:input`);
    }
  }

  assert.deepEqual([...missingExports, ...violations], []);
});

test("setup difficulty selector uses semantic selection tones", async () => {
  const file = "app/setup/components/difficulty-selector.tsx";
  const content = await readFile(file, "utf8");
  const rawDifficultyTone =
    /\b(?:from|to|bg|text|border)-(?:emerald|green|orange|red|rose|yellow)-\d+(?:\/\d+)?\b/;
  const requiredTokens = [
    "bg-success",
    "text-success",
    "bg-warning",
    "text-warning",
    "bg-destructive",
    "text-destructive",
  ];
  const violations = requiredTokens.filter((token) => !content.includes(token));

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
      file: "components/explore/question-signin-modal.tsx",
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
      file: "components/dashboard/sections/analytics.tsx",
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
      file: "components/dashboard/charts/score-by-difficulty.tsx",
      requiredImport: "DashboardChartCard",
    },
    {
      file: "components/dashboard/sections/analytics.tsx",
      requiredImport: "DashboardStateCard",
    },
    {
      file: "components/dashboard/sections/analytics.tsx",
      requiredImport: "DashboardSkeletonCard",
    },
    {
      file: "components/dashboard/sections/overview.tsx",
      requiredImport: "DashboardSectionCard",
    },
    {
      file: "components/dashboard/sections/overview.tsx",
      requiredImport: "DashboardStateCard",
    },
    {
      file: "components/dashboard/sections/overview.tsx",
      requiredImport: "DashboardActionCard",
    },
    {
      file: "components/dashboard/next-goal-card.tsx",
      requiredImport: "DashboardActionCard",
    },
    {
      file: "components/dashboard/badge-display.tsx",
      requiredImport: "DashboardSectionCard",
    },
    {
      file: "components/dashboard/badge-display.tsx",
      requiredImport: "DashboardSkeletonCard",
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
      file: "components/dashboard/sections/settings.tsx",
      requiredImport: "DashboardSectionCard",
    },
    {
      file: "components/dashboard/sections/settings.tsx",
      requiredImport: "DashboardActionCard",
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
      requiredImport: "DashboardSectionCard",
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
      [
        "components/dashboard/sections/overview.tsx",
        "components/dashboard/next-goal-card.tsx",
      ].includes(file) &&
      content.includes("@/components/ui/card")
    ) {
      missingImports.push(`${file}:ui/card`);
    }
    if (
      [
        "components/dashboard/badge-display.tsx",
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
      file === "components/dashboard/badge-display.tsx" &&
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
    "components/feedback/score-breakdown.tsx",
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
    "components/dashboard/stats/milestone-badge.tsx",
    "components/dashboard/stats/trend-indicator.tsx",
    "components/dashboard/weakest-area-card.tsx",
    "components/dashboard/next-goal-card.tsx",
    "components/dashboard/charts/score-by-difficulty.tsx",
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
  const requiredTokens = [
    "bg-success",
    "bg-info",
    "bg-primary",
    "text-warning",
    "bg-warning",
    "border-warning",
  ];
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
  const requiredTokens = ["text-success", "text-warning", "text-destructive"];
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
  const files = [
    "app/interview/components/agent-state-badge.tsx",
    "app/interview/components/connection-indicator.tsx",
    "app/interview/components/end-session-modal.tsx",
    "app/interview/components/interview-controls.tsx",
    "components/interview/nudge-overlay.tsx",
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

test("overlay dismiss actions use shared button primitives", async () => {
  const files = [
    "components/interview/nudge-overlay.tsx",
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
    "components/interview/nudge-overlay.tsx",
    "components/dashboard/charts/glowing-radar-chart.tsx",
    "components/dashboard/badge-display.tsx",
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
    "text-warning",
    "bg-warning",
    "border-warning",
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
    "shadow-primary",
    "text-info",
    "bg-info",
    "text-success",
    "bg-success",
    "text-warning",
    "bg-warning",
  ];
  const violations = requiredTokens.filter((token) => !content.includes(token));

  if (rawFeatureTone.test(content)) {
    violations.push(`${file}:raw-feature-tone`);
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
  const rawTrendBadge =
    /\b(?:bg|text|border)-(?:green|red)-500(?:\/\d+)?\b/;
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

test("test demo surfaces use shared controls and semantic tones", async () => {
  const files = [
    "components/interview/nudge-overlay.test-demo.tsx",
    "components/ui/animated-number.tsx",
  ];
  const rawDemoTone =
    /\b(?:bg|text|border|hover:bg|hover:text|hover:border)-(?:amber|blue|green|purple|red)-500(?:\/\d+)?\b/;
  const requiredTokens = [
    "Button",
    "text-info",
    "bg-info",
    "text-warning",
    "bg-warning",
    "text-success",
    "text-destructive",
  ];
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
  const textareaSource = await readFile(
    "components/ui/textarea.tsx",
    "utf8"
  ).catch(() => "");
  const missingExports = textareaSource.includes("Textarea")
    ? []
    : ["components/ui/textarea.tsx:Textarea"];
  const files = [
    "components/question-bank/filter-popover.tsx",
    "components/question-bank/mobile-filter-drawer.tsx",
    "components/question-bank/question-card.tsx",
    "components/question-bank/practice-sets-list.tsx",
    "components/question-bank/practice-set-dialog.tsx",
    "components/question-bank/search-autocomplete.tsx",
  ];
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (content.includes("<button")) {
      violations.push(`${file}:button`);
    }
    if (!content.includes("@/components/ui/button")) {
      violations.push(`${file}:Button`);
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
    "app/pricing/success/page.tsx",
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

test("docs and pricing pages use shared public-page status surfaces", async () => {
  const expectations = [
    {
      file: "app/docs/page.tsx",
      requiredImports: [
        "MarketingPage",
        "MarketingHero",
        "MarketingEyebrow",
        "AppSurface",
        "StatusPill",
        "@/components/ui/button",
      ],
    },
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
      requiredImports: ["AppSurface", "StatusPill"],
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
      requiredImports: ["IntegrationIconBadge", "bg-muted", "text-muted-foreground"],
      bannedPatterns: [
        /\b(?:bg|text|border)-(?:blue|green|neutral|purple|slate|yellow|red)-(?:200|400|500|800)(?:\/\d+)?\b/,
        /\btext-white\b/,
      ],
    },
    {
      file: "components/sections/footer.tsx",
      requiredImports: ["StatusPill"],
      bannedPatterns: [
        /\b(?:bg|text|border)-green-500(?:\/\d+)?\b/,
        /text-\[/,
      ],
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
      bannedPatterns: [/text-\[/],
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

test("explore question surfaces use shared form and action primitives", async () => {
  const checkboxSource = await readFile("components/ui/checkbox.tsx", "utf8").catch(
    () => ""
  );
  const missingExports = checkboxSource.includes("Checkbox")
    ? []
    : ["components/ui/checkbox.tsx:Checkbox"];

  const expectations = [
    {
      file: "app/explore/page.tsx",
      requiredImports: ["@/components/ui/input", "@/components/ui/button"],
      bannedPatterns: ["<input", "<button"],
    },
    {
      file: "components/explore/question-signin-modal.tsx",
      requiredImports: ["@/components/ui/button"],
      bannedPatterns: ["<button"],
    },
    {
      file: "components/explore/conversion-cta.tsx",
      requiredImports: ["@/components/ui/button"],
      bannedPatterns: ["<button"],
    },
    {
      file: "components/question-bank/question-card.tsx",
      requiredImports: ["@/components/ui/checkbox", "@/components/ui/button"],
      bannedPatterns: ["<input"],
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
  }

  assert.deepEqual([...missingExports, ...violations], []);
});

test("dashboard question filters use shared controls and semantic type colors", async () => {
  const file = "components/dashboard/sections/questions.tsx";
  const content = await readFile(file, "utf8");
  const violations = [];
  const requiredImports = [
    "@/components/ui/input",
    "@/components/ui/checkbox",
    "DashboardSectionCard",
  ];
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

test("contact page uses shared marketing and form primitives", async () => {
  const file = "app/contact/page.tsx";
  const content = await readFile(file, "utf8");
  const violations = [];

  const requiredImports = [
    "MarketingPage",
    "MarketingHero",
    "MarketingEyebrow",
    "MarketingCtaCard",
    "MarketingCard",
    "SelectableCard",
    "@/components/ui/textarea",
    "@/components/ui/button",
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
  if (content.includes("<textarea")) {
    violations.push(`${file}:textarea`);
  }
  if (/\b(?:bg|text|border)-(?:red|green)-500/.test(content)) {
    violations.push(`${file}:raw-status-color`);
  }

  assert.deepEqual(violations, []);
});

test("company detail page uses shared marketing article primitives", async () => {
  const file = "app/companies/[slug]/page.tsx";
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
      file: "components/feedback/feedback-display.tsx",
      requiredImports: [
        "FeedbackSectionCard",
        "FeedbackScoreCard",
        "FeedbackStateCard",
      ],
    },
    {
      file: "components/feedback/score-breakdown.tsx",
      requiredImports: ["FeedbackSectionCard"],
    },
    {
      file: "components/feedback/strengths-list.tsx",
      requiredImports: ["FeedbackSectionCard"],
    },
    {
      file: "components/feedback/improvements-list.tsx",
      requiredImports: ["FeedbackSectionCard"],
    },
    {
      file: "components/feedback/drill-list.tsx",
      requiredImports: ["FeedbackSectionCard"],
    },
    {
      file: "components/feedback/transcript-viewer.tsx",
      requiredImports: ["FeedbackSectionCard", "FeedbackStateCard"],
    },
    {
      file: "components/feedback/feedback-partial.tsx",
      requiredImports: [
        "FeedbackStatusPage",
        "FeedbackSectionCard",
        "FeedbackMetricCard",
        "FeedbackActionItem",
      ],
    },
    {
      file: "components/feedback/feedback-insufficient.tsx",
      requiredImports: [
        "FeedbackStatusPage",
        "FeedbackSectionCard",
        "FeedbackMetricCard",
        "FeedbackActionItem",
      ],
    },
    {
      file: "components/feedback/feedback-abandoned.tsx",
      requiredImports: [
        "FeedbackStatusPage",
        "FeedbackSectionCard",
        "FeedbackActionItem",
      ],
    },
    {
      file: "components/feedback/attempt-comparison.tsx",
      requiredImports: ["FeedbackSectionCard", "FeedbackActionItem"],
    },
    {
      file: "app/feedback/[sessionId]/compare/page.tsx",
      requiredImports: [
        "FeedbackSectionCard",
        "FeedbackStateCard",
        "FeedbackStatusPage",
        "SelectableCard",
      ],
    },
    {
      file: "app/feedback/[sessionId]/page.tsx",
      requiredImports: [
        "FeedbackStatusPage",
        "FeedbackSectionCard",
        "FeedbackScoreCard",
        "FeedbackActionItem",
      ],
    },
    {
      file: "components/feedback/rubric-section.tsx",
      requiredImports: ["FeedbackSectionCard"],
    },
    {
      file: "app/feedback/[sessionId]/components/feedback-loading.tsx",
      requiredImports: [
        "FeedbackStatusPage",
        "FeedbackSectionCard",
        "FeedbackActionItem",
      ],
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
        "app/feedback/[sessionId]/compare/page.tsx",
        "app/feedback/[sessionId]/components/feedback-loading.tsx",
      ].includes(file) &&
      content.includes("<button")
    ) {
      violations.push(`${file}:button`);
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
    "app/feedback/[sessionId]/page.tsx",
    "components/feedback/feedback-display.tsx",
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
