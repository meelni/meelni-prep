import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_STRIPE_ACCOUNT_ID,
  PRODUCTION_LIVEKIT_PROJECT_HOST,
  runDeploymentPreflight as runDeploymentPreflightWithAuthority,
  type DeploymentTarget,
  type StripeCatalogReader,
  type StripePriceEvidence,
} from "./deployment-preflight";
import { PREVIEW_LIVEKIT_IDENTITY } from "./provider-identities";

const testPreviewLiveKitIdentity = {
  projectHost: "fixture-preview.livekit.cloud",
  demoAgentName: "CA_previewDemo123",
  interviewAgentName: "CA_previewInterview123",
} as const;

function runDeploymentPreflight(
  options: Parameters<typeof runDeploymentPreflightWithAuthority>[0]
) {
  return runDeploymentPreflightWithAuthority({
    ...options,
    previewLiveKitIdentity:
      options.target === "preview"
        ? (options.previewLiveKitIdentity ?? testPreviewLiveKitIdentity)
        : options.previewLiveKitIdentity,
    supabaseProjectReader:
      options.supabaseProjectReader ?? validSupabaseReader(),
  });
}

const testPriceIds = {
  price_pass: "interview_pass",
  price_starter: "starter",
  price_pro: "pro",
} as const;

test("accepts a complete Preview contract with read-only test catalog evidence", async () => {
  const result = await runDeploymentPreflight({
    env: validEnvironment("preview"),
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    previewLiveKitIdentity: testPreviewLiveKitIdentity,
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.passedChecks, [
    "supabase.declared_target_identity",
    "stripe.key_mode",
    "stripe.catalog.unique_prices",
    "inngest.credential_shape",
    "openai.credential_shape_and_model_pin",
    "livekit.configuration_contract",
    "statsig.credential_shape_proxy_and_phase_fallback",
    "contact.rate_limit_hmac_secret",
    "supabase.credentials.read_only",
    "openai.model.read_only",
    "livekit.project.read_only",
    "stripe.account",
    "stripe.catalog.interview_pass",
    "stripe.catalog.starter",
    "stripe.catalog.pro",
  ]);
});

test("accepts live restricted keys and a live Production catalog", async () => {
  const result = await runDeploymentPreflight({
    env: validEnvironment("production"),
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(true),
    target: "production",
  });

  assert.equal(result.ok, true);
});

test("rejects missing, blank, quoted-empty, and placeholder provider values", async () => {
  const result = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      INNGEST_EVENT_KEY: undefined,
      INNGEST_SIGNING_KEY: "  ",
      OPENAI_API_KEY: '""',
      OPENAI_FEEDBACK_MODEL: "your_model",
      LIVEKIT_API_SECRET: "changeme",
      DEMO_ABUSE_HMAC_SECRET: undefined,
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures
      .filter((failure) => failure.code === "blank_or_missing")
      .map((failure) => failure.check),
    [
      "INNGEST_EVENT_KEY",
      "INNGEST_SIGNING_KEY",
      "OPENAI_API_KEY",
      "OPENAI_FEEDBACK_MODEL",
      "LIVEKIT_API_SECRET",
      "DEMO_ABUSE_HMAC_SECRET",
    ]
  );
});

test("rejects malformed public demo HMAC secrets before provider reads", async () => {
  let liveKitReads = 0;
  const result = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      DEMO_ABUSE_HMAC_SECRET: "not-a-32-byte-base64url-secret",
    },
    liveKitProjectReader: {
      async verifyProjectAccess() {
        liveKitReads += 1;
      },
    },
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });

  assert.equal(result.ok, false);
  assert.equal(liveKitReads, 0);
  assert.deepEqual(
    result.failures.map(({ check, code }) => ({ check, code })),
    [{ check: "DEMO_ABUSE_HMAC_SECRET", code: "invalid_format" }]
  );
});

