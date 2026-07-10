import { db } from "./index";
import { accountDeletionRequest, appUser } from "./schema";
import { eq } from "drizzle-orm";
import { lockAccountIdentity } from "./account-identity-lock";

export class AccountDeletionPendingError extends Error {
  constructor() {
    super("Account deletion is pending");
    this.name = "AccountDeletionPendingError";
  }
}

/**
 * Create or update a user in the app_user table.
 * Uses Supabase Auth user ID and email.
 */
export async function upsertUser(input: {
  id: string;
  email: string;
  name?: string | null;
}) {
  return db.transaction(async (tx) => {
    await lockAccountIdentity(tx, input.id);
    await tx
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.id, input.id))
      .limit(1)
      .for("update");
    const [tombstone] = await tx
      .select({ userId: accountDeletionRequest.userId })
      .from(accountDeletionRequest)
      .where(eq(accountDeletionRequest.userId, input.id))
      .limit(1);
    if (tombstone) throw new AccountDeletionPendingError();

    const [user] = await tx
      .insert(appUser)
      .values({
        id: input.id,
        email: input.email,
        name: input.name,
      })
      .onConflictDoUpdate({
        target: appUser.id,
        set: {
          email: input.email,
          name: input.name,
        },
      })
      .returning();

    return user;
  });
}

/**
 * Get a user by their ID
 */
export async function getUserById(userId: string) {
  const [user] = await db
    .select()
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);

  return user;
}

/**
 * Get a user by their email
 */
export async function getUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(appUser)
    .where(eq(appUser.email, email))
    .limit(1);

  return user;
}
