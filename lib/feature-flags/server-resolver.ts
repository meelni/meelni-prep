import { StatsigClient, type StatsigUser } from "@statsig/js-client";
import { FEATURE_CONFIGS } from "./gates";

const MAX_REHEARSAL_AUTHORITY_TTL_MS = 2 * 60 * 60 * 1000;

export interface ServerGateResolution {
  source: "statsig" | "configured-default";
  value: boolean;
}

interface StatsigGateClient {
  checkGate(name: string): boolean;
  getDynamicConfig(name: string): { readonly value: Record<string, unknown> };
  initializeAsync(options: { timeoutMs: number }): Promise<{ source: string }>;
  shutdown(): Promise<void>;
}

interface ResolveServerGateOptions {
  apiUrl?: string;
  clientFactory?: (
    clientKey: string,
    user: StatsigUser,
    apiUrl?: string,
    environmentTier?: string
  ) => StatsigGateClient;
  clientKey: string;
  deploymentBranch?: string;
  deploymentCommitSha?: string;
  deploymentTarget?: string;
  environmentTier?: string;
  gateName: string;
  fallbackValue?: boolean;
  rehearsalCommitSha?: string;
  relaunchPhase?: string;
  nowMs?: number;
  timeoutMs?: number;
  user: StatsigUser;
}

function createStatsigGateClient(
  clientKey: string,
  user: StatsigUser,
  apiUrl?: string,
  environmentTier?: string
): StatsigGateClient {
  return new StatsigClient(clientKey, user, {
    environment: environmentTier ? { tier: environmentTier } : undefined,
    loggingEnabled: "disabled",
    networkConfig: apiUrl ? { api: apiUrl } : undefined,
  });
}

export async function resolveServerGate({
  apiUrl,
  clientFactory = createStatsigGateClient,
  clientKey,
  deploymentBranch,
  deploymentCommitSha,
  deploymentTarget,
  environmentTier,
  gateName,
  fallbackValue = false,
  rehearsalCommitSha,
  relaunchPhase,
  nowMs = Date.now(),
  timeoutMs = 1500,
  user,
}: ResolveServerGateOptions): Promise<ServerGateResolution> {
  const phase = relaunchPhase?.trim().toLowerCase();
  const target = deploymentTarget?.trim().toLowerCase();
  const tier = environmentTier?.trim().toLowerCase();
  const branch = normalizedDeploymentBranch(deploymentBranch);
  const deploymentSha = normalizedCommitSha(deploymentCommitSha);
  const rehearsalSha = normalizedCommitSha(rehearsalCommitSha);
  const gateMayResolve =
    (phase === "rehearsal" &&
      target === "preview" &&
      tier === "preview" &&
      Boolean(branch) &&
      Boolean(deploymentSha) &&
      deploymentSha === rehearsalSha) ||
    (phase === "launched" && target === "production" && tier === "production");

  if (!gateMayResolve) {
    return { source: "configured-default", value: false };
  }

  const providerFallback = phase === "rehearsal" ? false : fallbackValue;
  if (!clientKey.trim()) {
    return { source: "configured-default", value: providerFallback };
  }

  const scopedUser =
    phase === "rehearsal"
      ? {
          ...user,
          custom: {
            ...user.custom,
            meelni_deployment_commit_sha: deploymentSha,
            meelni_deployment_git_ref: branch,
          },
        }
      : user;
  const client = clientFactory(clientKey, scopedUser, apiUrl, tier);

  try {
    const result = await client.initializeAsync({ timeoutMs });
    if (result.source !== "Network" && result.source !== "NetworkNotModified") {
      return { source: "configured-default", value: providerFallback };
    }

    if (
      phase === "rehearsal" &&
      !hasCurrentRehearsalAuthority({
        authority: client.getDynamicConfig(
          FEATURE_CONFIGS.previewRehearsalAuthority
        ).value,
        branch,
        deploymentSha,
        nowMs,
      })
    ) {
      return { source: "configured-default", value: false };
    }

    return { source: "statsig", value: client.checkGate(gateName) };
  } catch {
    return { source: "configured-default", value: providerFallback };
  } finally {
    await client.shutdown().catch(() => undefined);
  }
}

function normalizedCommitSha(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[0-9a-f]{40}$/.test(normalized)
    ? normalized
    : undefined;
}

function normalizedDeploymentBranch(
  value: string | undefined
): string | undefined {
  const normalized = value?.trim();
  return normalized &&
    normalized.length <= 255 &&
    !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : undefined;
}

function hasCurrentRehearsalAuthority({
  authority,
  branch,
  deploymentSha,
  nowMs,
}: {
  authority: Record<string, unknown>;
  branch: string | undefined;
  deploymentSha: string | undefined;
  nowMs: number;
}): boolean {
  const approvedCommitSha =
    typeof authority.approvedCommitSha === "string"
      ? normalizedCommitSha(authority.approvedCommitSha)
      : undefined;
  const approvedGitRef =
    typeof authority.approvedGitRef === "string"
      ? normalizedDeploymentBranch(authority.approvedGitRef)
      : undefined;
  const expiresAt =
    typeof authority.expiresAt === "string"
      ? normalizedIsoInstant(authority.expiresAt)
      : undefined;
  const authorizedAt =
    typeof authority.authorizedAt === "string"
      ? normalizedIsoInstant(authority.authorizedAt)
      : undefined;

  return (
    authority.active === true &&
    Boolean(deploymentSha) &&
    approvedCommitSha === deploymentSha &&
    Boolean(branch) &&
    approvedGitRef === branch &&
    typeof authorizedAt === "number" &&
    typeof expiresAt === "number" &&
    Number.isFinite(nowMs) &&
    authorizedAt <= nowMs &&
    expiresAt > nowMs &&
    expiresAt > authorizedAt &&
    expiresAt - authorizedAt <= MAX_REHEARSAL_AUTHORITY_TTL_MS
  );
}

function normalizedIsoInstant(value: string): number | undefined {
  const instant = Date.parse(value);
  return Number.isFinite(instant) && new Date(instant).toISOString() === value
    ? instant
    : undefined;
}
