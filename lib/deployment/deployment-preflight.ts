import {
  PRICE_ENV_BY_CATALOG_ID,
  type StripeCheckoutCatalogId,
} from "@/lib/billing/stripe-catalog";
import { BILLING_CATALOG } from "@meelni/core";
import { ACCEPTED_FEEDBACK_MODEL } from "@/lib/evaluation/model-config";
import {
  getProviderEnvContract,
  inferSupabaseDatabaseProjectRef,
  inferSupabaseProjectRef,
  isSupabaseProjectRef,
  resolveLiveKitDeploymentCapability,
  type LiveKitDeploymentCapability,
} from "@meelni/integrations";
import {
  EXPECTED_PREVIEW_SUPABASE_PROJECT_REF,
  EXPECTED_PRODUCTION_SUPABASE_PROJECT_REF,
  readSupabaseJwtClaims,
  supabaseJwtMatchesIdentity,
} from "@/lib/supabase/supabase-jwt.mjs";
import { isValidPublicDemoSecret } from "@/lib/security/public-demo-secret";
import { isValidServerSecret } from "@/lib/security/server-secret";
export type DeploymentTarget = "preview" | "production";

export const PRODUCTION_LIVEKIT_PROJECT_HOST = "meelni-ek4vaisp.livekit.cloud";
export const CANONICAL_STRIPE_ACCOUNT_ID = "acct_1SSreECdoT5hfbsF";

export interface LiveKitDeploymentIdentity {
  projectHost: string;
  demoAgentName?: string;
  interviewAgentName: string;
}

export interface StripePriceEvidence {
  active: boolean;
  currency: string;
  livemode: boolean;
  metadataApp?: string;
  metadataCatalogId?: string;
  recurringInterval: string | null;
  recurringIntervalCount: number | null;
  recurringUsageType: string | null;
  unitAmount: number | null;
}

export interface StripeCatalogReader {
  readAccountId(): Promise<string>;
  readPrice(priceId: string): Promise<StripePriceEvidence>;
}

export interface LiveKitProjectReader {
  verifyProjectAccess(): Promise<void>;
}

export interface OpenAiModelReader {
  verifyModelAccess(model: string): Promise<void>;
}

export interface SupabaseProjectReader {
  verifyAnonKey(): Promise<void>;
  verifyServiceRoleKey(): Promise<void>;
  verifyPublishedQuestionBank(): Promise<void>;
}

export type DeploymentPreflightFailureCode =
  | "blank_or_missing"
  | "invalid_format"
  | "mixed_stripe_mode"
  | "wrong_stripe_mode"
  | "duplicate_price_id"
  | "environment_identity_mismatch"
  | "livekit_project_unreadable"
  | "openai_model_unreadable"
  | "supabase_project_unreadable"
  | "question_bank_unavailable"
  | "stripe_price_unreadable"
  | "stripe_account_mismatch"
  | "stripe_price_mismatch";

export interface DeploymentPreflightFailure {
  area:
    | "contact"
    | "inngest"
    | "openai"
    | "livekit"
    | "statsig"
    | "stripe"
    | "supabase"
    | "question_bank";
  code: DeploymentPreflightFailureCode;
  check: string;
  message: string;
}

export interface DeploymentPreflightResult {
  failures: DeploymentPreflightFailure[];
  liveKitCapability: LiveKitDeploymentCapability;
  ok: boolean;
  target: DeploymentTarget;
  passedChecks: string[];
  skippedChecks: DeploymentPreflightSkip[];
}

export interface DeploymentPreflightSkip {
  area: "livekit";
  check: "livekit.configuration_and_project_access";
  reason: "intentionally_disabled_for_generic_preview";
}

type Environment = Record<string, string | undefined>;

const STRIPE_CATALOG_IDS = Object.keys(
  PRICE_ENV_BY_CATALOG_ID
) as StripeCheckoutCatalogId[];

const PLACEHOLDER_VALUE =
  /(?:^|[-_])(?:x{2,}|your(?:[-_][a-z0-9]+)*|replace(?:[-_][a-z0-9]+)*|changeme|todo|redacted|placeholder|example|dummy|fake)(?:$|[-_])/i;

