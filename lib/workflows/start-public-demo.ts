import {
  createLiveKitPublicDemoProvider,
  PUBLIC_DEMO_DURATION_SECONDS,
  type LiveKitEnvironment,
  type LiveKitPublicDemoProvider,
} from "@/lib/internal/integrations";
import {
  completePublicDemoSession,
  failPublicDemoRecoverySession,
  finalizePublicDemoRecoveryToken,
  reservePublicDemoSession,
  rollbackPublicDemoRecoveryToken,
  type PublicDemoDeploymentScope,
  type PublicDemoLimitScope,
} from "@/lib/db/demo-rate-limits";

export interface StartPublicDemoInput {
  sessionId: string;
  participantIdentity: string;
  ipHash: string;
  deviceHash: string;
  deploymentScope: PublicDemoDeploymentScope;
  agentName: string;
  env: LiveKitEnvironment;
}

export interface PublicDemoAuditEvent {
  outcome: "allowed" | "denied" | "failed";
  reason: string;
  limitingScope?: PublicDemoLimitScope;
  retryBucket?: "seconds" | "minutes" | "hours";
}

export interface StartPublicDemoDeps {
  audit(event: PublicDemoAuditEvent): void;
  completeSession(
    sessionId: string,
    status: "ready" | "failed",
    failureCode?: string
  ): Promise<boolean>;
  failRecovery: typeof failPublicDemoRecoverySession;
  finalizeRecovery: typeof finalizePublicDemoRecoveryToken;
  livekit: LiveKitPublicDemoProvider;
  now(): Date;
  reserveSession: typeof reservePublicDemoSession;
  rollbackRecovery: typeof rollbackPublicDemoRecoveryToken;
}

export type StartPublicDemoResult =
  | {
      ok: true;
      body: {
        token: string;
        url: string;
        durationSeconds: number;
      };
    }
  | {
      ok: false;
      status: 409 | 429 | 503;
      body: {
        error:
          | "demo_start_in_progress"
          | "demo_rate_limited"
          | "demo_temporarily_unavailable";
        retryAfterSeconds?: number;
        retryAt?: string;
      };
      retryAfterSeconds?: number;
      resetSessionCookie?: boolean;
    };

export async function startPublicDemoWorkflow(
  input: StartPublicDemoInput,
  deps: StartPublicDemoDeps = createStartPublicDemoDeps()
): Promise<StartPublicDemoResult> {
  let reservation: Awaited<ReturnType<typeof reservePublicDemoSession>>;
  try {
    reservation = await deps.reserveSession({
      sessionId: input.sessionId,
      deploymentScope: input.deploymentScope,
      ipHash: input.ipHash,
      deviceHash: input.deviceHash,
    });
  } catch {
    deps.audit({ outcome: "failed", reason: "limiter_unavailable" });
    return unavailable();
  }

  if (
    reservation.action === "rate_limited" ||
    reservation.action === "failed"
  ) {
    const retryAfterSeconds = reservation.retryAfterSeconds;
    deps.audit({
      outcome: "denied",
      reason:
        reservation.action === "failed"
          ? "prior_provider_failure"
          : "rate_limited",
      limitingScope: reservation.limitingScope ?? undefined,
      retryBucket: retryBucket(retryAfterSeconds),
    });
    return {
      ok: false,
      status: reservation.action === "failed" ? 503 : 429,
      body:
        reservation.action === "failed"
          ? { error: "demo_temporarily_unavailable" }
          : {
              error: "demo_rate_limited",
              retryAfterSeconds,
              retryAt: new Date(
                deps.now().getTime() + retryAfterSeconds * 1000
              ).toISOString(),
            },
      retryAfterSeconds:
        reservation.action === "failed" ? undefined : retryAfterSeconds,
      ...(reservation.action === "failed" ? { resetSessionCookie: true } : {}),
    };
  }

  if (reservation.action === "provisioning") {
    deps.audit({ outcome: "denied", reason: "start_in_progress" });
    return {
      ok: false,
      status: 409,
      body: { error: "demo_start_in_progress", retryAfterSeconds: 2 },
      retryAfterSeconds: 2,
    };
  }

  const roomName = reservation.roomName!;
  if (reservation.action === "issue_token") {
    const claimToken = reservation.recoveryClaimToken;
    if (!claimToken) {
      deps.audit({ outcome: "failed", reason: "recovery_claim_missing" });
      return unavailable(true);
    }
    const token = await deps.livekit.issuePublicDemoToken({
      identity: input.participantIdentity,
      roomName,
      env: input.env,
    });
    if (!token.ok) {
      if (token.error.code === "livekit_demo_room_not_ready") {
        const invalidated = await safelyFailRecovery(
          input.sessionId,
          claimToken,
          token.error.code,
          deps
        );
        if (invalidated) {
          deps.audit({ outcome: "failed", reason: "recovery_room_missing" });
          return unavailable(true);
        }
      }
      await safelyRollbackRecovery(input.sessionId, claimToken, deps);
      deps.audit({ outcome: "failed", reason: "recovery_token_failed" });
      return unavailable();
    }
    let finalized = false;
    try {
      finalized = await deps.finalizeRecovery(input.sessionId, claimToken);
    } catch {
      finalized = false;
    }
    if (!finalized) {
      deps.audit({ outcome: "failed", reason: "recovery_finalize_failed" });
      return unavailable();
    }
    deps.audit({ outcome: "allowed", reason: "recovery_token_issued" });
    return success(token.data.token, token.data.url);
  }

  const started = await deps.livekit.startPublicDemoRoom({
    agentName: input.agentName,
    identity: input.participantIdentity,
    roomName,
    metadata: {
      contract_version: 1,
      type: "demo",
      duration_seconds: PUBLIC_DEMO_DURATION_SECONDS,
      participant_identity: input.participantIdentity,
      deadline_at: new Date(
        deps.now().getTime() + PUBLIC_DEMO_DURATION_SECONDS * 1000
      ).toISOString(),
    },
    env: input.env,
  });
  if (!started.ok) {
    await safelyMarkFailed(input.sessionId, started.error.code, deps);
    deps.audit({
      outcome: "failed",
      reason: safeFailureCode(started.error.code),
    });
    return unavailable(true);
  }

  let completed = false;
  try {
    completed = await deps.completeSession(input.sessionId, "ready");
  } catch {
    completed = false;
  }
  if (!completed) {
    try {
      await deps.livekit.deletePublicDemoRoom(roomName, input.env);
    } catch {
      deps.audit({ outcome: "failed", reason: "ready_cleanup_failed" });
    }
    await safelyMarkFailed(
      input.sessionId,
      "reservation_finalize_failed",
      deps
    );
    deps.audit({ outcome: "failed", reason: "reservation_finalize_failed" });
    return unavailable(true);
  }

  deps.audit({ outcome: "allowed", reason: "demo_started" });
  return success(started.data.token, started.data.url);
}

