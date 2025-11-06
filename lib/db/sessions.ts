import { db } from "./index";
import { interviewSession, appUser } from "./schema";
import { eq, desc, and } from "drizzle-orm";

export interface CreateSessionInput {
  userId: string;
  role?: string;
  roundType: "behavioral" | "product_sense" | "execution" | "strategy";
  mode: "voice_video" | "text";
  persona?: string;
  livekitRoomName?: string;
  config?: Record<string, any>;
}

export interface UpdateSessionInput {
  endedAt?: Date;
  config?: Record<string, any>;
}

/**
 * Create a new interview session
 */
export async function createSession(input: CreateSessionInput) {
  const [session] = await db
    .insert(interviewSession)
    .values({
      userId: input.userId,
      role: input.role || "pm",
      roundType: input.roundType,
      mode: input.mode,
      persona: input.persona,
      livekitRoomName: input.livekitRoomName,
      config: input.config,
      startedAt: new Date(),
    })
    .returning();

  return session;
}

/**
 * Get a session by ID
 */
export async function getSessionById(sessionId: string) {
  const [session] = await db
    .select()
    .from(interviewSession)
    .where(eq(interviewSession.id, sessionId))
    .limit(1);

  return session;
}

/**
 * Get a session by ID with user information
 */
export async function getSessionWithUser(sessionId: string) {
  const [result] = await db
    .select({
      session: interviewSession,
      user: appUser,
    })
    .from(interviewSession)
    .leftJoin(appUser, eq(interviewSession.userId, appUser.id))
    .where(eq(interviewSession.id, sessionId))
    .limit(1);

  return result;
}

/**
 * Update a session
 */
export async function updateSession(
  sessionId: string,
  input: UpdateSessionInput
) {
  const [session] = await db
    .update(interviewSession)
    .set(input)
    .where(eq(interviewSession.id, sessionId))
    .returning();

  return session;
}

/**
 * End a session by setting endedAt timestamp
 */
export async function endSession(sessionId: string) {
  return updateSession(sessionId, { endedAt: new Date() });
}

/**
 * Get all sessions for a user, ordered by most recent first
 */
export async function getUserSessions(userId: string, limit = 50) {
  const sessions = await db
    .select()
    .from(interviewSession)
    .where(eq(interviewSession.userId, userId))
    .orderBy(desc(interviewSession.startedAt))
    .limit(limit);

  return sessions;
}

/**
 * Get sessions for a user filtered by round type
 */
export async function getUserSessionsByRoundType(
  userId: string,
  roundType: "behavioral" | "product_sense" | "execution" | "strategy",
  limit = 50
) {
  const sessions = await db
    .select()
    .from(interviewSession)
    .where(
      and(
        eq(interviewSession.userId, userId),
        eq(interviewSession.roundType, roundType)
      )
    )
    .orderBy(desc(interviewSession.startedAt))
    .limit(limit);

  return sessions;
}

/**
 * Check if a session belongs to a user (for authorization)
 */
export async function isSessionOwnedByUser(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const [session] = await db
    .select({ userId: interviewSession.userId })
    .from(interviewSession)
    .where(eq(interviewSession.id, sessionId))
    .limit(1);

  return session?.userId === userId;
}
