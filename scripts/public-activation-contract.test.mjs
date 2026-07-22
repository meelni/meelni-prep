import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const CANONICAL_LAUNCH_PATH = "/dashboard/new-interview";

const publicActivationConsumers = new Map([
  ["app/auth/signin/page.tsx", ["usePublicActivationDecision"]],
  ["app/auth/signup/page.tsx", ["usePublicActivationDecision"]],
  [
    "app/blog/[id]/page.tsx",
    ["PublicActivationButton", "PublicActivationInlineLink"],
  ],
  [
    "app/companies/[slug]/company-detail-client.tsx",
    ["PublicActivationButton"],
  ],
  ["app/companies/page.tsx", ["PublicActivationButton"]],
  ["app/explore/explore-client.tsx", ["usePublicActivationDecision"]],
  ["app/pricing/page.tsx", ["usePublicActivationDecision"]],
  [
    "components/demo-modal.tsx",
    ["usePublicActivationDecision", "PublicActivationButton"],
  ],
  ["components/explore/conversion-cta.tsx", ["usePublicActivationDecision"]],
  [
    "components/explore/question-signin-modal.tsx",
    ["usePublicActivationDecision"],
  ],
  ["components/mobile-drawer.tsx", ["PublicActivationButton"]],
  ["components/sections/cta.tsx", ["PublicActivationButton"]],
  ["components/sections/footer.tsx", ["PublicActivationButton"]],
  ["components/sections/header.tsx", ["PublicActivationButton"]],
  [
    "components/sections/hero.tsx",
    ["usePublicActivationDecision", "PublicActivationButton"],
  ],
  ["components/sections/pricing.tsx", ["usePublicActivationDecision"]],
]);

const publicSourceRoots = [
  "app/auth",
  "app/blog",
  "app/companies",
  "app/explore",
  "app/pricing",
  "components/explore",
  "components/sections",
];

async function source(file) {
  return readFile(path.join(ROOT, file), "utf8");
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(path.join(ROOT, directory), {
    withFileTypes: true,
  })) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(relativePath)));
    } else if (
      /\.(?:ts|tsx)$/.test(entry.name) &&
      !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)
    ) {
      files.push(relativePath);
    }
  }
  return files;
}

test("every public activation surface consumes the shared relaunch decision", async () => {
  const violations = [];

  for (const [file, requiredTokens] of publicActivationConsumers) {
    const content = await source(file);
    for (const token of requiredTokens) {
      if (!content.includes(token)) violations.push(`${file}:${token}`);
    }
  }

  assert.deepEqual(violations, []);
});

test("public source limits raw launch links to routed blog content and the bounded SAV-272 owner", async () => {
  const files = [
    ...(await Promise.all(publicSourceRoots.map(sourceFiles))).flat(),
    "components/demo-modal.tsx",
    "components/mobile-drawer.tsx",
    "lib/blog/posts.ts",
  ];
  const rawLaunchOwners = [];

  for (const file of files) {
    const content = await source(file);
    if (content.includes(CANONICAL_LAUNCH_PATH)) rawLaunchOwners.push(file);
  }

  assert.deepEqual(rawLaunchOwners, [
    "app/pricing/success/checkout-success-client.tsx",
    "lib/blog/posts.ts",
  ]);

  const checkoutSuccess = await source(
    "app/pricing/success/checkout-success-client.tsx"
  );
  assert.doesNotMatch(checkoutSuccess, /usePublicActivationDecision/);
  const task = await source(
    "docs/agent-tasks/public-reactivation-conversion.md"
  );
  assert.match(task, /SAV-272/);
  assert.match(task, /exact `main`/);

  const blogData = await source("lib/blog/posts.ts");
  assert.equal(blogData.split(`](${CANONICAL_LAUNCH_PATH})`).length - 1, 9);

  const blogRoute = await source("app/blog/[id]/page.tsx");
  assert.match(blogRoute, /href\?\.startsWith\(NEW_INTERVIEW_PATH\)/);
  assert.match(blogRoute, /PublicActivationInlineLink/);
});

test("public navigation preserves account entry while activation is paused", async () => {
  const header = await source("components/sections/header.tsx");
  const mobileDrawer = await source("components/mobile-drawer.tsx");

  for (const content of [header, mobileDrawer]) {
    assert.match(content, /href="\/auth\/signin"/);
    assert.match(content, /href="\/dashboard"/);
    assert.match(content, /PublicActivationButton/);
  }
});

test("paused authentication preserves existing-account entry without signup activation", async () => {
  const signIn = await source("app/auth/signin/page.tsx");
  const signUp = await source("app/auth/signup/page.tsx");

  assert.match(signIn, /label="Continue with Google"/);
  assert.match(signIn, /New accounts currently paused/);
  assert.match(signUp, /if \(!activation\.canActivate\) \{/);
  assert.match(signUp, /Sign in to an existing account/);
  assert.match(signUp, /role="status"/);
  assert.doesNotMatch(
    signUp,
    /<AuthMessage tone="error">\s*\{PUBLIC_ACTIVATION_PAUSED_LABEL\}/
  );
});

test("paused pricing keeps plan information visible and gates only purchase controls", async () => {
  const pricing = await source("app/pricing/page.tsx");

  assert.match(pricing, /Pricing is shown for reference/);
  assert.match(pricing, /plans\.map\(\(plan\) =>/);
  assert.match(pricing, /!activation\.canActivate \|\|/);
  assert.doesNotMatch(pricing, /title="Service Paused"/);
});

test("public UI bootstrap and authenticated enforcement share one global gate identity", async () => {
  const identity = await source("lib/feature-flags/reactivation-identity.ts");
  const access = await source("lib/feature-flags/reactivation-access.ts");
  const bootstrap = await source("lib/feature-flags/server-bootstrap.ts");

  assert.match(identity, /public-launch-state/);
  assert.match(access, /buildReactivationLaunchStateIdentity\(\)/);
  assert.match(bootstrap, /buildReactivationLaunchStateIdentity\(\)/);
  assert.doesNotMatch(access, /buildStatsigUser/);
});

test("isolated browser QA supplies the enabled public activation decision without provider access", async () => {
  const viteConfig = await source("tests/browser/vite.config.ts");
  const featureFlagShim = await source(
    "tests/browser/harness/shims/feature-flags.ts"
  );

  assert.match(
    viteConfig,
    /find: "@\/lib\/feature-flags\/public-activation-client"/
  );
  assert.match(featureFlagShim, /usePublicActivationDecision/);
  assert.match(
    featureFlagShim,
    /canActivate: true, state: "available" as const/
  );
});

test("paused public conversion stops before auth, checkout, demo, or setup navigation", async () => {
  const explore = await source("app/explore/explore-client.tsx");
  const questionModal = await source(
    "components/explore/question-signin-modal.tsx"
  );
  const demo = await source("components/demo-modal.tsx");

  assert.match(explore, /entryAction === "paused"/);
  assert.match(explore, /activation\.canActivate && selectedQuestion/);
  assert.match(questionModal, /if \(!activation\.canActivate\) return;/);
  assert.match(
    questionModal,
    /if \(!activation\.canActivate\) \{\s*return null;/
  );
  assert.match(
    demo,
    /const activationOpen = isOpen && activation\.canActivate/
  );

  for (const file of [
    "app/pricing/page.tsx",
    "components/sections/pricing.tsx",
  ]) {
    const content = await source(file);
    const guard = content.indexOf("if (!activation.canActivate) return;");
    const checkout = content.indexOf('fetch("/api/checkout/create-session"');
    assert.ok(guard >= 0 && checkout > guard, file);
  }
});