export function getPublicDemoDeploymentScope(
  env: Record<string, string | undefined> = process.env
): PublicDemoDeploymentScope {
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "preview";
  return "development";
}

function createStartPublicDemoDeps(): StartPublicDemoDeps {
  return {
    audit: (event) => {
      console.info("[PublicDemoAudit]", event);
    },
    completeSession: completePublicDemoSession,
    failRecovery: failPublicDemoRecoverySession,
    finalizeRecovery: finalizePublicDemoRecoveryToken,
    livekit: createLiveKitPublicDemoProvider(),
    now: () => new Date(),
    reserveSession: reservePublicDemoSession,
    rollbackRecovery: rollbackPublicDemoRecoveryToken,
  };
}

async function safelyMarkFailed(
  sessionId: string,
  failureCode: string,
  deps: StartPublicDemoDeps
): Promise<void> {
  try {
    await deps.completeSession(
      sessionId,
      "failed",
      safeFailureCode(failureCode)
    );
  } catch {
    deps.audit({ outcome: "failed", reason: "failure_state_unavailable" });
  }
}

async function safelyRollbackRecovery(
  sessionId: string,
  claimToken: string,
  deps: StartPublicDemoDeps
): Promise<boolean> {
  try {
    const rolledBack = await deps.rollbackRecovery(sessionId, claimToken);
    if (!rolledBack) {
      deps.audit({ outcome: "failed", reason: "recovery_rollback_rejected" });
    }
    return rolledBack;
  } catch {
    deps.audit({ outcome: "failed", reason: "recovery_rollback_unavailable" });
    return false;
  }
}

async function safelyFailRecovery(
  sessionId: string,
  claimToken: string,
  failureCode: string,
  deps: StartPublicDemoDeps
): Promise<boolean> {
  try {
    const failed = await deps.failRecovery(
      sessionId,
      claimToken,
      safeFailureCode(failureCode)
    );
    if (!failed) {
      deps.audit({ outcome: "failed", reason: "recovery_failure_rejected" });
    }
    return failed;
  } catch {
    deps.audit({ outcome: "failed", reason: "recovery_failure_unavailable" });
    return false;
  }
}

function success(token: string, url: string): StartPublicDemoResult {
  return {
    ok: true,
    body: {
      token,
      url,
      durationSeconds: PUBLIC_DEMO_DURATION_SECONDS,
    },
  };
}

function unavailable(resetSessionCookie = false): StartPublicDemoResult {
  return {
    ok: false,
    status: 503,
    body: { error: "demo_temporarily_unavailable" },
    ...(resetSessionCookie ? { resetSessionCookie: true } : {}),
  };
}

function retryBucket(seconds: number): "seconds" | "minutes" | "hours" {
  if (seconds < 60) return "seconds";
  if (seconds < 60 * 60) return "minutes";
  return "hours";
}

function safeFailureCode(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return normalized.slice(0, 64) || "provider_failure";
}