test("requires a strong contact HMAC secret before provider reads", async () => {
  for (const [value, expectedCode] of [
    [undefined, "blank_or_missing"],
    ['""', "blank_or_missing"],
    ["a".repeat(64), "invalid_format"],
    ["change-me-contact-secret-1234567890", "invalid_format"],
  ] as const) {
    let providerReads = 0;
    const result = await runDeploymentPreflight({
      env: {
        ...validEnvironment("preview"),
        CONTACT_RATE_LIMIT_HMAC_SECRET: value,
      },
      liveKitProjectReader: {
        async verifyProjectAccess() {
          providerReads += 1;
        },
      },
      openAiModelReader: {
        async verifyModelAccess() {
          providerReads += 1;
        },
      },
      supabaseProjectReader: {
        async verifyAnonKey() {
          providerReads += 1;
        },
        async verifyServiceRoleKey() {
          providerReads += 1;
        },
      },
      stripeCatalogReader: {
        async readAccountId() {
          providerReads += 1;
          return CANONICAL_STRIPE_ACCOUNT_ID;
        },
        async readPrice() {
          providerReads += 1;
          return evidence("interview_pass", false);
        },
      },
      target: "preview",
    });

    assert.equal(result.ok, false);
    assert.equal(providerReads, 0);
    assert.deepEqual(
      result.failures
        .filter(({ area }) => area === "contact")
        .map(({ check, code }) => ({ check, code })),
      [{ check: "CONTACT_RATE_LIMIT_HMAC_SECRET", code: expectedCode }]
    );
  }
});

test("rejects mixed Stripe keys and target-mode mismatches before provider reads", async () => {
  let reads = 0;
  const mixed = await runDeploymentPreflight({
    env: {
      ...validEnvironment("production"),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_public",
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: {
      async readAccountId() {
        reads += 1;
        return CANONICAL_STRIPE_ACCOUNT_ID;
      },
      async readPrice() {
        reads += 1;
        return evidence("interview_pass", true);
      },
    },
    target: "production",
  });
  assert.equal(mixed.ok, false);
  assert.equal(mixed.failures[0]?.code, "mixed_stripe_mode");
  assert.equal(reads, 0);

  const wrongMode = await runDeploymentPreflight({
    env: validEnvironment("preview", "live"),
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(true),
    target: "preview",
  });
  assert.equal(wrongMode.ok, false);
  assert.equal(wrongMode.failures[0]?.code, "wrong_stripe_mode");
});

test("rejects duplicate catalog IDs without reading Stripe", async () => {
  let reads = 0;
  const result = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      STRIPE_PRO_MONTHLY_PRICE_ID: "price_starter",
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: {
      async readAccountId() {
        reads += 1;
        return CANONICAL_STRIPE_ACCOUNT_ID;
      },
      async readPrice() {
        reads += 1;
        return evidence("starter", false);
      },
    },
    target: "preview",
  });

  assert.equal(result.ok, false);
  assert.equal(result.failures[0]?.code, "duplicate_price_id");
  assert.equal(reads, 0);
});

