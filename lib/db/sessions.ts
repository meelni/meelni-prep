import { db } from "./index";
import { interviewSession, appUser, feedback } from "./schema";
import { eq, desc, and, sql } from "drizzle-orm";

export interface CreateSessionInput {
  userId: string;
  role?: string;
  roundType: "behavioral" | "product_sense" | "execution" | "strategy";
  mode: "voice_video" | "text";
  persona?: string;
  livekitRoomName?: string;
  config?: Record<string, unknown>;
}

export interface UpdateSessionInput {
  endedAt?: Date;
  config?: Record<string, unknown>;
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
 * Get the server-owned facts required to authorize a participant reconnect.
 */
export async function getSessionForLiveKitJoin(sessionId: string) {
  const [session] = await db
    .select({
      id: interviewSession.id,
      userId: interviewSession.userId,
      mode: interviewSession.mode,
      livekitRoomName: interviewSession.livekitRoomName,
      config: interviewSession.config,
      startedAt: interviewSession.startedAt,
      endedAt: interviewSession.endedAt,
      status: interviewSession.status,
    })
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
 * Get sessions for a user with pagination and total count
 * Includes feedback data (status and overallScore) for each session
 */
export async function getUserSessionsPaginated(
  userId: string,
  limit = 20,
  offset = 0
) {
  // Get sessions with pagination, including feedback data
  const sessions = await db
    .select({
      id: interviewSession.id,
      userId: interviewSession.userId,
      role: interviewSession.role,
      roundType: interviewSession.roundType,
      mode: interviewSession.mode,
      persona: interviewSession.persona,
      livekitRoomName: interviewSession.livekitRoomName,
      config: interviewSession.config,
      startedAt: interviewSession.startedAt,
      endedAt: interviewSession.endedAt,
      feedback: {
        status: feedback.status,
        overallScore: feedback.overallScore,
        structureScore: feedback.structureScore,
        clarityScore: feedback.clarityScore,
        insightScore: feedback.insightScore,
        communicationScore: feedback.communicationScore,
        leadershipScore: feedback.leadershipScore,
      },
    })
    .from(interviewSession)
    .leftJoin(feedback, eq(feedback.sessionId, interviewSession.id))
    .where(eq(interviewSession.userId, userId))
    .orderBy(desc(interviewSession.startedAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(interviewSession)
    .where(eq(interviewSession.userId, userId));

  const total = Number(countResult[0]?.count || 0);

  return { sessions, total };
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
 * Get sessions for a user filtered by round type with pagination
 * Includes feedback data (status and overallScore) for each session
 */
export async function getUserSessionsByRoundTypePaginated(
  userId: string,
  roundType: "behavioral" | "product_sense" | "execution" | "strategy",
  limit = 20,
  offset = 0
) {
  // Get sessions with pagination, including feedback data
  const sessions = await db
    .select({
      id: interviewSession.id,
      userId: interviewSession.userId,
      role: interviewSession.role,
      roundType: interviewSession.roundType,
      mode: interviewSession.mode,
      persona: interviewSession.persona,
      livekitRoomName: interviewSession.livekitRoomName,
      config: interviewSession.config,
      startedAt: interviewSession.startedAt,
      endedAt: interviewSession.endedAt,
      feedback: {
        status: feedback.status,
        overallScore: feedback.overallScore,
        structureScore: feedback.structureScore,
        clarityScore: feedback.clarityScore,
        insightScore: feedback.insightScore,
        communicationScore: feedback.communicationScore,
        leadershipScore: feedback.leadershipScore,
      },
    })
    .from(interviewSession)
    .leftJoin(feedback, eq(feedback.sessionId, interviewSession.id))
    .where(
      and(
        eq(interviewSession.userId, userId),
        eq(interviewSession.roundType, roundType)
      )
    )
    .orderBy(desc(interviewSession.startedAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(interviewSession)
    .where(
      and(
        eq(interviewSession.userId, userId),
        eq(interviewSession.roundType, roundType)
      )
    );

  const total = Number(countResult[0]?.count || 0);

  return { sessions, total };
}

/**
 * Get user session stats (all sessions for stats calculation)
 */
export async function getUserSessionStats(userId: string) {
  // Get all sessions for the user
  const allSessions = await db
    .select({
      id: interviewSession.id,
      startedAt: interviewSession.startedAt,
      endedAt: interviewSession.endedAt,
    })
    .from(interviewSession)
    .where(eq(interviewSession.userId, userId));

  const totalSessions = allSessions.length;
  const completedSessions = allSessions.filter((s) => s.endedAt !== null);

  // Calculate total minutes from completed sessions
  const totalMinutes = completedSessions.reduce((sum, session) => {
    if (session.startedAt && session.endedAt) {
      const durationMs =
        new Date(session.endedAt).getTime() -
        new Date(session.startedAt).getTime();
      const durationMinutes = Math.round(durationMs / 60000);
      return sum + durationMinutes;
    }
    return sum;
  }, 0);

  // Calculate completion rate
  const completionRate =
    totalSessions > 0
      ? Math.round((completedSessions.length / totalSessions) * 100)
      : 0;

  return {
    totalSessions,
    totalMinutes,
    avgScore: 0, // Will be calculated from feedback table when implemented
    completionRate,
  };
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
