import { sql } from "drizzle-orm";

export const ACCOUNT_IDENTITY_LOCK_NAMESPACE = 181;

type AccountIdentityLockExecutor = {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
};

export class AccountIdentityBusyError extends Error {
  constructor() {
    super("account_identity_busy");
    this.name = "AccountIdentityBusyError";
  }
}

/**
 * Serializes account creation and deletion even after app_user is absent.
 * The transaction-scoped advisory lock complements the app_user row lock.
 */
export async function lockAccountIdentity(
  executor: AccountIdentityLockExecutor,
  userId: string
) {
  await executor.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, ${ACCOUNT_IDENTITY_LOCK_NAMESPACE}::bigint))`
  );
}

/**
 * Tries the shared account mutation lock without waiting for another request.
 * Callers that perform provider I/O must use this form so same-user fanout
 * cannot consume the database pool while queued behind a long transaction.
 */
export async function tryLockAccountIdentity(
  executor: AccountIdentityLockExecutor,
  userId: string
): Promise<void> {
  const rows = (await executor.execute(
    sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${userId}, ${ACCOUNT_IDENTITY_LOCK_NAMESPACE}::bigint)) as "acquired"`
  )) as Array<{ acquired?: unknown }>;
  if (rows[0]?.acquired !== true) throw new AccountIdentityBusyError();
}
