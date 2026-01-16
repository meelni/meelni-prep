import { pgTable, uuid, text, timestamp, integer, numeric, jsonb, check, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";

// ==================== Pricing Schema Import ====================
// Phase 0.5A: Import pricing tables for subscription management
import {
  subscription,
  usageRecord,
  paymentHistory,
  stripeEventLog,
  stripeCustomerMapping,
  subscriptionRelations as pricingSubscriptionRelations,
  usageRecordRelations as pricingUsageRecordRelations,
  paymentHistoryRelations as pricingPaymentHistoryRelations,
  stripeCustomerMappingRelations as pricingStripeCustomerMappingRelations,
} from "./schema-pricing";

// Re-export pricing tables
export {
  subscription,
  usageRecord,
  paymentHistory,
  stripeEventLog,
  stripeCustomerMapping,
};

// Users
export const appUser = pgTable("app_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),

  // MOTI-001: Practice streak tracking
  streakCurrent: integer("streak_current").default(0).notNull(),
  streakLongest: integer("streak_longest").default(0).notNull(),
  lastPracticeDate: timestamp("last_practice_date", { withTimezone: true }),
});

// Interview sessions
export const interviewSession = pgTable("interview_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => appUser.id).notNull(),
  role: text("role").default("pm"),
  roundType: text("round_type").notNull(),
  mode: text("mode").notNull(),
  persona: text("persona"),
  livekitRoomName: text("livekit_room_name"),
  config: jsonb("config"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),

  // P1-001: Session validation and status tracking
  status: text("status").default("in_progress").notNull(),
  totalTurns: integer("total_turns").default(0),
  totalWords: integer("total_words").default(0),
  durationSeconds: integer("duration_seconds"),
}, (table) => ({
  roundTypeCheck: check(
    "round_type_check",
    sql`${table.roundType} IN ('behavioral', 'product_sense', 'execution', 'strategy')`
  ),
  modeCheck: check(
    "mode_check",
    sql`${table.mode} IN ('voice_video', 'text')`
  ),
  statusCheck: check(
    "status_check",
    sql`${table.status} IN ('in_progress', 'completed', 'abandoned', 'too_short', 'error')`
  ),
  // P1-001: Indexes for performance
  userIdStatusIdx: index("interview_session_user_status_idx").on(table.userId, table.status),
  endedAtIdx: index("interview_session_ended_at_idx").on(table.endedAt),
}));

// Turn-level transcript
export const transcriptTurn = pgTable("transcript_turn", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => interviewSession.id).notNull(),
  speaker: text("speaker").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  text: text("text"),
  audioMs: integer("audio_ms"),
  latencyMs: integer("latency_ms"),
  section: text("section"),
}, (table) => ({
  speakerCheck: check(
    "speaker_check",
    sql`${table.speaker} IN ('user', 'interviewer')`
  ),
}));

// Feedback / scoring
export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => interviewSession.id).unique().notNull(),
  structureScore: integer("structure_score"),
  clarityScore: integer("clarity_score"),
  insightScore: integer("insight_score"),
  communicationScore: integer("communication_score"),
  leadershipScore: integer("leadership_score"),
  overallScore: numeric("overall_score"),
  strengths: jsonb("strengths"),
  improvements: jsonb("improvements"),
  drills: jsonb("drills"),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),

  // P1-001: Feedback generation status tracking
  status: text("status").default("pending").notNull(),
  statusReason: text("status_reason"),
  rubricVersion: text("rubric_version").default("1.0.0").notNull(),
  processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
  processingDurationMs: integer("processing_duration_ms"),
}, (table) => ({
  statusCheck: check(
    "feedback_status_check",
    sql`${table.status} IN ('pending', 'processing', 'completed', 'failed', 'skipped')`
  ),
  // P1-001: Indexes for polling and performance
  sessionIdStatusIdx: index("feedback_session_status_idx").on(table.sessionId, table.status),
}));

