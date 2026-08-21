export const PRODUCTION_WEB_SHADOW_CANARY_ENABLED = "enabled" as const;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;

export type ProductionWebShadowCanaryAccess =
  | Readonly<{
      allowed: true;
      runId: string;
      candidateGitSha: string;
    }>
  | Readonly<{ allowed: false }>;

export function resolveProductionWebShadowCanaryAccess(
  env: Record<string, string | undefined>,
  authenticatedUserId: string | null | undefined,
  now = new Date()
): ProductionWebShadowCanaryAccess {
  const ownerUserId = env.MEELNI_PRODUCTION_WEB_SHADOW_OWNER_USER_ID;
  const runId = env.MEELNI_PRODUCTION_WEB_SHADOW_RUN_ID;
  const candidateGitSha = env.MEELNI_PRODUCTION_WEB_SHADOW_CANDIDATE_SHA;
  const expiresAt = env.MEELNI_PRODUCTION_WEB_SHADOW_EXPIRES_AT;
  const expiresAtDate =
    typeof expiresAt === "string" && expiresAt.length === 24
      ? new Date(expiresAt)
      : null;
  if (
    env.VERCEL !== "1" ||
    env.VERCEL_ENV !== "production" ||
    env.VERCEL_TARGET_ENV !== "production" ||
    env.MEELNI_ENV_PULL_ENVIRONMENT !== "production" ||
    env.MEELNI_PRODUCTION_WEB_SHADOW_CANARY !==
      PRODUCTION_WEB_SHADOW_CANARY_ENABLED ||
    typeof ownerUserId !== "string" ||
    !UUID.test(ownerUserId) ||
    authenticatedUserId !== ownerUserId ||
    typeof runId !== "string" ||
    !SHA256.test(runId) ||
    typeof candidateGitSha !== "string" ||
    !GIT_SHA.test(candidateGitSha) ||
    !expiresAtDate ||
    !Number.isFinite(expiresAtDate.getTime()) ||
    expiresAtDate.toISOString() !== expiresAt ||
    expiresAtDate.getMilliseconds() !== 0 ||
    expiresAtDate.getTime() <= now.getTime() ||
    expiresAtDate.getTime() > now.getTime() + 60 * 60 * 1_000
  ) {
    return Object.freeze({ allowed: false });
  }
  return Object.freeze({ allowed: true, runId, candidateGitSha });
}
