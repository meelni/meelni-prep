import { resolveDeploymentEnvironment } from "./environment";
import {
  providerFailure,
  providerSuccess,
  type ProviderResult,
} from "./results";

const REQUIRED_BILLING_ENV = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_INTERVIEW_PASS_PRICE_ID",
  "STRIPE_STARTER_MONTHLY_PRICE_ID",
  "STRIPE_PRO_MONTHLY_PRICE_ID",
] as const;

const STRIPE_SERVER_KEY = /^(?:sk|rk)_(test|live)_[A-Za-z0-9]+$/;
const STRIPE_PUBLIC_KEY = /^pk_(test|live)_[A-Za-z0-9]+$/;

export interface StripeRuntimeEnvironment {
  secretKey: string;
  mode: "test" | "live";
}

export interface StripeRuntimeEnvironmentOptions {
  requireCompleteBillingConfiguration?: boolean;
}

export function getStripeRuntimeEnvironment(
  envSource: Record<string, string | undefined> = process.env,
  options: StripeRuntimeEnvironmentOptions = {}
): ProviderResult<StripeRuntimeEnvironment> {
  const deployment = resolveDeploymentEnvironment(envSource);
  if (!deployment.ok) {
    return providerFailure("stripe", {
      code: deployment.code,
      message: deployment.message,
      retryable: false,
    });
  }

  const required = options.requireCompleteBillingConfiguration
    ? REQUIRED_BILLING_ENV
    : (["STRIPE_SECRET_KEY"] as const);
  const missing = required.filter((name) => !hasValue(envSource[name]));
  if (missing.length > 0) {
    return providerFailure("stripe", {
      code: "stripe_env_missing",
      message: `Missing Stripe environment variables: ${missing.join(", ")}`,
      retryable: false,
    });
  }

  const secretKey = envSource.STRIPE_SECRET_KEY!;
  const publishableKey = envSource.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const serverMatch = STRIPE_SERVER_KEY.exec(secretKey);
  const publicMatch = publishableKey
    ? STRIPE_PUBLIC_KEY.exec(publishableKey)
    : undefined;
  if (!serverMatch || (publishableKey && !publicMatch)) {
    return providerFailure("stripe", {
      code: "stripe_key_mode_invalid",
      message: "Stripe server and publishable keys must use recognized modes.",
      retryable: false,
    });
  }

  const serverMode = serverMatch[1] as "test" | "live";
  const publicMode = publicMatch?.[1] as "test" | "live" | undefined;
  if (publicMode && serverMode !== publicMode) {
    return providerFailure("stripe", {
      code: "stripe_key_mode_mismatch",
      message: "Stripe server and publishable keys use different modes.",
      retryable: false,
    });
  }

  const expectedMode =
    deployment.environment === "production" ? "live" : "test";
  if (serverMode !== expectedMode) {
    return providerFailure("stripe", {
      code: "stripe_environment_mode_mismatch",
      message: `Stripe ${expectedMode} mode is required for this deployment environment.`,
      retryable: false,
    });
  }

  return providerSuccess("stripe", { secretKey, mode: serverMode });
}

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