const ACCEPTED_LIVEKIT_AGENT_NAMES = {
  LIVEKIT_DEMO_AGENT_NAME: "CA_t3sKQEihMQ7x",
  LIVEKIT_INTERVIEW_AGENT_NAME: "CA_yawKG67rCMG4",
} as const;

const INTERVIEW_RUNTIME_STRING_ENV_NAMES = [
  "MEELNI_INTERVIEW_STT_MODEL",
  "MEELNI_INTERVIEW_LLM_MODEL",
  "MEELNI_INTERVIEW_TTS_MODEL",
  "MEELNI_INTERVIEW_VOICE",
  "MEELNI_INTERVIEW_TTS_EMOTION",
] as const;

const INTERVIEW_RUNTIME_NUMBER_ENV_CONTRACTS = {
  MEELNI_INTERVIEW_TTS_SPEED: { min: 0.6, max: 1.5 },
  MEELNI_INTERVIEW_TTS_VOLUME: { min: 0.5, max: 2 },
} as const;

const DECIMAL_OR_EXPONENT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;

export async function runDeploymentPreflight({
  env,
  liveKitProjectReader,
  openAiModelReader,
  previewLiveKitIdentity,
  providerTimeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  supabaseProjectReader,
  stripeCatalogReader,
  target,
}: {
  env: Environment;
  liveKitProjectReader?: LiveKitProjectReader;
  openAiModelReader?: OpenAiModelReader;
  previewLiveKitIdentity?: LiveKitDeploymentIdentity;
  providerTimeoutMs?: number;
  supabaseProjectReader?: SupabaseProjectReader;
  stripeCatalogReader?: StripeCatalogReader;
  target: DeploymentTarget;
}): Promise<DeploymentPreflightResult> {
  const failures: DeploymentPreflightFailure[] = [];
  const passedChecks: string[] = [];
  const skippedChecks: DeploymentPreflightSkip[] = [];
  const liveKitCapability = resolveLiveKitDeploymentCapability(env);

  validateSupabaseEnvironment({ env, failures, target, passedChecks });
  validateStripeEnvironment({ env, failures, target, passedChecks });
  validateInngestEnvironment({ env, failures, target, passedChecks });
  validateOpenAiEnvironment({ env, failures, passedChecks });
  if (liveKitCapability.mode === "disabled") {
    skippedChecks.push({
      area: "livekit",
      check: "livekit.configuration_and_project_access",
      reason: "intentionally_disabled_for_generic_preview",
    });
  } else {
    validateLiveKitEnvironment({
      env,
      failures,
      passedChecks,
      previewLiveKitIdentity,
      target,
    });
  }
  validateStatsigEnvironment({ env, failures, target, passedChecks });
  validateContactEnvironment({ env, failures, passedChecks });

  if (failures.some((failure) => failure.area === "contact")) {
    return {
      failures,
      liveKitCapability,
      ok: false,
      target,
      passedChecks,
      skippedChecks,
    };
  }

  let supabaseCredentialsVerified = false;
  if (!failures.some((failure) => failure.area === "supabase")) {
    if (!supabaseProjectReader) {
      failures.push({
        area: "supabase",
        code: "supabase_project_unreadable",
        check: "supabase.credentials.read_only",
        message:
          "Supabase credentials were not verified through the read-only adapter.",
      });
    } else {
      try {
        await withTimeout(
          Promise.all([
            supabaseProjectReader.verifyAnonKey(),
            supabaseProjectReader.verifyServiceRoleKey(),
          ]),
          providerTimeoutMs
        );
        passedChecks.push("supabase.credentials.read_only");
        supabaseCredentialsVerified = true;
      } catch {
        failures.push({
          area: "supabase",
          code: "supabase_project_unreadable",
          check: "supabase.credentials.read_only",
          message: "Supabase credentials could not be verified read-only.",
        });
      }
    }
  }

  if (
    target === "production" &&
    supabaseCredentialsVerified &&
    supabaseProjectReader
  ) {
    try {
      await withTimeout(
        supabaseProjectReader.verifyPublishedQuestionBank(),
        providerTimeoutMs
      );
      passedChecks.push("question_bank.published_rounds");
    } catch {
      failures.push({
        area: "question_bank",
        code: "question_bank_unavailable",
        check: "question_bank.published_rounds",
        message:
          "The target database must contain a published question for every interview round.",
      });
    }
  }

  if (!failures.some((failure) => failure.area === "openai")) {
    const model = normalizedValue(env.OPENAI_FEEDBACK_MODEL);
    if (!openAiModelReader || !model) {
      failures.push({
        area: "openai",
        code: "openai_model_unreadable",
        check: "openai.model.read_only",
        message:
          "OpenAI model access was not verified through the read-only adapter.",
      });
    } else {
      try {
        await withTimeout(
          openAiModelReader.verifyModelAccess(model),
          providerTimeoutMs
        );
        passedChecks.push("openai.model.read_only");
      } catch {
        failures.push({
          area: "openai",
          code: "openai_model_unreadable",
          check: "openai.model.read_only",
          message: "OpenAI model access could not be verified read-only.",
        });
      }
    }
  }

  if (
    liveKitCapability.mode === "enabled" &&
    !failures.some((failure) => failure.area === "livekit")
  ) {
    if (!liveKitProjectReader) {
      failures.push({
        area: "livekit",
        code: "livekit_project_unreadable",
        check: "livekit.project.read_only",
        message:
          "LiveKit project access was not verified through the read-only adapter.",
      });
    } else {
      try {
        await withTimeout(
          liveKitProjectReader.verifyProjectAccess(),
          providerTimeoutMs
        );
        passedChecks.push("livekit.project.read_only");
      } catch {
        failures.push({
          area: "livekit",
          code: "livekit_project_unreadable",
          check: "livekit.project.read_only",
          message: "LiveKit project access could not be verified read-only.",
        });
      }
    }
  }

  if (!failures.some((failure) => failure.area === "stripe")) {
    if (!stripeCatalogReader) {
      failures.push({
        area: "stripe",
        code: "stripe_price_unreadable",
        check: "stripe.catalog.read_only",
        message:
          "Stripe catalog prices were not verified through the read-only adapter.",
      });
    } else {
      await verifyStripeCatalog({
        env,
        failures,
        stripeCatalogReader,
        target,
        passedChecks,
        providerTimeoutMs,
      });
    }
  }

  return {
    failures,
    liveKitCapability,
    ok: failures.length === 0,
    target,
    passedChecks,
    skippedChecks,
  };
}

