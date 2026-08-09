import {
  getLiveKitAgentName,
  getLiveKitEnvironment,
} from "@/lib/internal/integrations";
import {
  FEEDBACK_GENERATION_LEASE_MS,
  FEEDBACK_QUEUE_CLAIM_TIMEOUT_MS,
} from "@/lib/operations/interview-lifecycle-slo";

export const SERVICE_HEALTH_CHECKS = [
  "web",
  "database",
  "question_bank",
  "livekit",
  "feedback_dispatch",
  "stripe_webhook",
] as const;

export type ServiceHealthCheckName = (typeof SERVICE_HEALTH_CHECKS)[number];
export type ServiceHealthStatus = "healthy" | "degraded" | "unavailable";

export type ServiceHealthCode =
  | "web_ready"
  | "database_ready"
  | "database_unavailable"
  | "question_bank_ready"
  | "question_bank_empty"
  | "question_bank_dependency_unavailable"
  | "livekit_ready"
  | "livekit_unavailable"
  | "feedback_dispatch_ready"
  | "feedback_dispatch_config_missing"
  | "feedback_dispatch_stale"
  | "feedback_dispatch_failed"
  | "feedback_dispatch_dependency_unavailable"
  | "stripe_webhook_ready"
  | "stripe_webhook_config_missing"
  | "stripe_webhook_stale"
  | "stripe_webhook_failed"
  | "stripe_webhook_dependency_unavailable";

export interface ServiceHealthCheck {
  name: ServiceHealthCheckName;
  status: ServiceHealthStatus;
  code: ServiceHealthCode;
}

export interface ServiceHealthReport {
  contract: "meelni_service_health";
  version: 1;
  checkedAt: string;
  status: ServiceHealthStatus;
  checks: ServiceHealthCheck[];
}

export interface ServiceHealthEvidence {
  questionBankReady: boolean;
  feedbackDispatchStale: boolean;
  feedbackDispatchFailed: boolean;
  stripeWebhookStale: boolean;
  stripeWebhookFailed: boolean;
}

export interface ServiceHealthStore {
  readEvidence(input: {
    staleBefore: Date;
    feedbackQueueStaleBefore: Date;
    feedbackGenerationStaleBefore: Date;
    queryTimeoutMs: number;
  }): Promise<ServiceHealthEvidence>;
}

interface ServiceHealthDependencies {
  env: Readonly<Record<string, string | undefined>>;
  now(): Date;
  store: ServiceHealthStore;
  timeoutMs: number;
}

interface CachedServiceHealthReaderDependencies {
  assess(): Promise<ServiceHealthReport>;
  now(): number;
  ttlMs: number;
}

const STALE_AFTER_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 2_000;
const QUERY_TIMEOUT_HEADROOM_MS = 100;

export async function assessServiceHealth(
  dependencies: ServiceHealthDependencies
): Promise<ServiceHealthReport> {
  const checkedAt = dependencies.now();
  const checks: ServiceHealthCheck[] = [
    { name: "web", status: "healthy", code: "web_ready" },
  ];

  const liveKitEnv = {
    LIVEKIT_API_KEY: dependencies.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: dependencies.env.LIVEKIT_API_SECRET,
    LIVEKIT_URL: dependencies.env.LIVEKIT_URL,
    NEXT_PUBLIC_LIVEKIT_URL: dependencies.env.NEXT_PUBLIC_LIVEKIT_URL,
    LIVEKIT_INTERVIEW_AGENT_NAME: dependencies.env.LIVEKIT_INTERVIEW_AGENT_NAME,
  };
  const liveKitReady =
    getLiveKitEnvironment(liveKitEnv).ok &&
    getLiveKitAgentName("interview", liveKitEnv).ok;

  checks.push(
    liveKitReady
      ? { name: "livekit", status: "healthy", code: "livekit_ready" }
      : {
          name: "livekit",
          status: "unavailable",
          code: "livekit_unavailable",
        }
  );

  let evidence: ServiceHealthEvidence | null = null;
  try {
    const timeoutMs = normalizeTimeoutMs(dependencies.timeoutMs);
    evidence = await withTimeout(
      dependencies.store.readEvidence({
        staleBefore: new Date(checkedAt.getTime() - STALE_AFTER_MS),
        feedbackQueueStaleBefore: new Date(
          checkedAt.getTime() - FEEDBACK_QUEUE_CLAIM_TIMEOUT_MS
        ),
        feedbackGenerationStaleBefore: new Date(
          checkedAt.getTime() - FEEDBACK_GENERATION_LEASE_MS
        ),
        queryTimeoutMs: Math.max(1, timeoutMs - QUERY_TIMEOUT_HEADROOM_MS),
      }),
      timeoutMs
    );
    checks.push({
      name: "database",
      status: "healthy",
      code: "database_ready",
    });
  } catch {
    checks.push({
      name: "database",
      status: "unavailable",
      code: "database_unavailable",
    });
  }

  checks.push(
    questionBankCheck(evidence),
    feedbackDispatchCheck(dependencies.env, evidence),
    stripeWebhookCheck(dependencies.env, evidence)
  );

  return {
    contract: "meelni_service_health",
    version: 1,
    checkedAt: checkedAt.toISOString(),
    status: aggregateStatus(checks),
    checks: SERVICE_HEALTH_CHECKS.map(
      (name) => checks.find((check) => check.name === name)!
    ),
  };
}