test("fails closed on unreadable or mismatched Stripe catalog evidence", async () => {
  const unreadable = await runDeploymentPreflight({
    env: validEnvironment("preview"),
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: {
      async readAccountId() {
        return CANONICAL_STRIPE_ACCOUNT_ID;
      },
      async readPrice() {
        throw new Error("provider detail containing a secret or price ID");
      },
    },
    target: "preview",
  });
  assert.equal(unreadable.ok, false);
  assert.equal(unreadable.failures.length, 3);
  assert.ok(
    unreadable.failures.every(
      (failure) => failure.code === "stripe_price_unreadable"
    )
  );
  assert.ok(
    unreadable.failures.every(
      (failure) => !failure.message.includes("provider detail")
    )
  );

  const wrongAccount = await runDeploymentPreflight({
    env: validEnvironment("preview"),
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: {
      async readAccountId() {
        return "acct_unrelated";
      },
      async readPrice() {
        throw new Error("prices must not be read for the wrong account");
      },
    },
    target: "preview",
  });
  assert.equal(wrongAccount.ok, false);
  assert.deepEqual(
    wrongAccount.failures.map((failure) => failure.code),
    ["stripe_account_mismatch"]
  );

  const mismatched = await runDeploymentPreflight({
    env: validEnvironment("production"),
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: {
      async readAccountId() {
        return CANONICAL_STRIPE_ACCOUNT_ID;
      },
      async readPrice(priceId) {
        const catalogId = testPriceIds[priceId as keyof typeof testPriceIds];
        return {
          ...evidence(catalogId, true),
          unitAmount:
            catalogId === "pro" ? 2900 : evidence(catalogId, true).unitAmount,
        };
      },
    },
    target: "production",
  });
  assert.equal(mismatched.ok, false);
  assert.deepEqual(
    mismatched.failures.map((failure) => failure.check),
    ["stripe.catalog.pro"]
  );

  const cadenceMismatch = await runDeploymentPreflight({
    env: validEnvironment("preview"),
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: {
      async readAccountId() {
        return CANONICAL_STRIPE_ACCOUNT_ID;
      },
      async readPrice(priceId) {
        const catalogId = testPriceIds[priceId as keyof typeof testPriceIds];
        const accepted = evidence(catalogId, false);
        return {
          ...accepted,
          recurringIntervalCount:
            catalogId === "starter" ? 2 : accepted.recurringIntervalCount,
        };
      },
    },
    target: "preview",
  });
  assert.equal(cadenceMismatch.ok, false);
  assert.deepEqual(
    cadenceMismatch.failures.map((failure) => failure.check),
    ["stripe.catalog.starter"]
  );
});

test("requires aligned LiveKit URLs and the explicit Statsig proxy contract", async () => {
  const result = await runDeploymentPreflight({
    env: {
      ...validEnvironment("production"),
      LIVEKIT_URL: "wss://other.livekit.cloud",
      NEXT_PUBLIC_STATSIG_API_URL: "https://statsigapi.net/v1",
      NEXT_PUBLIC_STATSIG_ENVIRONMENT: "preview",
      MEELNI_REACTIVATION_DEFAULT: "unset",
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(true),
    target: "production",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map((failure) => failure.check),
    [
      "livekit.target_project",
      "livekit.websocket_alignment",
      "NEXT_PUBLIC_STATSIG_ENVIRONMENT",
      "NEXT_PUBLIC_STATSIG_API_URL",
      "MEELNI_REACTIVATION_DEFAULT",
    ]
  );
});

test("enforces isolated Preview and canonical Production LiveKit projects", async () => {
  for (const [target, host] of [
    ["preview", PRODUCTION_LIVEKIT_PROJECT_HOST],
    ["production", "other.livekit.cloud"],
  ] as const) {
    const result = await runDeploymentPreflight({
      env: {
        ...validEnvironment(target),
        LIVEKIT_URL: `wss://${host}`,
        NEXT_PUBLIC_LIVEKIT_URL: `wss://${host}`,
      },
      liveKitProjectReader: validLiveKitReader(),
      openAiModelReader: validOpenAiReader(),
      stripeCatalogReader: validStripeReader(target === "production"),
      target,
    });

    assert.equal(result.ok, false, `${target}:${host}`);
    assert.deepEqual(
      result.failures.map((failure) => failure.check),
      ["livekit.target_project"],
      `${target}:${host}`
    );
  }
});

test("requires explicit valid server-owned interview runtime settings", async () => {
  const missing = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      MEELNI_INTERVIEW_LLM_MODEL: " ",
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });
  assert.equal(missing.ok, false);
  assert.deepEqual(
    missing.failures.map((failure) => failure.check),
    ["MEELNI_INTERVIEW_LLM_MODEL"]
  );

  for (const [name, value] of [
    ["MEELNI_INTERVIEW_TTS_SPEED", "0x1"],
    ["MEELNI_INTERVIEW_TTS_SPEED", "0.59"],
    ["MEELNI_INTERVIEW_TTS_VOLUME", "Infinity"],
    ["MEELNI_INTERVIEW_TTS_VOLUME", "2.1"],
  ] as const) {
    const result = await runDeploymentPreflight({
      env: { ...validEnvironment("preview"), [name]: value },
      liveKitProjectReader: validLiveKitReader(),
      openAiModelReader: validOpenAiReader(),
      stripeCatalogReader: validStripeReader(false),
      target: "preview",
    });
    assert.equal(result.ok, false, `${name}=${value}`);
    assert.deepEqual(
      result.failures.map((failure) => failure.check),
      [name],
      `${name}=${value}`
    );
  }
});

