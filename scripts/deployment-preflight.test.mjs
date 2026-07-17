import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("./deployment-preflight.ts", import.meta.url).pathname;
const canonicalVercelIdentity = {
  VERCEL_GIT_REPO_OWNER: "meelni",
  VERCEL_GIT_REPO_SLUG: "meelni-prep",
  VERCEL_PROJECT_ID: "prj_NvpsSMhIhmUoaVAG5nPnbd2fRmT4",
};

test("deployment preflight output is redacted when configuration fails", () => {
  const sentinels = [
    "sk_test_DO_NOT_PRINT_SERVER",
    "pk_live_DO_NOT_PRINT_PUBLIC",
    "DO_NOT_PRINT_INNGEST",
    "DO_NOT_PRINT_OPENAI",
    "price_DO_NOT_PRINT",
  ];
  const result = spawnSync("npx", ["tsx", script, "--target=preview"], {
    encoding: "utf8",
    env: {
      ...process.env,
      INNGEST_EVENT_KEY: sentinels[2],
      INNGEST_SIGNING_KEY: "",
      LIVEKIT_API_KEY: "",
      LIVEKIT_API_SECRET: "",
      LIVEKIT_DEMO_AGENT_NAME: "",
      LIVEKIT_INTERVIEW_AGENT_NAME: "",
      LIVEKIT_URL: "",
      MEELNI_REACTIVATION_DEFAULT: "false",
      NEXT_PUBLIC_LIVEKIT_URL: "",
      NEXT_PUBLIC_STATSIG_API_URL: "/api/statsig",
      NEXT_PUBLIC_STATSIG_CLIENT_KEY: "",
      NEXT_PUBLIC_STATSIG_ENVIRONMENT: "preview",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: sentinels[1],
      OPENAI_API_KEY: sentinels[3],
      OPENAI_FEEDBACK_MODEL: "gpt-5.1",
      STRIPE_INTERVIEW_PASS_PRICE_ID: sentinels[4],
      STRIPE_PRO_MONTHLY_PRICE_ID: sentinels[4],
      STRIPE_SECRET_KEY: sentinels[0],
      STRIPE_STARTER_MONTHLY_PRICE_ID: sentinels[4],
      STRIPE_WEBHOOK_SECRET: "",
    },
    timeout: 10_000,
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1, output);
  assert.match(output, /Deployment preflight failed/);
  for (const sentinel of sentinels) {
    assert.doesNotMatch(output, new RegExp(sentinel));
  }
});

test("deploy-only mode skips only when no deploy target is present", () => {
  const result = spawnSync("npx", ["tsx", script, "--if-deploy"], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
    },
    timeout: 10_000,
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /skipped outside Vercel Preview\/Production/);
});

test("npm ignore-scripts cannot bypass the fail-closed deploy preflight", () => {
  const result = spawnSync("npm", ["--ignore-scripts", "run", "build"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      ...canonicalVercelIdentity,
      VERCEL: "1",
      VERCEL_ENV: "preview",
    },
    timeout: 10_000,
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1, output);
  assert.match(output, /Deployment preflight failed/);
  assert.doesNotMatch(output, /Creating an optimized production build/);
});

test("deploy-only mode ignores stale local VERCEL_ENV without VERCEL=1", () => {
  const result = spawnSync("npx", ["tsx", script, "--if-deploy"], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      VERCEL_ENV: "production",
    },
    timeout: 10_000,
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /skipped outside Vercel Preview\/Production/);
});

test("deploy-only mode fails closed when Vercel omits its deploy target", () => {
  const result = spawnSync("npx", ["tsx", script, "--if-deploy"], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      ...canonicalVercelIdentity,
      VERCEL: "1",
    },
    timeout: 10_000,
  });

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stderr,
    /could not resolve the Vercel Preview\/Production target/
  );
  assert.doesNotMatch(result.stdout, /skipped/);
});

test("an explicit target cannot override the Vercel target", () => {
  const result = spawnSync("npx", ["tsx", script, "--target=preview"], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      ...canonicalVercelIdentity,
      VERCEL: "1",
      VERCEL_ENV: "production",
    },
    timeout: 10_000,
  });

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stderr,
    /requires --target=preview or --target=production/
  );
});

test("deploy-only mode rejects the wrong Vercel project identity", () => {
  const result = spawnSync("npx", ["tsx", script, "--if-deploy"], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      ...canonicalVercelIdentity,
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_ID: "prj_wrong",
    },
    timeout: 10_000,
  });

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /could not resolve/);
  assert.doesNotMatch(result.stdout, /Deployment preflight target/);
});

test("Vercel Preview rejects a valid but stale rehearsal commit anchor", () => {
  const result = spawnSync("npx", ["tsx", script, "--target=preview"], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      ...canonicalVercelIdentity,
      MEELNI_REHEARSAL_COMMIT_SHA: "a".repeat(40),
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "codex/sav-184-deploy-preflight",
      VERCEL_GIT_COMMIT_SHA: "b".repeat(40),
    },
    timeout: 10_000,
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1, output);
  assert.match(output, /MEELNI_REHEARSAL_COMMIT_SHA/);
});