function validateContactEnvironment({
  env,
  failures,
  passedChecks,
}: ValidationContext) {
  const initialFailureCount = failures.length;
  const secret = requireValue(
    env,
    "CONTACT_RATE_LIMIT_HMAC_SECRET",
    "contact",
    failures
  );
  validateFormat({
    area: "contact",
    check: "CONTACT_RATE_LIMIT_HMAC_SECRET",
    failures,
    ok: !secret || isValidServerSecret(secret),
  });
  if (secret && failures.length === initialFailureCount) {
    passedChecks.push("contact.rate_limit_hmac_secret");
  }
}

function validateSupabaseEnvironment({
  env,
  failures,
  target,
  passedChecks,
}: ValidationContext & { target: DeploymentTarget }) {
  const initialFailureCount = failures.length;
  const contract = getProviderEnvContract("supabase");
  const requiredNames = [
    ...contract.required.map(({ name }) => name),
    "MEELNI_PRODUCTION_SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY",
  ] as const;
  const values = Object.fromEntries(
    requiredNames.map((name) => [
      name,
      requireValue(env, name, "supabase", failures),
    ])
  );

  const databaseRef = inferSupabaseDatabaseProjectRef(values.DATABASE_URL);
  const publicRef = inferSupabaseProjectRef(values.NEXT_PUBLIC_SUPABASE_URL);
  const productionRef = values.MEELNI_PRODUCTION_SUPABASE_PROJECT_REF;
  const anonClaims = readSupabaseJwtClaims(
    values.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const expectedIssuer = anonClaims?.iss;

  validateFormat({
    area: "supabase",
    check: "DATABASE_URL",
    failures,
    ok: !values.DATABASE_URL || Boolean(databaseRef),
  });
  validateFormat({
    area: "supabase",
    check: "NEXT_PUBLIC_SUPABASE_URL",
    failures,
    ok: !values.NEXT_PUBLIC_SUPABASE_URL || Boolean(publicRef),
  });
  validateFormat({
    area: "supabase",
    check: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    failures,
    ok:
      !values.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      Boolean(
        publicRef &&
          expectedIssuer &&
          supabaseJwtMatchesIdentity(values.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
            expectedProjectRef: publicRef,
            expectedRole: "anon",
            expectedIssuer,
          })
      ),
  });
  validateFormat({
    area: "supabase",
    check: "SUPABASE_SERVICE_ROLE_KEY",
    failures,
    ok:
      !values.SUPABASE_SERVICE_ROLE_KEY ||
      Boolean(
        publicRef &&
          expectedIssuer &&
          supabaseJwtMatchesIdentity(values.SUPABASE_SERVICE_ROLE_KEY, {
            expectedProjectRef: publicRef,
            expectedRole: "service_role",
            expectedIssuer,
          })
      ),
  });
  validateFormat({
    area: "supabase",
    check: "MEELNI_PRODUCTION_SUPABASE_PROJECT_REF",
    failures,
    ok:
      !productionRef ||
      (isSupabaseProjectRef(productionRef) &&
        productionRef === EXPECTED_PRODUCTION_SUPABASE_PROJECT_REF),
  });

  if (databaseRef && publicRef && databaseRef !== publicRef) {
    identityFailure(
      failures,
      "supabase.project_alignment",
      "Database and public Supabase configuration identify different projects."
    );
  }
  if (
    values.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    values.SUPABASE_SERVICE_ROLE_KEY &&
    values.NEXT_PUBLIC_SUPABASE_ANON_KEY === values.SUPABASE_SERVICE_ROLE_KEY
  ) {
    identityFailure(
      failures,
      "supabase.key_role_separation",
      "Supabase anonymous and service-role credentials must be distinct."
    );
  }
  if (publicRef) {
    if (
      target === "preview" &&
      publicRef !== EXPECTED_PREVIEW_SUPABASE_PROJECT_REF
    ) {
      identityFailure(
        failures,
        "supabase.target_identity",
        "Preview Supabase configuration does not match the canonical Preview project."
      );
    }
    if (
      target === "production" &&
      publicRef !== EXPECTED_PRODUCTION_SUPABASE_PROJECT_REF
    ) {
      identityFailure(
        failures,
        "supabase.target_identity",
        "Production Supabase configuration does not match the declared Production project."
      );
    }
  }

  if (failures.length === initialFailureCount) {
    passedChecks.push("supabase.declared_target_identity");
  }
}