test("rejects unreviewed feedback model drift", async () => {
  const result = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      OPENAI_FEEDBACK_MODEL: "gpt-future-unreviewed",
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map((failure) => failure.check),
    ["OPENAI_FEEDBACK_MODEL"]
  );
});

test("rejects shape-preserving placeholders before provider checks", async () => {
  let stripeReads = 0;
  const result = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      OPENAI_API_KEY: "sk-proj-xxx",
      STRIPE_INTERVIEW_PASS_PRICE_ID: "price_xxx",
      STRIPE_WEBHOOK_SECRET: "whsec_redacted",
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: {
      async readAccountId() {
        stripeReads += 1;
        return CANONICAL_STRIPE_ACCOUNT_ID;
      },
      async readPrice() {
        stripeReads += 1;
        return evidence("interview_pass", false);
      },
    },
    target: "preview",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map((failure) => failure.check),
    [
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_INTERVIEW_PASS_PRICE_ID",
      "OPENAI_API_KEY",
    ]
  );
  assert.equal(stripeReads, 0);
});

test("fails closed when LiveKit project access cannot be verified read-only", async () => {
  const result = await runDeploymentPreflight({
    env: validEnvironment("preview"),
    liveKitProjectReader: {
      async verifyProjectAccess() {
        throw new Error("credential=DO_NOT_PRINT");
      },
    },
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map((failure) => failure.code),
    ["livekit_project_unreadable"]
  );
  assert.doesNotMatch(result.failures[0]?.message ?? "", /DO_NOT_PRINT/);
});

test("enforces target-specific LiveKit Cloud agent identifiers", async () => {
  const result = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      LIVEKIT_DEMO_AGENT_NAME: "CA_t3sKQEihMQ7x",
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map((failure) => failure.check),
    ["LIVEKIT_DEMO_AGENT_NAME"]
  );
});

test("accepts exact LiveKit dispatch names that are not deployment IDs", async () => {
  const identity = {
    projectHost: "fixture-preview.livekit.cloud",
    demoAgentName: "meelni-preview-demo",
    interviewAgentName: "meelni-preview-interview",
  } as const;
  const result = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      LIVEKIT_DEMO_AGENT_NAME: identity.demoAgentName,
      LIVEKIT_INTERVIEW_AGENT_NAME: identity.interviewAgentName,
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    previewLiveKitIdentity: identity,
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });

  assert.equal(result.ok, true);
});

test("rejects a shared demo and interview dispatch name", async () => {
  const sharedIdentity = {
    projectHost: "fixture-preview.livekit.cloud",
    demoAgentName: "meelni-preview-shared",
    interviewAgentName: "meelni-preview-shared",
  } as const;
  const result = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      LIVEKIT_DEMO_AGENT_NAME: sharedIdentity.demoAgentName,
      LIVEKIT_INTERVIEW_AGENT_NAME: sharedIdentity.interviewAgentName,
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    previewLiveKitIdentity: sharedIdentity,
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map((failure) => failure.check),
    ["livekit.dispatch_separation"]
  );
});