// Question bank for interview questions
export const interviewQuestion = pgTable("interview_question", {
  id: uuid("id").primaryKey().defaultRandom(),
  company: text("company"),
  questionText: text("question_text").notNull(),
  questionType: text("question_type").notNull(),
  difficulty: text("difficulty"),
  askedAt: timestamp("asked_at", { withTimezone: true }), // When the question was asked in a real interview
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Check constraint for valid question types
  questionTypeCheck: check(
    "question_type_check",
    sql`${table.questionType} IN ('A/B Testing', 'Product design/strategy', 'Behavioral', 'Execution', 'Product Sense', 'Pricing', 'Estimation', 'Product Strategy')`
  ),
  // Check constraint for valid difficulty levels
  difficultyCheck: check(
    "difficulty_check",
    sql`${table.difficulty} IS NULL OR ${table.difficulty} IN ('Easy', 'Medium', 'Hard')`
  ),
  // Index for frequent filtering by question type
  questionTypeIdx: index("interview_question_question_type_idx").on(table.questionType),
  // Index for filtering active questions
  isActiveIdx: index("interview_question_is_active_idx").on(table.isActive),
  // Composite index for common query pattern: active questions of a specific type
  activeTypeIdx: index("interview_question_active_type_idx").on(table.isActive, table.questionType),
  // Index for filtering by when question was asked (for recent/trending questions)
  askedAtIdx: index("interview_question_asked_at_idx").on(table.askedAt),
}));

// Track which questions have been used in sessions
export const sessionQuestion = pgTable("session_question", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => interviewSession.id).notNull(),
  questionId: uuid("question_id").references(() => interviewQuestion.id).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Index for looking up questions by session
  sessionIdx: index("session_question_session_idx").on(table.sessionId),
  // Index for looking up which sessions used a question
  questionIdx: index("session_question_question_idx").on(table.questionId),
  // Unique constraint: one question per session
  sessionQuestionUnique: index("session_question_session_question_idx").on(table.sessionId, table.questionId),
}));

// User settings
export const userSettings = pgTable("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => appUser.id).notNull().unique(),
  displayName: text("display_name"),
  defaultInterviewType: text("default_interview_type").default("product_sense"),
  defaultDifficulty: text("default_difficulty").default("medium"),
  questionRecency: text("question_recency").default("current"),
  autoSaveTranscripts: boolean("auto_save_transcripts").default(true).notNull(),
  emailNotifications: boolean("email_notifications").default(true).notNull(),
  sessionCompletionEmail: boolean("session_completion_email").default(true).notNull(),
  feedbackReadyEmail: boolean("feedback_ready_email").default(true).notNull(),
  weeklyProgressReport: boolean("weekly_progress_report").default(false).notNull(),
  shareAnonymousData: boolean("share_anonymous_data").default(true).notNull(),
  saveTranscripts: boolean("save_transcripts").default(true).notNull(),
  theme: text("theme").default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Check constraints for valid values
  defaultInterviewTypeCheck: check(
    "default_interview_type_check",
    sql`${table.defaultInterviewType} IS NULL OR ${table.defaultInterviewType} IN ('product_sense', 'analytical', 'behavioral', 'strategy')`
  ),
  defaultDifficultyCheck: check(
    "default_difficulty_check",
    sql`${table.defaultDifficulty} IS NULL OR ${table.defaultDifficulty} IN ('easy', 'medium', 'hard')`
  ),
  questionRecencyCheck: check(
    "question_recency_check",
    sql`${table.questionRecency} IS NULL OR ${table.questionRecency} IN ('current', 'recent', 'all')`
  ),
  themeCheck: check(
    "theme_check",
    sql`${table.theme} IS NULL OR ${table.theme} IN ('light', 'dark', 'system')`
  ),
  // Index for looking up settings by user
  userIdIdx: index("user_settings_user_id_idx").on(table.userId),
}));