function validateStripeEnvironment({
  env,
  failures,
  target,
  passedChecks,
}: {
  env: Environment;
  failures: DeploymentPreflightFailure[];
  target: DeploymentTarget;
  passedChecks: string[];
}) {
  const secretKey = requireValue(env, "STRIPE_SECRET_KEY", "stripe", failures);
  const publishableKey = requireValue(
    env,
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "stripe",
    failures
  );
  const webhookSecret = requireValue(
    env,
    "STRIPE_WEBHOOK_SECRET",
    "stripe",
    failures
  );

  const secretMode = stripeKeyMode(secretKey, /^(?:sk|rk)_(test|live)_\S+$/);
  const publishableMode = stripeKeyMode(publishableKey, /^pk_(test|live)_\S+$/);
  const expectedMode = target === "production" ? "live" : "test";

  validateFormat({
    area: "stripe",
    check: "STRIPE_SECRET_KEY",
    failures,
    ok: !secretKey || Boolean(secretMode),
  });
  validateFormat({
    area: "stripe",
    check: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    failures,
    ok: !publishableKey || Boolean(publishableMode),
  });
  validateFormat({
    area: "stripe",
    check: "STRIPE_WEBHOOK_SECRET",
    failures,
    ok: !webhookSecret || /^whsec_\S+$/.test(webhookSecret),
  });

  if (secretMode && publishableMode && secretMode !== publishableMode) {
    failures.push({
      area: "stripe",
      code: "mixed_stripe_mode",
      check: "stripe.key_mode",
      message: "Stripe server and publishable keys use different modes.",
    });
  } else if (
    (secretMode && secretMode !== expectedMode) ||
    (publishableMode && publishableMode !== expectedMode)
  ) {
    failures.push({
      area: "stripe",
      code: "wrong_stripe_mode",
      check: "stripe.key_mode",
      message: `${target} requires Stripe ${expectedMode} mode.`,
    });
  } else if (secretMode && publishableMode) {
    passedChecks.push("stripe.key_mode");
  }

  const priceIds = STRIPE_CATALOG_IDS.flatMap((catalogId) => {
    const envName = PRICE_ENV_BY_CATALOG_ID[catalogId];
    const priceId = requireValue(env, envName, "stripe", failures);
    validateFormat({
      area: "stripe",
      check: envName,
      failures,
      ok: !priceId || /^price_\S+$/.test(priceId),
    });
    return priceId ? [priceId] : [];
  });

  if (new Set(priceIds).size !== priceIds.length) {
    failures.push({
      area: "stripe",
      code: "duplicate_price_id",
      check: "stripe.catalog.unique_prices",
      message: "Stripe catalog entries must use three distinct price IDs.",
    });
  } else if (priceIds.length === STRIPE_CATALOG_IDS.length) {
    passedChecks.push("stripe.catalog.unique_prices");
  }
}