test("accepts the exact committed Preview interview and demo dispatch identity", async () => {
  const result = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      LIVEKIT_DEMO_AGENT_NAME: PREVIEW_LIVEKIT_IDENTITY.demoAgentName,
      LIVEKIT_INTERVIEW_AGENT_NAME: PREVIEW_LIVEKIT_IDENTITY.interviewAgentName,
      LIVEKIT_URL: `wss://${PREVIEW_LIVEKIT_IDENTITY.projectHost}`,
      NEXT_PUBLIC_LIVEKIT_URL: `wss://${PREVIEW_LIVEKIT_IDENTITY.projectHost}`,
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    previewLiveKitIdentity: PREVIEW_LIVEKIT_IDENTITY,
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("rejects Preview Supabase configuration that resolves to Production", async () => {
  const env = validEnvironment("preview");
  const productionRef = "rarrrwkjuhfyfatcmrkw";
  env.DATABASE_URL = `postgresql://postgres.${productionRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
  env.NEXT_PUBLIC_SUPABASE_URL = `https://${productionRef}.supabase.co`;
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabaseJwt(productionRef, "anon");
  env.SUPABASE_SERVICE_ROLE_KEY = supabaseJwt(productionRef, "service_role");
  const result = await runDeploymentPreflight({
    env,
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map(({ check, code }) => ({ check, code })),
    [
      {
        check: "supabase.target_identity",
        code: "environment_identity_mismatch",
      },
    ]
  );
});

test("rejects a self-attested Production anchor", async () => {
  const result = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      MEELNI_PRODUCTION_SUPABASE_PROJECT_REF: "previewpreviewprevie",
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map((failure) => failure.check),
    ["MEELNI_PRODUCTION_SUPABASE_PROJECT_REF"]
  );
});

test("rejects swapped, malformed, cross-project, and issuer-drifted Supabase JWTs", async () => {
  const previewRef = "kxpvidtxznllfosfemdl";
  const cases = [
    {
      name: "swapped roles",
      anon: supabaseJwt(previewRef, "service_role"),
      service: supabaseJwt(previewRef, "anon"),
    },
    {
      name: "malformed tokens",
      anon: "eyJfabricated",
      service: "eyJfabricated",
    },
    {
      name: "cross-project service role",
      anon: supabaseJwt(previewRef, "anon"),
      service: supabaseJwt("anotherpreviewref123", "service_role"),
    },
    {
      name: "issuer drift",
      anon: supabaseJwt(previewRef, "anon"),
      service: supabaseJwt(
        previewRef,
        "service_role",
        `https://${previewRef}.supabase.co/not-auth/v1`
      ),
    },
  ];

  for (const fixture of cases) {
    const result = await runDeploymentPreflight({
      env: {
        ...validEnvironment("preview"),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: fixture.anon,
        SUPABASE_SERVICE_ROLE_KEY: fixture.service,
      },
      liveKitProjectReader: validLiveKitReader(),
      openAiModelReader: validOpenAiReader(),
      stripeCatalogReader: validStripeReader(false),
      target: "preview",
    });
    assert.equal(result.ok, false, fixture.name);
    assert.ok(
      result.failures.some((failure) =>
        ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].includes(
          failure.check
        )
      ),
      fixture.name
    );
  }
});

test("rejects Supabase database and public project drift", async () => {
  const result = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      DATABASE_URL:
        "postgresql://postgres.anotherpreviewref123:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map((failure) => failure.check),
    ["supabase.project_alignment"]
  );
});

