import { sql } from "drizzle-orm";

import { INTERACTIVE_READ_STATEMENT_TIMEOUT_MS } from "@/lib/http/deadline";
import { db } from "./index";

export type InteractiveReadDatabase = Pick<typeof db, "select">;

export function getInteractiveReadStatementTimeoutSql(): string {
  return `set local statement_timeout = '${INTERACTIVE_READ_STATEMENT_TIMEOUT_MS}ms'`;
}

export async function withInteractiveReadTransaction<T>(
  work: (database: InteractiveReadDatabase) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    // SET LOCAL is scoped to this transaction and is safe with Supabase's
    // transaction pooler. Session-level settings could leak to another client.
    await tx.execute(sql.raw(getInteractiveReadStatementTimeoutSql()));
    return work(tx);
  });
}