async function verifyStripeCatalog({
  env,
  failures,
  stripeCatalogReader,
  target,
  passedChecks,
  providerTimeoutMs,
}: {
  env: Environment;
  failures: DeploymentPreflightFailure[];
  stripeCatalogReader: StripeCatalogReader;
  target: DeploymentTarget;
  passedChecks: string[];
  providerTimeoutMs: number;
}) {
  const expectedLivemode = target === "production";

  try {
    const accountId = await withTimeout(
      stripeCatalogReader.readAccountId(),
      providerTimeoutMs
    );
    if (accountId !== CANONICAL_STRIPE_ACCOUNT_ID) {
      failures.push({
        area: "stripe",
        code: "stripe_account_mismatch",
        check: "stripe.account",
        message:
          "Stripe credentials do not identify the canonical Meelni account.",
      });
      return;
    }
    passedChecks.push("stripe.account");
  } catch {
    failures.push({
      area: "stripe",
      code: "stripe_price_unreadable",
      check: "stripe.account",
      message: "Stripe account identity could not be verified read-only.",
    });
    return;
  }

  const priceReads = await Promise.all(
    STRIPE_CATALOG_IDS.map(async (catalogId) => {
      const priceId = env[PRICE_ENV_BY_CATALOG_ID[catalogId]]?.trim();
      if (!priceId) return { catalogId } as const;
      try {
        return {
          catalogId,
          evidence: await withTimeout(
            stripeCatalogReader.readPrice(priceId),
            providerTimeoutMs
          ),
        } as const;
      } catch {
        return { catalogId, unreadable: true } as const;
      }
    })
  );

  for (const read of priceReads) {
    const { catalogId } = read;
    if ("unreadable" in read) {
      failures.push({
        area: "stripe",
        code: "stripe_price_unreadable",
        check: `stripe.catalog.${catalogId}`,
        message: `Stripe catalog price for ${catalogId} could not be verified read-only.`,
      });
      continue;
    }
    if (!("evidence" in read) || !read.evidence) continue;
    const { evidence } = read;

    const expected = BILLING_CATALOG[catalogId];
    const expectedRecurringInterval =
      expected.interval === "none" ? null : expected.interval;
    const expectedRecurringIntervalCount =
      expectedRecurringInterval === null ? null : 1;
    const expectedRecurringUsageType =
      expectedRecurringInterval === null ? null : "licensed";
    const matches =
      evidence.active &&
      evidence.livemode === expectedLivemode &&
      evidence.currency === expected.currency &&
      evidence.unitAmount === expected.priceInCents &&
      evidence.recurringInterval === expectedRecurringInterval &&
      evidence.recurringIntervalCount === expectedRecurringIntervalCount &&
      evidence.recurringUsageType === expectedRecurringUsageType &&
      evidence.metadataApp === "meelni" &&
      evidence.metadataCatalogId === catalogId;

    if (!matches) {
      failures.push({
        area: "stripe",
        code: "stripe_price_mismatch",
        check: `stripe.catalog.${catalogId}`,
        message: `Stripe catalog price for ${catalogId} does not match the accepted ${target} contract.`,
      });
      continue;
    }

    passedChecks.push(`stripe.catalog.${catalogId}`);
  }
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number
): Promise<T> {
  const boundedTimeout =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.floor(timeoutMs)
      : DEFAULT_PROVIDER_TIMEOUT_MS;
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Provider read timed out")),
      boundedTimeout
    );
    operation.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function validateInngestEnvironment({
  env,
  failures,
  target,
  passedChecks,
}: ValidationContext & { target: DeploymentTarget }) {
  const initialFailureCount = failures.length;
  const eventKey = requireValue(env, "INNGEST_EVENT_KEY", "inngest", failures);
  const signingKey = requireValue(
    env,
    "INNGEST_SIGNING_KEY",
    "inngest",
    failures
  );
  validateFormat({
    area: "inngest",
    check: "INNGEST_EVENT_KEY",
    failures,
    ok: !eventKey || /^\S{16,}$/.test(eventKey),
  });
  validateFormat({
    area: "inngest",
    check: "INNGEST_SIGNING_KEY",
    failures,
    ok:
      !signingKey ||
      /^signkey-(?:branch|prod|production|preview|test)-[a-f0-9]{16,}$/i.test(
        signingKey
      ),
  });
  const signingEnvironment = signingKey
    ? /^signkey-(branch|prod|production|preview|test)-/i
        .exec(signingKey)?.[1]
        ?.toLowerCase()
    : undefined;
  if (
    signingEnvironment &&
    ((target === "production" &&
      signingEnvironment !== "prod" &&
      signingEnvironment !== "production") ||
      (target === "preview" &&
        signingEnvironment !== "branch" &&
        signingEnvironment !== "preview" &&
        signingEnvironment !== "test"))
  ) {
    identityFailure(
      failures,
      "inngest.signing_key_target",
      "Inngest signing key does not match the deployment target."
    );
  }
  if (eventKey && signingKey && failures.length === initialFailureCount) {
    passedChecks.push("inngest.credential_shape");
  }
}