// User insights (pre-aggregated analytics) - P2-001
export const userInsights = pgTable("user_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => appUser.id, { onDelete: "cascade" }).notNull(),

  // Overall statistics across all sessions
  overallStats: jsonb("overall_stats").notNull().$type<{
    total_sessions: number;
    completed_sessions: number;
    total_minutes: number;
    avg_score: number;
    median_score: number;
    percentile_25: number;
    percentile_75: number;
    percentile_90: number;
  }>(),

  // Stats grouped by interview type
  byInterviewType: jsonb("by_interview_type").notNull().$type<{
    product_sense: { count: number; avg_score: number; last_5_avg: number };
    analytical: { count: number; avg_score: number; last_5_avg: number };
    leadership: { count: number; avg_score: number; last_5_avg: number };
    strategy: { count: number; avg_score: number; last_5_avg: number };
  }>(),

  // Stats grouped by difficulty level
  byDifficulty: jsonb("by_difficulty").notNull().$type<{
    junior: { count: number; avg_score: number };
    intermediate: { count: number; avg_score: number };
    senior: { count: number; avg_score: number };
  }>(),

  // Trend analysis
  trends: jsonb("trends").notNull().$type<{
    last_5_sessions_avg: number;
    all_time_avg: number;
    improvement_trend: "improving" | "stable" | "declining";
    velocity: number;
  }>(),

  // Average scores by competency
  competencyBreakdown: jsonb("competency_breakdown").notNull().$type<{
    structure: number;
    clarity: number;
    insight: number;
    communication: number;
    leadership: number;
  }>(),

  // Reference to most recent session
  lastSessionId: uuid("last_session_id").references(() => interviewSession.id),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).defaultNow().notNull(),

  // Optimistic locking for concurrent updates
  version: integer("version").default(1).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Index for user lookups (most common query pattern)
  userIdIdx: index("user_insights_user_id_idx").on(table.userId),
  // Index for last_updated_at (for incremental sync jobs)
  lastUpdatedAtIdx: index("user_insights_last_updated_at_idx").on(table.lastUpdatedAt),
}));

// MOTI-002: User achievements tracking
export const userAchievement = pgTable("user_achievement", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => appUser.id, { onDelete: "cascade" }).notNull(),
  achievementId: text("achievement_id").notNull(),
  earnedAt: timestamp("earned_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Index for user lookups
  userIdIdx: index("user_achievement_user_id_idx").on(table.userId),
  // Index for achievement lookups
  achievementIdIdx: index("user_achievement_achievement_id_idx").on(table.achievementId),
  // Unique constraint: user can only earn each achievement once
  userAchievementUnique: index("user_achievement_user_achievement_idx").on(table.userId, table.achievementId),
}));

// ==================== Relations ====================
// These enable Drizzle's relational query API (e.g., `with: { feedback: true }`)

export const interviewSessionRelations = relations(interviewSession, ({ one, many }) => ({
  user: one(appUser, {
    fields: [interviewSession.userId],
    references: [appUser.id],
  }),
  feedback: one(feedback, {
    fields: [interviewSession.id],
    references: [feedback.sessionId],
  }),
  transcriptTurns: many(transcriptTurn),
  sessionQuestions: many(sessionQuestion),
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  session: one(interviewSession, {
    fields: [feedback.sessionId],
    references: [interviewSession.id],
  }),
}));

export const transcriptTurnRelations = relations(transcriptTurn, ({ one }) => ({
  session: one(interviewSession, {
    fields: [transcriptTurn.sessionId],
    references: [interviewSession.id],
  }),
}));

export const appUserRelations = relations(appUser, ({ many, one }) => ({
  sessions: many(interviewSession),
  settings: one(userSettings, {
    fields: [appUser.id],
    references: [userSettings.userId],
  }),
  insights: one(userInsights, {
    fields: [appUser.id],
    references: [userInsights.userId],
  }),
  // Phase 0.5A: Pricing relations
  subscription: one(subscription, {
    fields: [appUser.id],
    references: [subscription.userId],
  }),
  usageRecords: many(usageRecord),
  paymentHistory: many(paymentHistory),
  // MOTI-002: Achievements
  achievements: many(userAchievement),
}));

export const userInsightsRelations = relations(userInsights, ({ one }) => ({
  user: one(appUser, {
    fields: [userInsights.userId],
    references: [appUser.id],
  }),
}));

export const userAchievementRelations = relations(userAchievement, ({ one }) => ({
  user: one(appUser, {
    fields: [userAchievement.userId],
    references: [appUser.id],
  }),
}));

// ==================== Re-export Pricing Relations ====================
// Phase 0.5A: Re-export pricing relations for Drizzle's relational API
export {
  pricingSubscriptionRelations as subscriptionRelations,
  pricingUsageRecordRelations as usageRecordRelations,
  pricingPaymentHistoryRelations as paymentHistoryRelations,
  pricingStripeCustomerMappingRelations as stripeCustomerMappingRelations,
};
