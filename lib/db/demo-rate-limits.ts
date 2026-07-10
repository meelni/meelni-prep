import { sql } from "drizzle-orm";

import { db } from "./index";

export type PublicDemoDeploymentScope =
  | "production"
  | "preview"
  | "development";
export type PublicDemoLimitScope = "global" | "ip" | "device" | "session";
export type PublicDemoReservationAction =
  | "provision"
  | "issue_token"
  | "provisioning"
  | "failed"
  | "rate_limited";

export interface PublicDemoReservationInput {
  sessionId: string;
  deploymentScope: PublicDemoDeploymentScope;
  ipHash: string;
  deviceHash: string;
}

export interface PublicDemoReservation {
  action: PublicDemoReservationAction;
  roomName: string | null;
  limitingScope: PublicDemoLimitScope | null;
  retryAfterSeconds: number;
  remaining: number;
  recoveryClaimToken: string | null;
}

interface PublicDemoReservationRow {
  [key: string]: unknown;
  decision: string;
  room_name: string | null;
  limiting_scope: string | null;
  retry_after_seconds: number;
  remaining: number;
  recovery_claim_token: string | null;
}

export async function reservePublicDemoSession(
  input: PublicDemoReservationInput
): Promise<PublicDemoReservation> {
  const rows = await db.execute<PublicDemoReservationRow>(sql`
    SELECT decision, room_name, limiting_scope, retry_after_seconds, remaining,
      recovery_claim_token
    FROM public.reserve_public_demo_session(
      ${input.sessionId}::uuid,
      ${input.deploymentScope},
      ${input.ipHash},
      ${input.deviceHash}
    )
  `);
  const row = rows[0];

  if (
    !row ||
    !isAction(row.decision) ||
    (row.room_name !== null && typeof row.room_name !== "string") ||
    !isScopeOrNull(row.limiting_scope) ||
    !Number.isInteger(row.retry_after_seconds) ||
    row.retry_after_seconds < 0 ||
    row.retry_after_seconds > 24 * 60 * 60 ||
    !Number.isInteger(row.remaining) ||
    row.remaining < 0 ||
    row.remaining > 99 ||
    (row.recovery_claim_token !== null && !isUuid(row.recovery_claim_token)) ||
    (["provision", "issue_token"].includes(row.decision) &&
      (!row.room_name ||
        row.limiting_scope !== null ||
        row.retry_after_seconds !== 0)) ||
    (row.decision === "issue_token" && row.recovery_claim_token === null) ||
    (row.decision !== "issue_token" && row.recovery_claim_token !== null) ||
    (!["provision", "issue_token"].includes(row.decision) &&
      (row.retry_after_seconds < 1 || row.remaining !== 0))
  ) {
    throw new Error("Invalid public demo reservation result");
  }

  return {
    action: row.decision,
    roomName: row.room_name,
    limitingScope: row.limiting_scope,
    retryAfterSeconds: row.retry_after_seconds,
    remaining: row.remaining,
    recoveryClaimToken: row.recovery_claim_token,
  };
}

export async function completePublicDemoSession(
  sessionId: string,
  status: "ready" | "failed",
  failureCode?: string
): Promise<boolean> {
  const rows = await db.execute<{ completed: boolean }>(sql`
    SELECT public.complete_public_demo_session(
      ${sessionId}::uuid,
      ${status},
      ${failureCode ?? null}
    ) AS completed
  `);
  if (typeof rows[0]?.completed !== "boolean") {
    throw new Error("Invalid public demo completion result");
  }
  return rows[0].completed;
}

export async function finalizePublicDemoRecoveryToken(
  sessionId: string,
  claimToken: string
): Promise<boolean> {
  return completePublicDemoRecoveryClaim(
    "finalize_public_demo_recovery_token",
    sessionId,
    claimToken
  );
}

export async function rollbackPublicDemoRecoveryToken(
  sessionId: string,
  claimToken: string
): Promise<boolean> {
  return completePublicDemoRecoveryClaim(
    "rollback_public_demo_recovery_token",
    sessionId,
    claimToken
  );
}

export async function failPublicDemoRecoverySession(
  sessionId: string,
  claimToken: string,
  failureCode: string
): Promise<boolean> {
  const rows = await db.execute<{ completed: boolean }>(sql`
    SELECT public.fail_public_demo_recovery_session(
      ${sessionId}::uuid,
      ${claimToken}::uuid,
      ${failureCode}
    ) AS completed
  `);
  if (typeof rows[0]?.completed !== "boolean") {
    throw new Error("Invalid public demo recovery failure result");
  }
  return rows[0].completed;
}

export async function prunePublicDemoAbuseData(): Promise<{
  deletedSessions: number;
  deletedLimits: number;
}> {
  const rows = await db.execute<{
    deleted_sessions: number;
    deleted_limits: number;
  }>(sql`
    SELECT deleted_sessions, deleted_limits
    FROM public.prune_public_demo_abuse_data()
  `);
  const row = rows[0];
  if (
    !row ||
    !Number.isInteger(row.deleted_sessions) ||
    row.deleted_sessions < 0 ||
    !Number.isInteger(row.deleted_limits) ||
    row.deleted_limits < 0
  ) {
    throw new Error("Invalid public demo cleanup result");
  }
  return {
    deletedSessions: row.deleted_sessions,
    deletedLimits: row.deleted_limits,
  };
}

function isAction(value: unknown): value is PublicDemoReservationAction {
  return (
    value === "provision" ||
    value === "issue_token" ||
    value === "provisioning" ||
    value === "failed" ||
    value === "rate_limited"
  );
}

function isScopeOrNull(value: unknown): value is PublicDemoLimitScope | null {
  return (
    value === null ||
    value === "global" ||
    value === "ip" ||
    value === "device" ||
    value === "session"
  );
}

async function completePublicDemoRecoveryClaim(
  operation:
    | "finalize_public_demo_recovery_token"
    | "rollback_public_demo_recovery_token",
  sessionId: string,
  claimToken: string
): Promise<boolean> {
  const rows = await db.execute<{ completed: boolean }>(sql`
    SELECT ${sql.identifier("public")}.${sql.identifier(operation)}(
      ${sessionId}::uuid,
      ${claimToken}::uuid
    ) AS completed
  `);
  if (typeof rows[0]?.completed !== "boolean") {
    throw new Error("Invalid public demo recovery completion result");
  }
  return rows[0].completed;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}