function validateOpenAiEnvironment({
  env,
  failures,
  passedChecks,
}: ValidationContext) {
  const initialFailureCount = failures.length;
  const apiKey = requireValue(env, "OPENAI_API_KEY", "openai", failures);
  const model = requireValue(env, "OPENAI_FEEDBACK_MODEL", "openai", failures);
  validateFormat({
    area: "openai",
    check: "OPENAI_API_KEY",
    failures,
    ok: !apiKey || /^sk-\S+$/.test(apiKey),
  });
  validateFormat({
    area: "openai",
    check: "OPENAI_FEEDBACK_MODEL",
    failures,
    ok: !model || model === ACCEPTED_FEEDBACK_MODEL,
  });
  if (apiKey && model && failures.length === initialFailureCount) {
    passedChecks.push("openai.credential_shape_and_model_pin");
  }
}

function validateLiveKitEnvironment({
  env,
  failures,
  passedChecks,
  previewLiveKitIdentity,
  target,
}: ValidationContext & {
  previewLiveKitIdentity?: LiveKitDeploymentIdentity;
  target: DeploymentTarget;
}) {
  const initialFailureCount = failures.length;
  const required = [
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "DEMO_ABUSE_HMAC_SECRET",
    "LIVEKIT_INTERVIEW_AGENT_NAME",
    "LIVEKIT_DEMO_AGENT_NAME",
    ...INTERVIEW_RUNTIME_STRING_ENV_NAMES,
    ...Object.keys(INTERVIEW_RUNTIME_NUMBER_ENV_CONTRACTS),
  ] as const;
  const complete = required
    .map((name) => requireValue(env, name, "livekit", failures))
    .every(Boolean);
  const publicDemoSecret = normalizedValue(env.DEMO_ABUSE_HMAC_SECRET);
  validateFormat({
    area: "livekit",
    check: "DEMO_ABUSE_HMAC_SECRET",
    failures,
    ok: !publicDemoSecret || isValidPublicDemoSecret(publicDemoSecret),
  });
  for (const name of [
    "LIVEKIT_INTERVIEW_AGENT_NAME",
    "LIVEKIT_DEMO_AGENT_NAME",
  ] as const) {
    const value = normalizedValue(env[name]);
    const expectedValue =
      target === "production"
        ? ACCEPTED_LIVEKIT_AGENT_NAMES[name]
        : name === "LIVEKIT_DEMO_AGENT_NAME"
          ? previewLiveKitIdentity?.demoAgentName
          : previewLiveKitIdentity?.interviewAgentName;
    validateFormat({
      area: "livekit",
      check: name,
      failures,
      ok:
        !value ||
        (/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) &&
          Boolean(expectedValue) &&
          value === expectedValue),
    });
  }
  const interviewAgentName = normalizedValue(env.LIVEKIT_INTERVIEW_AGENT_NAME);
  const demoAgentName = normalizedValue(env.LIVEKIT_DEMO_AGENT_NAME);
  if (
    interviewAgentName &&
    demoAgentName &&
    interviewAgentName === demoAgentName
  ) {
    failures.push({
      area: "livekit",
      code: "invalid_format",
      check: "livekit.dispatch_separation",
      message:
        "Demo and interview rooms require distinct agent dispatch names.",
    });
  }
  for (const [name, contract] of Object.entries(
    INTERVIEW_RUNTIME_NUMBER_ENV_CONTRACTS
  )) {
    const value = normalizedValue(env[name]);
    const parsed =
      value && DECIMAL_OR_EXPONENT.test(value) ? Number(value) : NaN;
    validateFormat({
      area: "livekit",
      check: name,
      failures,
      ok:
        !value ||
        (Number.isFinite(parsed) &&
          parsed >= contract.min &&
          parsed <= contract.max),
    });
  }
  const publicUrl = requireValue(
    env,
    "NEXT_PUBLIC_LIVEKIT_URL",
    "livekit",
    failures
  );
  const serverUrl = requireValue(env, "LIVEKIT_URL", "livekit", failures);

  for (const [name, value] of [
    ["NEXT_PUBLIC_LIVEKIT_URL", publicUrl],
    ["LIVEKIT_URL", serverUrl],
  ] as const) {
    validateFormat({
      area: "livekit",
      check: name,
      failures,
      ok: !value || /^wss:\/\/[a-z0-9.-]+\.livekit\.cloud\/?$/i.test(value),
    });
  }

  const serverProjectHost = liveKitProjectHost(serverUrl);
  const expectedProjectHost =
    target === "production"
      ? PRODUCTION_LIVEKIT_PROJECT_HOST
      : previewLiveKitIdentity?.projectHost;
  if (
    serverUrl &&
    (!expectedProjectHost || serverProjectHost !== expectedProjectHost)
  ) {
    failures.push({
      area: "livekit",
      code: "environment_identity_mismatch",
      check: "livekit.target_project",
      message:
        target === "production"
          ? "Production LiveKit configuration does not identify the canonical Production project."
          : "Preview LiveKit configuration does not identify a provisioned canonical Preview project.",
    });
  }

  if (
    publicUrl &&
    serverUrl &&
    normalizeUrl(publicUrl) !== normalizeUrl(serverUrl)
  ) {
    failures.push({
      area: "livekit",
      code: "invalid_format",
      check: "livekit.websocket_alignment",
      message:
        "Public and server LiveKit websocket URLs must identify the same project.",
    });
  } else if (
    complete &&
    publicUrl &&
    serverUrl &&
    failures.length === initialFailureCount
  ) {
    passedChecks.push("livekit.configuration_contract");
  }
}

