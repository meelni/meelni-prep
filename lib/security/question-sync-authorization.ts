import { createHash, timingSafeEqual } from "node:crypto";

const MIN_SECRET_LENGTH = 32;
const MAX_SECRET_LENGTH = 256;
const PLACEHOLDER_SECRET =
  /(?:change[-_ ]?me|placeholder|your[-_ ]?(?:cron|operator)?[-_ ]?secret|test[-_ ]?secret|x{3,})/i;

export type QuestionSyncAuthorizationResult =
  | { authorized: true }
  | {
      authorized: false;
      reason: "configuration" | "credentials";
    };

export function isValidQuestionSyncSecret(
  value: string | null | undefined
): value is string {
  if (!value || value !== value.trim()) return false;
  if (value.length < MIN_SECRET_LENGTH || value.length > MAX_SECRET_LENGTH) {
    return false;
  }
  if (/\s|[\u0000-\u001f\u007f]/.test(value)) return false;
  if (PLACEHOLDER_SECRET.test(value)) return false;

  return new Set(value).size >= 8;
}

export function authorizeQuestionSyncRequest(
  authorizationHeader: string | null,
  configuredSecret: string | null | undefined
): QuestionSyncAuthorizationResult {
  if (!isValidQuestionSyncSecret(configuredSecret)) {
    return { authorized: false, reason: "configuration" };
  }

  const suppliedSecret = authorizationHeader?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!suppliedSecret || !secretsMatch(suppliedSecret, configuredSecret)) {
    return { authorized: false, reason: "credentials" };
  }

  return { authorized: true };
}

function secretsMatch(supplied: string, configured: string): boolean {
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  const configuredDigest = createHash("sha256").update(configured).digest();
  return timingSafeEqual(suppliedDigest, configuredDigest);
}
