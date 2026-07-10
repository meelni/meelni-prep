import { sql } from "drizzle-orm";

export const ACCOUNT_IDENTITY_LOCK_NAMESPACE = 181;

type AccountIdentityLockExecutor = {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
};

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
