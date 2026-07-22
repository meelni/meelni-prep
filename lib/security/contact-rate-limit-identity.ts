import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { isValidServerSecret } from "./server-secret";

export interface ContactRateLimitIdentities {
  attempt: string;
  client: string;
  email: string;
  global: string;
}

interface ContactRateLimitEnvironment {
  CONTACT_RATE_LIMIT_HMAC_SECRET?: string;
  NODE_ENV?: string;
  VERCEL?: string;
}

export function createContactRateLimitIdentities(
  headers: Headers,
  normalizedEmail: string,
  environment: ContactRateLimitEnvironment = process.env
): ContactRateLimitIdentities {
  const { clientAddress, secret } = contactRateLimitIdentityContext(
    headers,
    environment
  );
  return {
    attempt: hmacIdentity(secret, `attempt-client:${clientAddress}`),
    client: hmacIdentity(secret, `client:${clientAddress}`),
    email: hmacIdentity(secret, `email:${normalizedEmail}`),
    global: hmacIdentity(secret, "global:contact-submission"),
  };
}

/**
 * Derives the PII-free client budget before any contact body is read. This
 * keeps malformed and oversized requests inside the durable attempt budget.
 */
export function createContactAttemptRateLimitIdentity(
  headers: Headers,
  environment: ContactRateLimitEnvironment = process.env
): string {
  const { clientAddress, secret } = contactRateLimitIdentityContext(
    headers,
    environment
  );
  return hmacIdentity(secret, `attempt-client:${clientAddress}`);
}

function contactRateLimitIdentityContext(
  headers: Headers,
  environment: ContactRateLimitEnvironment
) {
  const secret = environment.CONTACT_RATE_LIMIT_HMAC_SECRET;
  if (!isValidServerSecret(secret)) {
    throw new Error("contact_rate_limit_secret_unavailable");
  }
  return {
    clientAddress: trustedClientAddress(headers, environment),
    secret,
  };
}

function trustedClientAddress(
  headers: Headers,
  environment: ContactRateLimitEnvironment
): string {
  const isVercel = environment.VERCEL === "1";
  if (environment.NODE_ENV === "production" && !isVercel) {
    throw new Error("contact_trusted_edge_unavailable");
  }

  // Vercel overwrites this header at its edge. In local development only, the
  // ordinary forwarding header is accepted so the endpoint remains testable.
  const rawAddress = isVercel
    ? headers.get("x-vercel-forwarded-for")
    : headers.get("x-forwarded-for");
  const clientAddress = rawAddress?.split(",", 1)[0]?.trim();

  if (!clientAddress || isIP(clientAddress) === 0) {
    throw new Error("contact_trusted_client_address_unavailable");
  }

  return clientAddress;
}

function hmacIdentity(secret: string, identity: string): string {
  return createHmac("sha256", secret).update(identity).digest("hex");
}
