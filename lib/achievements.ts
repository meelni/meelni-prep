/**
 * MOTI-002: Achievement Badge System
 *
 * Defines all achievement badges and provides logic for checking and awarding them.
 */

import { db } from "@/lib/db";
import { userAchievement, interviewSession, feedback, appUser } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

// Achievement badge definitions
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string; // Emoji or icon identifier
  category: "milestones" | "streaks" | "excellence" | "exploration";
}

export const ACHIEVEMENTS: Achievement[] = [
  // Milestone badges
  {
    id: "first_interview",
    name: "First Interview",
    description: "Complete your very first mock interview",
    icon: "🎯",
    category: "milestones",
  },
  {
    id: "getting_serious",
    name: "Getting Serious",
    description: "Complete 5 mock interviews",
    icon: "💪",
    category: "milestones",
  },
  {
    id: "dedicated",
    name: "Dedicated",
    description: "Complete 10 mock interviews",
    icon: "🔥",
    category: "milestones",
  },

  // Excellence badges
  {
    id: "perfect_score",
    name: "Perfect Score",
    description: "Achieve a score of 100",
    icon: "⭐",
    category: "excellence",
  },

  // Streak badges
  {
    id: "week_warrior",
    name: "Week Warrior",
    description: "Maintain a 7-day practice streak",
    icon: "📅",
    category: "streaks",
  },
  {
    id: "monthly_master",
    name: "Monthly Master",
    description: "Maintain a 30-day practice streak",
    icon: "🏆",
    category: "streaks",
  },

  // Exploration badges
  {
    id: "well_rounded",
    name: "Well-Rounded",
    description: "Practice all 4 interview types",
    icon: "🎨",
    category: "exploration",
  },
];

/**
 * Check which achievements a user has earned based on their activity
 */
export async function checkAchievementsForUser(userId: string): Promise<string[]> {
  const newAchievements: string[] = [];

  // Get user's existing achievements
  const existingAchievements = await db.query.userAchievement.findMany({
    where: eq(userAchievement.userId, userId),
  });
  const earnedIds = new Set(existingAchievements.map((a) => a.achievementId));

  // Get user's session count
  const sessions = await db.query.interviewSession.findMany({
    where: and(
      eq(interviewSession.userId, userId),
      eq(interviewSession.status, "completed")
    ),
  });
  const sessionCount = sessions.length;

  // Check milestone achievements
  if (sessionCount >= 1 && !earnedIds.has("first_interview")) {
    newAchievements.push("first_interview");
  }
  if (sessionCount >= 5 && !earnedIds.has("getting_serious")) {
    newAchievements.push("getting_serious");
  }
  if (sessionCount >= 10 && !earnedIds.has("dedicated")) {
    newAchievements.push("dedicated");
  }

  // Check perfect score achievement
  if (!earnedIds.has("perfect_score")) {
    const perfectScoreExists = await db.query.feedback.findFirst({
      where: and(
        eq(feedback.sessionId, sql`(
          SELECT id FROM interview_session
          WHERE user_id = ${userId}
          AND status = 'completed'
        )`),
        eq(feedback.overallScore, sql`100`)
      ),
    });
    if (perfectScoreExists) {
      newAchievements.push("perfect_score");
    }
  }

  // Check streak achievements
  const user = await db.query.appUser.findFirst({
    where: eq(appUser.id, userId),
  });
  if (user) {
    if (user.streakCurrent >= 7 && !earnedIds.has("week_warrior")) {
      newAchievements.push("week_warrior");
    }
    if (user.streakCurrent >= 30 && !earnedIds.has("monthly_master")) {
      newAchievements.push("monthly_master");
    }
  }

  // Check well-rounded achievement (all 4 types practiced)
  if (!earnedIds.has("well_rounded")) {
    const uniqueTypes = new Set(sessions.map((s) => s.roundType));
    const requiredTypes = ["product_sense", "behavioral", "execution", "strategy"];
    const hasAllTypes = requiredTypes.every((type) => uniqueTypes.has(type));
    if (hasAllTypes) {
      newAchievements.push("well_rounded");
    }
  }

  return newAchievements;
}

/**
 * Award achievements to a user
 */
export async function awardAchievements(userId: string, achievementIds: string[]): Promise<void> {
  if (achievementIds.length === 0) return;

  // Insert all new achievements in a single batch
  await db.insert(userAchievement).values(
    achievementIds.map((achievementId) => ({
      userId,
      achievementId,
    }))
  ).onConflictDoNothing(); // Prevent duplicates if already awarded
}

/**
 * Check and award achievements after an interview completes
 */
export async function checkAndAwardAchievements(userId: string): Promise<string[]> {
  const newAchievements = await checkAchievementsForUser(userId);
  if (newAchievements.length > 0) {
    await awardAchievements(userId, newAchievements);
  }
  return newAchievements;
}

/**
 * Get all achievements for a user with earned status
 */
export async function getUserAchievements(userId: string): Promise<
  Array<Achievement & { earned: boolean; earnedAt: Date | null }>
> {
  const earnedAchievements = await db.query.userAchievement.findMany({
    where: eq(userAchievement.userId, userId),
  });

  const earnedMap = new Map<string, Date>(
    earnedAchievements.map((a) => [a.achievementId, a.earnedAt])
  );

  return ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    earned: earnedMap.has(achievement.id),
    earnedAt: earnedMap.get(achievement.id) ?? null,
  }));
}
