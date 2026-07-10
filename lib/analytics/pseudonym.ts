import { createHmac } from "node:crypto";

const MINIMUM_PSEUDONYM_KEY_LENGTH = 32;

export function createAnalyticsPseudonym(
  subjectId: string,
  key = process.env.ANALYTICS_PSEUDONYM_KEY
): string | null {
  if (!key || key.length < MINIMUM_PSEUDONYM_KEY_LENGTH) return null;
  return `user_${createHmac("sha256", key)
    .update(subjectId)
    .digest("hex")
    .slice(0, 32)}`;
}
