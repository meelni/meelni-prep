import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import {
  createQuestionSyncStore,
  type QuestionSyncStore,
} from "@/lib/question-sync/store";

const QUESTION_SYNC_ADVISORY_LOCK_KEY = 1_791_790_001;

export interface QuestionSyncLockResult<T> {
  acquired: boolean;
  value?: T;
}

export interface QuestionSyncTransactionScope {
  tryAcquireLock(): Promise<boolean>;
  store: QuestionSyncStore;
}

export class QuestionSyncLockUnavailableError extends Error {
  constructor() {
    super("Question sync lock is unavailable");
    this.name = "QuestionSyncLockUnavailableError";
  }
}

/**
 * Execute the mutation on the same transaction that owns the advisory lock.
 * If the connection or callback fails, begin() rejects and the transaction
 * rolls back before the error reaches the workflow.
 */
export async function runQuestionSyncTransaction<T>(
  begin: (
    callback: (
      scope: QuestionSyncTransactionScope
    ) => Promise<QuestionSyncLockResult<T>>
  ) => Promise<QuestionSyncLockResult<T>>,
  run: (store: QuestionSyncStore) => Promise<T>
): Promise<QuestionSyncLockResult<T>> {
  let lockAcquired = false;

  try {
    return await begin(async (scope) => {
      if (!(await scope.tryAcquireLock())) return { acquired: false };
      lockAcquired = true;
      return { acquired: true, value: await run(scope.store) };
    });
  } catch (error) {
    if (lockAcquired) throw error;
    throw new QuestionSyncLockUnavailableError();
  }
}

/**
 * The provider fetch happens before this boundary. The database read, plan,
 * inserts, reactivations, and deactivations all use this one transaction.
 */
export async function withQuestionSyncLock<T>(
  run: (store: QuestionSyncStore) => Promise<T>
): Promise<QuestionSyncLockResult<T>> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new QuestionSyncLockUnavailableError();

  const client = postgres(databaseUrl, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const database = drizzle(client, { schema });

  try {
    return await runQuestionSyncTransaction(
      (callback) =>
        database.transaction(async (transaction) => {
          const [lock] = await transaction.execute<{ acquired: boolean }>(sql`
            SELECT pg_try_advisory_xact_lock(${QUESTION_SYNC_ADVISORY_LOCK_KEY}) AS acquired
          `);

          return callback({
            tryAcquireLock: async () => lock?.acquired === true,
            store: createQuestionSyncStore(transaction),
          });
        }),
      run
    );
  } finally {
    await client.end({ timeout: 5 }).catch(() => undefined);
  }
}