function validateStatsigEnvironment({
  env,
  failures,
  target,
  passedChecks,
}: ValidationContext & { target: DeploymentTarget }) {
  const initialFailureCount = failures.length;
  const clientKey = requireValue(
    env,
    "NEXT_PUBLIC_STATSIG_CLIENT_KEY",
    "statsig",
    failures
  );
  const tier = requireValue(
    env,
    "NEXT_PUBLIC_STATSIG_ENVIRONMENT",
    "statsig",
    failures
  );
  const apiUrl = requireValue(
    env,
    "NEXT_PUBLIC_STATSIG_API_URL",
    "statsig",
    failures
  );
  const fallback = requireValue(
    env,
    "MEELNI_REACTIVATION_DEFAULT",
    "statsig",
    failures
  );
  const phase = requireValue(env, "MEELNI_RELAUNCH_PHASE", "statsig", failures);
  const rehearsalCommitSha =
    target === "preview"
      ? normalizedValue(env.MEELNI_REHEARSAL_COMMIT_SHA)
      : undefined;
  const vercelDeploymentCommitSha =
    target === "preview" && normalizedValue(env.VERCEL) === "1"
      ? normalizedValue(env.VERCEL_GIT_COMMIT_SHA)
      : undefined;
  const vercelDeploymentGitRef =
    target === "preview" && normalizedValue(env.VERCEL) === "1"
      ? normalizedValue(env.VERCEL_GIT_COMMIT_REF)
      : undefined;

  validateFormat({
    area: "statsig",
    check: "NEXT_PUBLIC_STATSIG_CLIENT_KEY",
    failures,
    ok: !clientKey || /^client-\S+$/.test(clientKey),
  });
  validateFormat({
    area: "statsig",
    check: "MEELNI_REHEARSAL_COMMIT_SHA",
    failures,
    ok:
      target !== "preview" ||
      !rehearsalCommitSha ||
      (/^[0-9a-f]{40}$/.test(rehearsalCommitSha) &&
        (normalizedValue(env.VERCEL) !== "1" ||
          rehearsalCommitSha === vercelDeploymentCommitSha)),
  });
  validateFormat({
    area: "statsig",
    check: "VERCEL_GIT_COMMIT_REF",
    failures,
    ok:
      target !== "preview" ||
      !rehearsalCommitSha ||
      normalizedValue(env.VERCEL) !== "1" ||
      (Boolean(vercelDeploymentGitRef) &&
        (vercelDeploymentGitRef?.length ?? 0) <= 255 &&
        !/[\u0000-\u001f\u007f]/.test(vercelDeploymentGitRef ?? "")),
  });
  validateFormat({
    area: "statsig",
    check: "NEXT_PUBLIC_STATSIG_ENVIRONMENT",
    failures,
    ok: !tier || tier === target,
  });
  validateFormat({
    area: "statsig",
    check: "NEXT_PUBLIC_STATSIG_API_URL",
    failures,
    ok: !apiUrl || normalizeUrl(apiUrl) === "/api/statsig",
  });
  validateFormat({
    area: "statsig",
    check: "MEELNI_REACTIVATION_DEFAULT",
    failures,
    ok:
      !fallback ||
      (target === "preview"
        ? fallback === "false"
        : phase === "launched"
          ? fallback === "true"
          : fallback === "false"),
  });
  validateFormat({
    area: "statsig",
    check: "MEELNI_RELAUNCH_PHASE",
    failures,
    ok:
      !phase ||
      (target === "preview"
        ? phase === "rehearsal"
        : phase === "prelaunch" || phase === "launched"),
  });

  if (
    clientKey &&
    tier &&
    apiUrl &&
    fallback &&
    phase &&
    failures.length === initialFailureCount
  ) {
    passedChecks.push("statsig.credential_shape_proxy_and_phase_fallback");
  }
}