test("fails closed when decoded Supabase JWT claims are not accepted by the project", async () => {
  const result = await runDeploymentPreflightWithAuthority({
    env: validEnvironment("preview"),
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    previewLiveKitIdentity: testPreviewLiveKitIdentity,
    stripeCatalogReader: validStripeReader(false),
    supabaseProjectReader: {
      async verifyAnonKey() {
        throw new Error("provider details must stay redacted");
      },
      async verifyServiceRoleKey() {},
    },
    target: "preview",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map((failure) => failure.code),
    ["supabase_project_unreadable"]
  );
  assert.doesNotMatch(result.failures[0]?.message ?? "", /provider details/);
});

test("rejects cross-target Inngest signing keys", async () => {
  for (const [target, signingKey] of [
    ["preview", "signkey-prod-0123456789abcdef"],
    ["production", "signkey-test-0123456789abcdef"],
  ] as const) {
    const result = await runDeploymentPreflight({
      env: { ...validEnvironment(target), INNGEST_SIGNING_KEY: signingKey },
      liveKitProjectReader: validLiveKitReader(),
      openAiModelReader: validOpenAiReader(),
      stripeCatalogReader: validStripeReader(target === "production"),
      target,
    });

    assert.equal(result.ok, false, target);
    assert.deepEqual(
      result.failures.map((failure) => failure.check),
      ["inngest.signing_key_target"],
      target
    );
  }
});

test("accepts the shared Inngest branch key for Preview only", async () => {
  const branchKey = "signkey-branch-0123456789abcdef";
  const preview = await runDeploymentPreflight({
    env: { ...validEnvironment("preview"), INNGEST_SIGNING_KEY: branchKey },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    previewLiveKitIdentity: testPreviewLiveKitIdentity,
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });
  assert.equal(preview.ok, true);

  const production = await runDeploymentPreflight({
    env: { ...validEnvironment("production"), INNGEST_SIGNING_KEY: branchKey },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(true),
    target: "production",
  });
  assert.equal(production.ok, false);
  assert.deepEqual(
    production.failures.map((failure) => failure.check),
    ["inngest.signing_key_target"]
  );
});

test("locks deployment to target-specific owner-controlled relaunch states", async () => {
  const unsafeRehearsal = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      MEELNI_REACTIVATION_DEFAULT: "true",
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });
  assert.equal(unsafeRehearsal.ok, false);
  assert.deepEqual(
    unsafeRehearsal.failures.map((failure) => failure.check),
    ["MEELNI_REACTIVATION_DEFAULT"]
  );

  const previewPrelaunch = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      MEELNI_RELAUNCH_PHASE: "prelaunch",
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });
  assert.equal(previewPrelaunch.ok, false);
  assert.deepEqual(
    previewPrelaunch.failures.map((failure) => failure.check),
    ["MEELNI_RELAUNCH_PHASE"]
  );

  const malformedRehearsalCommit = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      MEELNI_REHEARSAL_COMMIT_SHA: "not-a-full-commit-sha",
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });
  assert.equal(malformedRehearsalCommit.ok, false);
  assert.deepEqual(
    malformedRehearsalCommit.failures.map((failure) => failure.check),
    ["MEELNI_REHEARSAL_COMMIT_SHA"]
  );

  const exactRehearsalCommit = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      MEELNI_REHEARSAL_COMMIT_SHA: "a".repeat(40),
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });
  assert.equal(exactRehearsalCommit.ok, true);

  const staleVercelRehearsalCommit = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      MEELNI_REHEARSAL_COMMIT_SHA: "a".repeat(40),
      VERCEL: "1",
      VERCEL_GIT_COMMIT_REF: "codex/sav-184-deploy-preflight",
      VERCEL_GIT_COMMIT_SHA: "b".repeat(40),
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });
  assert.equal(staleVercelRehearsalCommit.ok, false);
  assert.deepEqual(
    staleVercelRehearsalCommit.failures.map((failure) => failure.check),
    ["MEELNI_REHEARSAL_COMMIT_SHA"]
  );

  const missingVercelRehearsalRef = await runDeploymentPreflight({
    env: {
      ...validEnvironment("preview"),
      MEELNI_REHEARSAL_COMMIT_SHA: "a".repeat(40),
      VERCEL: "1",
      VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });
  assert.equal(missingVercelRehearsalRef.ok, false);
  assert.deepEqual(
    missingVercelRehearsalRef.failures.map((failure) => failure.check),
    ["VERCEL_GIT_COMMIT_REF"]
  );

  const productionRehearsal = await runDeploymentPreflight({
    env: {
      ...validEnvironment("production"),
      MEELNI_RELAUNCH_PHASE: "rehearsal",
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(true),
    target: "production",
  });
  assert.equal(productionRehearsal.ok, false);
  assert.deepEqual(
    productionRehearsal.failures.map((failure) => failure.check),
    ["MEELNI_RELAUNCH_PHASE"]
  );

  const launched = await runDeploymentPreflight({
    env: {
      ...validEnvironment("production"),
      MEELNI_REACTIVATION_DEFAULT: "true",
      MEELNI_RELAUNCH_PHASE: "launched",
    },
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: validOpenAiReader(),
    stripeCatalogReader: validStripeReader(true),
    target: "production",
  });
  assert.equal(launched.ok, false);
  assert.deepEqual(
    launched.failures.map((failure) => failure.check),
    ["MEELNI_REACTIVATION_DEFAULT", "MEELNI_RELAUNCH_PHASE"]
  );
});

