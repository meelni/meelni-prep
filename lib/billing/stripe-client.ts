import Stripe from "stripe";

import {
  getStripeRuntimeEnvironment,
  type StripeRuntimeEnvironmentOptions,
} from "@meelni/integrations";
import { STRIPE_API_VERSION } from "./stripe-catalog";

type StripeConstructor = new (
  key: string,
  config: { apiVersion: Stripe.LatestApiVersion }
) => Stripe;

export class StripeRuntimeConfigurationError extends Error {
  constructor(readonly code: string) {
    super("Stripe runtime configuration is invalid.");
    this.name = "StripeRuntimeConfigurationError";
  }
}

export function createStripeRuntimeClient(
  envSource: Record<string, string | undefined> = process.env,
  StripeClient: StripeConstructor = Stripe,
  options: StripeRuntimeEnvironmentOptions = {}
): Stripe {
  const environment = getStripeRuntimeEnvironment(envSource, options);
  if (!environment.ok) {
    throw new StripeRuntimeConfigurationError(environment.error.code);
  }
  return new StripeClient(environment.data.secretKey, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  });
}