function identityFailure(
  failures: DeploymentPreflightFailure[],
  check: string,
  message: string
) {
  failures.push({
    area: check.startsWith("inngest") ? "inngest" : "supabase",
    code: "environment_identity_mismatch",
    check,
    message,
  });
}

interface ValidationContext {
  env: Environment;
  failures: DeploymentPreflightFailure[];
  passedChecks: string[];
}

function requireValue(
  env: Environment,
  name: string,
  area: DeploymentPreflightFailure["area"],
  failures: DeploymentPreflightFailure[]
): string | undefined {
  const value = normalizedValue(env[name]);
  if (!value || PLACEHOLDER_VALUE.test(value)) {
    failures.push({
      area,
      code: "blank_or_missing",
      check: name,
      message: `${name} must be configured with a nonblank, non-placeholder value.`,
    });
    return undefined;
  }
  return value;
}

function normalizedValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '""' || trimmed === "''") return undefined;
  return trimmed;
}

function stripeKeyMode(
  value: string | undefined,
  pattern: RegExp
): "live" | "test" | undefined {
  if (!value) return undefined;
  return pattern.exec(value)?.[1] as "live" | "test" | undefined;
}

function validateFormat({
  area,
  check,
  failures,
  ok,
}: {
  area: DeploymentPreflightFailure["area"];
  check: string;
  failures: DeploymentPreflightFailure[];
  ok: boolean;
}) {
  if (ok) return;
  failures.push({
    area,
    code: "invalid_format",
    check,
    message: `${check} does not match the accepted deployment contract.`,
  });
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function liveKitProjectHost(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "wss:" ? url.hostname.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}