test("fails closed when the pinned OpenAI model is not readable", async () => {
  const result = await runDeploymentPreflight({
    env: validEnvironment("preview"),
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: {
      async verifyModelAccess() {
        throw new Error("provider response must stay redacted");
      },
    },
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });

  assert.equal(result.ok, false);
  assert.equal(result.failures[0]?.code, "openai_model_unreadable");
  assert.doesNotMatch(result.failures[0]?.message ?? "", /provider response/);
});

test("bounds stalled provider reads", async () => {
  const startedAt = Date.now();
  const result = await runDeploymentPreflight({
    env: validEnvironment("preview"),
    liveKitProjectReader: validLiveKitReader(),
    openAiModelReader: {
      async verifyModelAccess() {
        await new Promise(() => undefined);
      },
    },
    providerTimeoutMs: 10,
    stripeCatalogReader: validStripeReader(false),
    target: "preview",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map((failure) => failure.code),
    ["openai_model_unreadable"]
  );
  assert.ok(Date.now() - startedAt < 500);
});

function validEnvironment(
  target: DeploymentTarget,
  mode: "live" | "test" = target === "production" ? "live" : "test"
): Record<string, string> {
  const previewRef = "kxpvidtxznllfosfemdl";
  const productionRef = "rarrrwkjuhfyfatcmrkw";
  const projectRef = target === "production" ? productionRef : previewRef;
  return {
    CONTACT_RATE_LIMIT_HMAC_SECRET: "dedicated-secret-82^fQm19!contact-HMAC",
    DATABASE_URL: `postgresql://postgres.${projectRef}:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    DEMO_ABUSE_HMAC_SECRET: "d".repeat(43),
    INNGEST_EVENT_KEY: "inngest-event-key-valid",
    INNGEST_SIGNING_KEY: `signkey-${target === "production" ? "prod" : "test"}-0123456789abcdef`,
    LIVEKIT_API_KEY: "livekit-key-valid",
    LIVEKIT_API_SECRET: "livekit-secret-valid",
    LIVEKIT_DEMO_AGENT_NAME:
      target === "production" ? "CA_t3sKQEihMQ7x" : "CA_previewDemo123",
    LIVEKIT_INTERVIEW_AGENT_NAME:
      target === "production" ? "CA_yawKG67rCMG4" : "CA_previewInterview123",
    LIVEKIT_URL: `wss://${
      target === "production"
        ? PRODUCTION_LIVEKIT_PROJECT_HOST
        : testPreviewLiveKitIdentity.projectHost
    }`,
    MEELNI_INTERVIEW_LLM_MODEL: "openai/gpt-4.1-mini",
    MEELNI_INTERVIEW_STT_MODEL: "deepgram/nova-3",
    MEELNI_INTERVIEW_TTS_EMOTION: "professional",
    MEELNI_INTERVIEW_TTS_MODEL:
      "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
    MEELNI_INTERVIEW_TTS_SPEED: "1.0",
    MEELNI_INTERVIEW_TTS_VOLUME: "1.0",
    MEELNI_INTERVIEW_VOICE: "cgSgspJ2msm6clMCkdW9",
    MEELNI_REACTIVATION_DEFAULT: "false",
    MEELNI_PRODUCTION_SUPABASE_PROJECT_REF: productionRef,
    MEELNI_RELAUNCH_PHASE: target === "production" ? "prelaunch" : "rehearsal",
    NEXT_PUBLIC_APP_URL:
      target === "production"
        ? "https://meelni.com"
        : "https://preview.meelni.com",
    NEXT_PUBLIC_LIVEKIT_URL: `wss://${
      target === "production"
        ? PRODUCTION_LIVEKIT_PROJECT_HOST
        : testPreviewLiveKitIdentity.projectHost
    }`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseJwt(projectRef, "anon"),
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    NEXT_PUBLIC_STATSIG_API_URL: "/api/statsig",
    NEXT_PUBLIC_STATSIG_CLIENT_KEY: "client-validtoken",
    NEXT_PUBLIC_STATSIG_ENVIRONMENT: target,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: `pk_${mode}_publictoken`,
    OPENAI_API_KEY: "sk-validtoken",
    OPENAI_FEEDBACK_MODEL: "gpt-5.1",
    STRIPE_INTERVIEW_PASS_PRICE_ID: "price_pass",
    STRIPE_PRO_MONTHLY_PRICE_ID: "price_pro",
    STRIPE_SECRET_KEY: `rk_${mode}_servertoken`,
    STRIPE_STARTER_MONTHLY_PRICE_ID: "price_starter",
    STRIPE_WEBHOOK_SECRET: "whsec_validtoken",
    SUPABASE_SERVICE_ROLE_KEY: supabaseJwt(projectRef, "service_role"),
  };
}

function supabaseJwt(
  projectRef: string,
  role: "anon" | "service_role",
  issuer = `https://${projectRef}.supabase.co/auth/v1`
): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    iss: issuer,
    ref: projectRef,
    role,
  })}.fixture-signature`;
}

function validStripeReader(livemode: boolean): StripeCatalogReader {
  return {
    async readAccountId() {
      return CANONICAL_STRIPE_ACCOUNT_ID;
    },
    async readPrice(priceId) {
      const catalogId = testPriceIds[priceId as keyof typeof testPriceIds];
      assert.ok(catalogId, "unexpected fixture price ID");
      return evidence(catalogId, livemode);
    },
  };
}

function validLiveKitReader() {
  return {
    async verifyProjectAccess() {},
  };
}

function validOpenAiReader() {
  return {
    async verifyModelAccess(model: string) {
      assert.equal(model, "gpt-5.1");
    },
  };
}

function validSupabaseReader() {
  return {
    async verifyAnonKey() {},
    async verifyServiceRoleKey() {},
  };
}

function evidence(
  catalogId: (typeof testPriceIds)[keyof typeof testPriceIds],
  livemode: boolean
): StripePriceEvidence {
  const catalog = {
    interview_pass: { unitAmount: 900, recurringInterval: null },
    starter: { unitAmount: 1900, recurringInterval: "month" },
    pro: { unitAmount: 4900, recurringInterval: "month" },
  } as const;
  return {
    active: true,
    currency: "usd",
    livemode,
    metadataApp: "meelni",
    metadataCatalogId: catalogId,
    recurringIntervalCount: catalogId === "interview_pass" ? null : 1,
    recurringUsageType: catalogId === "interview_pass" ? null : "licensed",
    ...catalog[catalogId],
  };
}