export function createDefaultServiceHealthDependencies(input: {
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  store: ServiceHealthStore;
  timeoutMs?: number;
}): ServiceHealthDependencies {
  return {
    env: input.env ?? process.env,
    now: input.now ?? (() => new Date()),
    store: input.store,
    timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

export function createCachedServiceHealthReader(
  dependencies: CachedServiceHealthReaderDependencies
): () => Promise<ServiceHealthReport> {
  let cached: { expiresAt: number; report: ServiceHealthReport } | undefined;
  let inFlight: Promise<ServiceHealthReport> | undefined;

  return async function readServiceHealth() {
    const now = dependencies.now();
    if (cached && now < cached.expiresAt) return cached.report;
    if (inFlight) return inFlight;

    inFlight = dependencies
      .assess()
      .then((report) => {
        cached = {
          expiresAt: dependencies.now() + Math.max(0, dependencies.ttlMs),
          report,
        };
        return report;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };
}

function questionBankCheck(
  evidence: ServiceHealthEvidence | null
): ServiceHealthCheck {
  if (!evidence) {
    return {
      name: "question_bank",
      status: "unavailable",
      code: "question_bank_dependency_unavailable",
    };
  }
  if (!evidence.questionBankReady) {
    return {
      name: "question_bank",
      status: "unavailable",
      code: "question_bank_empty",
    };
  }
  return {
    name: "question_bank",
    status: "healthy",
    code: "question_bank_ready",
  };
}

function feedbackDispatchCheck(
  env: Readonly<Record<string, string | undefined>>,
  evidence: ServiceHealthEvidence | null
): ServiceHealthCheck {
  if (!evidence) {
    return {
      name: "feedback_dispatch",
      status: "unavailable",
      code: "feedback_dispatch_dependency_unavailable",
    };
  }
  if (!feedbackDispatchConfigured(env)) {
    return {
      name: "feedback_dispatch",
      status: "degraded",
      code: "feedback_dispatch_config_missing",
    };
  }
  if (evidence.feedbackDispatchFailed) {
    return {
      name: "feedback_dispatch",
      status: "degraded",
      code: "feedback_dispatch_failed",
    };
  }
  if (evidence.feedbackDispatchStale) {
    return {
      name: "feedback_dispatch",
      status: "degraded",
      code: "feedback_dispatch_stale",
    };
  }
  return {
    name: "feedback_dispatch",
    status: "healthy",
    code: "feedback_dispatch_ready",
  };
}

function stripeWebhookCheck(
  env: Readonly<Record<string, string | undefined>>,
  evidence: ServiceHealthEvidence | null
): ServiceHealthCheck {
  if (!evidence) {
    return {
      name: "stripe_webhook",
      status: "unavailable",
      code: "stripe_webhook_dependency_unavailable",
    };
  }
  if (!env.STRIPE_WEBHOOK_SECRET?.trim()) {
    return {
      name: "stripe_webhook",
      status: "degraded",
      code: "stripe_webhook_config_missing",
    };
  }
  if (evidence.stripeWebhookFailed) {
    return {
      name: "stripe_webhook",
      status: "degraded",
      code: "stripe_webhook_failed",
    };
  }
  if (evidence.stripeWebhookStale) {
    return {
      name: "stripe_webhook",
      status: "degraded",
      code: "stripe_webhook_stale",
    };
  }
  return {
    name: "stripe_webhook",
    status: "healthy",
    code: "stripe_webhook_ready",
  };
}

function feedbackDispatchConfigured(
  env: Readonly<Record<string, string | undefined>>
): boolean {
  const hosted =
    env.VERCEL === "1" ||
    env.VERCEL_ENV === "preview" ||
    env.VERCEL_ENV === "production";
  if (!hosted) return true;
  return Boolean(
    env.INNGEST_EVENT_KEY?.trim() && env.INNGEST_SIGNING_KEY?.trim()
  );
}

function aggregateStatus(checks: ServiceHealthCheck[]): ServiceHealthStatus {
  if (checks.some((check) => check.status === "unavailable")) {
    return "unavailable";
  }
  if (checks.some((check) => check.status === "degraded")) return "degraded";
  return "healthy";
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("service_health_timeout")),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function normalizeTimeoutMs(value: number): number {
  return Number.isFinite(value) && value > 0
    ? Math.max(1, Math.floor(value))
    : DEFAULT_TIMEOUT_MS;
}
