import { db } from "@/lib/db";
import { appUser } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Update user's practice streak after completing an interview.
 *
 * Logic:
 * - If practiced today already: no change
 * - If practiced yesterday: increment streak
 * - If missed a day or more: reset to 1
 * - Update longest streak if current exceeds it
 *
 * @param userId - The user's ID
 * @returns Updated streak values
 */
export async function updateStreak(userId: string): Promise<{
  streakCurrent: number;
  streakLongest: number;
  isNewRecord: boolean;
}> {
  // Get user's current streak data
  const [user] = await db
    .select({
      streakCurrent: appUser.streakCurrent,
      streakLongest: appUser.streakLongest,
      lastPracticeDate: appUser.lastPracticeDate,
    })
    .from(appUser)
    .where(eq(appUser.id, userId));

  if (!user) {
    throw new Error("User not found");
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastPractice = user.lastPracticeDate
    ? new Date(
        user.lastPracticeDate.getFullYear(),
        user.lastPracticeDate.getMonth(),
        user.lastPracticeDate.getDate()
      )
    : null;

  let newStreakCurrent = user.streakCurrent;
  let newStreakLongest = user.streakLongest;

  // If already practiced today, don't change streak
  if (lastPractice && lastPractice.getTime() === today.getTime()) {
    return {
      streakCurrent: newStreakCurrent,
      streakLongest: newStreakLongest,
      isNewRecord: false,
    };
  }

  // Check if practiced yesterday
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (lastPractice && lastPractice.getTime() === yesterday.getTime()) {
    // Continue streak
    newStreakCurrent = user.streakCurrent + 1;
  } else {
    // Reset streak (missed a day or first time)
    newStreakCurrent = 1;
  }

  // Update longest streak if new record
  const isNewRecord = newStreakCurrent > newStreakLongest;
  if (isNewRecord) {
    newStreakLongest = newStreakCurrent;
  }

  // Update database
  await db
    .update(appUser)
    .set({
      streakCurrent: newStreakCurrent,
      streakLongest: newStreakLongest,
      lastPracticeDate: now,
    })
    .where(eq(appUser.id, userId));

  return {
    streakCurrent: newStreakCurrent,
    streakLongest: newStreakLongest,
    isNewRecord,
  };
}

/**
 * Check if user's streak is at risk (hasn't practiced today and has an active streak).
 *
 * @param userId - The user's ID
 * @returns Whether the streak is at risk
 */
export async function isStreakAtRisk(userId: string): Promise<boolean> {
  const [user] = await db
    .select({
      streakCurrent: appUser.streakCurrent,
      lastPracticeDate: appUser.lastPracticeDate,
    })
    .from(appUser)
    .where(eq(appUser.id, userId));

  if (!user || user.streakCurrent === 0) {
    return false;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastPractice = user.lastPracticeDate
    ? new Date(
        user.lastPracticeDate.getFullYear(),
        user.lastPracticeDate.getMonth(),
        user.lastPracticeDate.getDate()
      )
    : null;

  // At risk if last practice was not today
  return !lastPractice || lastPractice.getTime() !== today.getTime();
}
