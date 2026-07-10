import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export interface ContactRateLimitIdentities {
  client: string;
  email: string;
  global: string;
}

interface ContactRateLimitEnvironment {
  CONTACT_RATE_LIMIT_HMAC_SECRET?: string;
  NODE_ENV?: string;
  VERCEL?: string;
}

const PLACEHOLDER_SECRET =
  /(?:change[-_ ]?me|placeholder|your[-_ ]?(?:contact)?[-_ ]?secret|test[-_ ]?secret|x{3,})/i;

export function createContactRateLimitIdentities(
  headers: Headers,
  normalizedEmail: string,
  environment: ContactRateLimitEnvironment = process.env
): ContactRateLimitIdentities {
  const secret = environment.CONTACT_RATE_LIMIT_HMAC_SECRET;
  if (!isValidContactRateLimitSecret(secret)) {
    throw new Error("contact_rate_limit_secret_unavailable");
  }

  const clientAddress = trustedClientAddress(headers, environment);
  return {
    client: hmacIdentity(secret, `client:${clientAddress}`),
    email: hmacIdentity(secret, `email:${normalizedEmail}`),
    global: hmacIdentity(secret, "global:contact-submission"),
  };
}

export function isValidContactRateLimitSecret(
  secret: string | undefined
): secret is string {
  return Boolean(
    secret &&
      secret === secret.trim() &&
      secret.length >= 32 &&
      secret.length <= 256 &&
      !/\s|[\u0000-\u001f\u007f]/.test(secret) &&
      !PLACEHOLDER_SECRET.test(secret) &&
      new Set(secret).size >= 8
  );
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
