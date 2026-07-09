import { db } from "./index";
import { appUser } from "./schema";
import { eq } from "drizzle-orm";
import { hasAccountDeletionTombstone } from "./account-deletions";

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
  if (await hasAccountDeletionTombstone(input.id)) {
    throw new AccountDeletionPendingError();
  }
  const [user] = await db
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
