import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  numeric,
  jsonb,
  check,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { appUser } from "./schema-core";
import { interviewSession } from "./schema-session";

// ==================== Pricing Schema Import ====================
// Phase 0.5A: Import pricing tables for subscription management
import {
  subscription,
  usageRecord,
  paymentHistory,
  stripeEventLog,
  stripeCustomerMapping,
  creditGrant,
  creditReservation,
  creditReservationGrant,
  creditRolloverLot,
  creditRolloverLotAllocation,
  creditTransaction,
  billingAdjustment,
  billingPaymentState,
  subscriptionRelations as pricingSubscriptionRelations,
  usageRecordRelations as pricingUsageRecordRelations,
  paymentHistoryRelations as pricingPaymentHistoryRelations,
  stripeCustomerMappingRelations as pricingStripeCustomerMappingRelations,
  creditGrantRelations as pricingCreditGrantRelations,
  creditReservationRelations as pricingCreditReservationRelations,
  creditReservationGrantRelations as pricingCreditReservationGrantRelations,
  creditRolloverLotRelations as pricingCreditRolloverLotRelations,
  creditRolloverLotAllocationRelations as pricingCreditRolloverLotAllocationRelations,
  creditTransactionRelations as pricingCreditTransactionRelations,
  billingAdjustmentRelations as pricingBillingAdjustmentRelations,
  billingPaymentStateRelations as pricingBillingPaymentStateRelations,
} from "./schema-pricing";

// Re-export pricing tables
export {
  appUser,
  subscription,
  usageRecord,
  paymentHistory,
  stripeEventLog,
  stripeCustomerMapping,
  creditGrant,
  creditReservation,
  creditReservationGrant,
  creditRolloverLot,
  creditRolloverLotAllocation,
  creditTransaction,
  interviewSession,
  billingAdjustment,
  billingPaymentState,
};

// Shared, database-backed budget for LiveKit reconnect token attempts.
// The user id comes from Supabase Auth and intentionally has no app_user FK:
// authorization can succeed before the callback finishes the app-user upsert.
export const livekitReconnectRateLimit = pgTable(
  "livekit_reconnect_rate_limit",
  {
    userId: uuid("user_id").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .array()
      .default(sql`ARRAY[]::timestamptz[]`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    primaryKey: primaryKey({
      name: "livekit_reconnect_rate_limit_pkey",
      columns: [table.userId],
    }),
    capacityCheck: check(
      "livekit_reconnect_rate_limit_capacity_check",
      sql`cardinality(${table.acceptedAt}) <= 10`
    ),
  })
);

// Durable tombstone/outbox for cross-provider account deletion. It has no
// app_user FK so retries remain possible after application data is removed.
export const accountDeletionRequest = pgTable(
  "account_deletion_request",
  {
    userId: uuid("user_id").primaryKey().notNull(),
    status: text("status").default("pending").notNull(),
    stripeSubjects: jsonb("stripe_subjects")
      .$type<
        Array<{
          kind:
            | "charge"
            | "customer"
            | "invoice"
            | "payment_intent"
            | "subscription";
          providerId: string | null;
          fingerprint: string;
        }>
      >()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    livekitRooms: jsonb("livekit_rooms")
      .$type<
        Array<{
          roomName: string | null;
          fingerprint: string;
          generation: number;
          provisioning: boolean;
          provisioningExpiresAt: string | null;
        }>
      >()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastErrorCode: text("last_error_code"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    statusCheck: check(
      "account_deletion_request_status_check",
      sql`${table.status} IN ('pending', 'processing', 'failed', 'completed')`
    ),
    statusUpdatedIdx: index("account_deletion_request_status_updated_idx").on(
      table.status,
      table.updatedAt
    ),
  })
);

// Turn-level transcript
export const transcriptTurn = pgTable(
  "transcript_turn",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => interviewSession.id)
      .notNull(),
    contractVersion: integer("contract_version"),
    eventId: text("event_id"),
    writerId: text("writer_id"),
    sequence: bigint("sequence", { mode: "number" }),
    roomName: text("room_name"),
    speaker: text("speaker").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    text: text("text"),
    audioMs: integer("audio_ms"),
    latencyMs: integer("latency_ms"),
    section: text("section"),
    deliveryState: text("delivery_state"),
  },
  (table) => ({
    speakerCheck: check(
      "speaker_check",
      sql`${table.speaker} IN ('user', 'interviewer')`
    ),
    contractVersionCheck: check(
      "transcript_turn_contract_version_check",
      sql`${table.contractVersion} IS NULL OR ${table.contractVersion} = 2`
    ),
    sequenceCheck: check(
      "transcript_turn_sequence_check",
      sql`${table.sequence} IS NULL OR ${table.sequence} > 0`
    ),
    deliveryStateCheck: check(
      "transcript_turn_delivery_state_check",
      sql`${table.deliveryState} IS NULL OR ${table.deliveryState} IN ('delivered', 'partially_delivered')`
    ),
    canonicalIdentityCheck: check(
      "transcript_turn_canonical_identity_check",
      sql`(
        ${table.contractVersion} IS NULL AND
        ${table.eventId} IS NULL AND
        ${table.writerId} IS NULL AND
        ${table.sequence} IS NULL AND
        ${table.roomName} IS NULL AND
        ${table.deliveryState} IS NULL
      ) OR (
        ${table.contractVersion} = 2 AND
        ${table.eventId} IS NOT NULL AND
        ${table.writerId} IS NOT NULL AND
        ${table.sequence} IS NOT NULL AND
        ${table.roomName} IS NOT NULL AND
        ${table.startedAt} IS NOT NULL AND
        ${table.endedAt} IS NOT NULL AND
        ${table.text} IS NOT NULL AND
        ${table.audioMs} IS NOT NULL AND
        ${table.section} IS NOT NULL AND
        ${table.deliveryState} IS NOT NULL
      )`
    ),
    eventIdUnique: uniqueIndex("transcript_turn_event_id_idx")
      .on(table.eventId)
      .where(sql`${table.eventId} IS NOT NULL`),
    sessionWriterSequenceUnique: uniqueIndex(
      "transcript_turn_session_writer_sequence_idx"
    )
      .on(table.sessionId, table.writerId, table.sequence)
      .where(
        sql`${table.writerId} IS NOT NULL AND ${table.sequence} IS NOT NULL`
      ),
    chronologicalIdx: index("transcript_turn_chronological_idx").on(
      table.sessionId,
      table.startedAt,
      table.writerId,
      table.sequence
    ),
  })
);

// Runtime-confirmed loss of canonical transcript integrity. This operational
// evidence is deliberately outside transcript_turn so it cannot become
// evaluation input.
export const transcriptInterruptionMarker = pgTable(
  "transcript_interruption_marker",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => interviewSession.id)
      .notNull(),
    contractVersion: integer("contract_version").notNull(),
    eventId: text("event_id").notNull(),
    writerId: text("writer_id").notNull(),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    roomName: text("room_name").notNull(),
    speaker: text("speaker").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    contractCheck: check(
      "transcript_interruption_marker_contract_check",
      sql`${table.contractVersion} = 1`
    ),
    speakerCheck: check(
      "transcript_interruption_marker_speaker_check",
      sql`${table.speaker} IN ('user', 'interviewer')`
    ),
    sequenceCheck: check(
      "transcript_interruption_marker_sequence_check",
      sql`${table.sequence} > 0`
    ),
    reasonCheck: check(
      "transcript_interruption_marker_reason_check",
      sql`${table.reason} IN ('no_provider_confirmed_prefix', 'canonicalization_failed')`
    ),
    eventIdUnique: uniqueIndex(
      "transcript_interruption_marker_event_id_idx"
    ).on(table.eventId),
    sessionWriterSequenceUnique: uniqueIndex(
      "transcript_interruption_marker_session_writer_sequence_idx"
    ).on(table.sessionId, table.writerId, table.sequence),
    sessionOccurredAtIdx: index(
      "transcript_interruption_marker_session_occurred_at_idx"
    ).on(table.sessionId, table.occurredAt),
  })
);

// Trusted runtime proof that every queued transcript fact reached a terminal
// persistence outcome before interview completion freezes evaluation evidence.
export const transcriptRuntimeSettlement = pgTable(
  "transcript_runtime_settlement",
  {
    sessionId: uuid("session_id")
      .primaryKey()
      .references(() => interviewSession.id),
    contractVersion: integer("contract_version").notNull(),
    roomName: text("room_name").notNull(),
    writerId: text("writer_id").notNull(),
    state: text("state").notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    contractCheck: check(
      "transcript_runtime_settlement_contract_check",
      sql`${table.contractVersion} = 1`
    ),
    stateCheck: check(
      "transcript_runtime_settlement_state_check",
      sql`${table.state} IN ('settled', 'degraded')`
    ),
    roomSettledAtIdx: index(
      "transcript_runtime_settlement_room_settled_at_idx"
    ).on(table.roomName, table.settledAt),
  })
);

// Feedback / scoring
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => interviewSession.id)
      .unique()
      .notNull(),
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
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
    }),
    processingDurationMs: integer("processing_duration_ms"),

    // Immutable completion evidence used by idempotent end-session replays.
    completionTier: text("completion_tier").$type<
      "full" | "partial" | "insufficient" | "abandoned"
    >(),
    completionStats: jsonb("completion_stats").$type<{
      totalTurns: number;
      userTurns: number;
      totalWords: number;
      durationSeconds: number;
      substantiveResponses: number;
    }>(),
    completionRecommendations: jsonb("completion_recommendations").$type<
      string[]
    >(),

    // Durable dispatch state for the feedback-generation event. The feedback
    // row is also the outbox so session completion and job intent commit in
    // the same transaction.
    dispatchStatus: text("dispatch_status")
      .$type<"not_required" | "pending" | "sending" | "sent" | "failed">()
      .default("not_required")
      .notNull(),
    dispatchEventId: text("dispatch_event_id"),
    dispatchAttempts: integer("dispatch_attempts").default(0).notNull(),
    dispatchClaimedAt: timestamp("dispatch_claimed_at", {
      withTimezone: true,
    }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    dispatchLastError: text("dispatch_last_error"),
  },
  (table) => ({
    statusCheck: check(
      "feedback_status_check",
      sql`${table.status} IN ('pending', 'processing', 'completed', 'failed', 'skipped')`
    ),
    // P1-001: Indexes for polling and performance
    sessionIdStatusIdx: index("feedback_session_status_idx").on(
      table.sessionId,
      table.status
    ),
    dispatchStatusCheck: check(
      "feedback_dispatch_status_check",
      sql`${table.dispatchStatus} IN ('not_required', 'pending', 'sending', 'sent', 'failed')`
    ),
    dispatchAttemptsCheck: check(
      "feedback_dispatch_attempts_check",
      sql`${table.dispatchAttempts} >= 0`
    ),
    completionTierCheck: check(
      "feedback_completion_tier_check",
      sql`${table.completionTier} IS NULL OR ${table.completionTier} IN ('full', 'partial', 'insufficient', 'abandoned')`
    ),
    dispatchEventRequiredCheck: check(
      "feedback_dispatch_event_required_check",
      sql`(${table.dispatchStatus} = 'not_required' AND ${table.dispatchEventId} IS NULL) OR (${table.dispatchStatus} <> 'not_required' AND ${table.dispatchEventId} IS NOT NULL)`
    ),
    dispatchClaimCheck: check(
      "feedback_dispatch_claim_check",
      sql`${table.dispatchStatus} <> 'sending' OR (${table.dispatchClaimedAt} IS NOT NULL AND ${table.dispatchAttempts} > 0)`
    ),
    dispatchSentCheck: check(
      "feedback_dispatch_sent_check",
      sql`${table.dispatchStatus} <> 'sent' OR (${table.dispatchedAt} IS NOT NULL AND ${table.dispatchAttempts} > 0)`
    ),
    dispatchEventIdUnique: uniqueIndex("feedback_dispatch_event_id_idx").on(
      table.dispatchEventId
    ),
    dispatchRecoveryIdx: index("feedback_dispatch_recovery_idx").on(
      table.dispatchStatus,
      table.dispatchClaimedAt
    ),
  })
);

// Question bank for interview questions
export const interviewQuestion = pgTable(
  "interview_question",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    company: text("company"),
    questionText: text("question_text").notNull(),
    questionType: text("question_type").notNull(),
    difficulty: text("difficulty"),
    askedAt: timestamp("asked_at", { withTimezone: true }), // When the question was asked in a real interview
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
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
    questionTypeIdx: index("interview_question_question_type_idx").on(
      table.questionType
    ),
    // Index for filtering active questions
    isActiveIdx: index("interview_question_is_active_idx").on(table.isActive),
    // Composite index for common query pattern: active questions of a specific type
    activeTypeIdx: index("interview_question_active_type_idx").on(
      table.isActive,
      table.questionType
    ),
    // Index for filtering by when question was asked (for recent/trending questions)
    askedAtIdx: index("interview_question_asked_at_idx").on(table.askedAt),
  })
);

// Track which questions have been used in sessions
export const sessionQuestion = pgTable(
  "session_question",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .references(() => interviewSession.id)
      .notNull(),
    questionId: uuid("question_id")
      .references(() => interviewQuestion.id)
      .notNull(),
    startContractVersion: integer("start_contract_version")
      .default(0)
      .notNull(),
    startAttemptId: uuid("start_attempt_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    // A stable attempt resolves and persists exactly one question.
    sessionUnique: uniqueIndex("session_question_session_idx").on(
      table.sessionId
    ),
    // Index for looking up which sessions used a question
    questionIdx: index("session_question_question_idx").on(table.questionId),
    startContractVersionCheck: check(
      "session_question_start_contract_version_check",
      sql`${table.startContractVersion} IN (0, 1)`
    ),
    startContractShapeCheck: check(
      "session_question_start_contract_shape_check",
      sql`(
        ${table.startContractVersion} = 0 AND
        ${table.startAttemptId} IS NULL
      ) OR (
        ${table.startContractVersion} = 1 AND
        ${table.startAttemptId} IS NOT NULL AND
        ${table.sessionId} = ${table.startAttemptId}
      )`
    ),
    sessionAttemptReference: foreignKey({
      name: "session_question_session_start_attempt_fk",
      columns: [table.sessionId, table.startAttemptId],
      foreignColumns: [interviewSession.id, interviewSession.startAttemptId],
    })
      .onUpdate("no action")
      .onDelete("cascade"),
    stableAttemptUnique: uniqueIndex("session_question_start_attempt_idx")
      .on(table.startAttemptId)
      .where(sql`${table.startContractVersion} = 1`),
    sessionQuestionUnique: index("session_question_session_question_idx").on(
      table.sessionId,
      table.questionId
    ),
  })
);

// User settings
export const userSettings = pgTable(
  "user_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => appUser.id)
      .notNull()
      .unique(),
    displayName: text("display_name"),
    defaultInterviewType: text("default_interview_type").default(
      "product_sense"
    ),
    defaultDifficulty: text("default_difficulty").default("medium"),
    questionRecency: text("question_recency").default("current"),
    autoSaveTranscripts: boolean("auto_save_transcripts")
      .default(true)
      .notNull(),
    emailNotifications: boolean("email_notifications").default(true).notNull(),
    sessionCompletionEmail: boolean("session_completion_email")
      .default(true)
      .notNull(),
    feedbackReadyEmail: boolean("feedback_ready_email").default(true).notNull(),
    weeklyProgressReport: boolean("weekly_progress_report")
      .default(false)
      .notNull(),
    shareAnonymousData: boolean("share_anonymous_data").default(true).notNull(),
    saveTranscripts: boolean("save_transcripts").default(true).notNull(),
    theme: text("theme").default("system"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
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
  })
);

// User insights (pre-aggregated analytics) - P2-001
export const userInsights = pgTable(
  "user_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => appUser.id, { onDelete: "cascade" })
      .notNull(),

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
    lastSessionId: uuid("last_session_id").references(
      () => interviewSession.id
    ),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    // Optimistic locking for concurrent updates
    version: integer("version").default(1).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Index for user lookups (most common query pattern)
    userIdIdx: index("user_insights_user_id_idx").on(table.userId),
    // Index for last_updated_at (for incremental sync jobs)
    lastUpdatedAtIdx: index("user_insights_last_updated_at_idx").on(
      table.lastUpdatedAt
    ),
  })
);

// MOTI-002: User achievements tracking
export const userAchievement = pgTable(
  "user_achievement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => appUser.id, { onDelete: "cascade" })
      .notNull(),
    achievementId: text("achievement_id").notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Index for user lookups
    userIdIdx: index("user_achievement_user_id_idx").on(table.userId),
    // Index for achievement lookups
    achievementIdIdx: index("user_achievement_achievement_id_idx").on(
      table.achievementId
    ),
    // Unique constraint: user can only earn each achievement once
    userAchievementUnique: uniqueIndex(
      "user_achievement_user_achievement_idx"
    ).on(table.userId, table.achievementId),
  })
);

// PRAC-001: Bookmarked questions for later practice
export const bookmarkedQuestion = pgTable(
  "bookmarked_question",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => appUser.id, { onDelete: "cascade" })
      .notNull(),
    questionId: uuid("question_id")
      .references(() => interviewQuestion.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Index for user lookups
    userIdIdx: index("bookmarked_question_user_id_idx").on(table.userId),
    // Index for question lookups
    questionIdIdx: index("bookmarked_question_question_id_idx").on(
      table.questionId
    ),
    // Unique constraint: user can only bookmark each question once
    userQuestionUnique: uniqueIndex("bookmarked_question_user_question_idx").on(
      table.userId,
      table.questionId
    ),
  })
);

// PRAC-005: Practice sets for organizing questions
export const practiceSet = pgTable(
  "practice_set",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => appUser.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Index for user lookups
    userIdIdx: index("practice_set_user_id_idx").on(table.userId),
    // Index for name searches
    nameIdx: index("practice_set_name_idx").on(table.name),
  })
);

// PRAC-005: Junction table for practice set questions
export const practiceSetQuestion = pgTable(
  "practice_set_question",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceSetId: uuid("practice_set_id")
      .references(() => practiceSet.id, { onDelete: "cascade" })
      .notNull(),
    questionId: uuid("question_id")
      .references(() => interviewQuestion.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Index for practice set lookups
    practiceSetIdx: index("practice_set_question_set_idx").on(
      table.practiceSetId
    ),
    // Index for question lookups
    questionIdx: index("practice_set_question_question_idx").on(
      table.questionId
    ),
    // Unique constraint: question can only be added once per set
    setQuestionUnique: uniqueIndex("practice_set_question_set_question_idx").on(
      table.practiceSetId,
      table.questionId
    ),
  })
);

// ==================== Relations ====================
// These enable Drizzle's relational query API (e.g., `with: { feedback: true }`)

export const interviewSessionRelations = relations(
  interviewSession,
  ({ one, many }) => ({
    user: one(appUser, {
      fields: [interviewSession.userId],
      references: [appUser.id],
    }),
    feedback: one(feedback, {
      fields: [interviewSession.id],
      references: [feedback.sessionId],
    }),
    transcriptTurns: many(transcriptTurn),
    transcriptInterruptionMarkers: many(transcriptInterruptionMarker),
    transcriptRuntimeSettlement: one(transcriptRuntimeSettlement, {
      fields: [interviewSession.id],
      references: [transcriptRuntimeSettlement.sessionId],
    }),
    sessionQuestions: many(sessionQuestion),
  })
);

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

export const transcriptInterruptionMarkerRelations = relations(
  transcriptInterruptionMarker,
  ({ one }) => ({
    session: one(interviewSession, {
      fields: [transcriptInterruptionMarker.sessionId],
      references: [interviewSession.id],
    }),
  })
);

export const transcriptRuntimeSettlementRelations = relations(
  transcriptRuntimeSettlement,
  ({ one }) => ({
    session: one(interviewSession, {
      fields: [transcriptRuntimeSettlement.sessionId],
      references: [interviewSession.id],
    }),
  })
);

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
  creditGrants: many(creditGrant),
  creditReservations: many(creditReservation),
  creditTransactions: many(creditTransaction),
  billingAdjustments: many(billingAdjustment),
  billingPaymentStates: many(billingPaymentState),
  creditRolloverLots: many(creditRolloverLot),
  // MOTI-002: Achievements
  achievements: many(userAchievement),
}));

export const userInsightsRelations = relations(userInsights, ({ one }) => ({
  user: one(appUser, {
    fields: [userInsights.userId],
    references: [appUser.id],
  }),
}));

export const userAchievementRelations = relations(
  userAchievement,
  ({ one }) => ({
    user: one(appUser, {
      fields: [userAchievement.userId],
      references: [appUser.id],
    }),
  })
);

export const bookmarkedQuestionRelations = relations(
  bookmarkedQuestion,
  ({ one }) => ({
    user: one(appUser, {
      fields: [bookmarkedQuestion.userId],
      references: [appUser.id],
    }),
    question: one(interviewQuestion, {
      fields: [bookmarkedQuestion.questionId],
      references: [interviewQuestion.id],
    }),
  })
);

export const practiceSetRelations = relations(practiceSet, ({ one, many }) => ({
  user: one(appUser, {
    fields: [practiceSet.userId],
    references: [appUser.id],
  }),
  questions: many(practiceSetQuestion),
}));

export const practiceSetQuestionRelations = relations(
  practiceSetQuestion,
  ({ one }) => ({
    practiceSet: one(practiceSet, {
      fields: [practiceSetQuestion.practiceSetId],
      references: [practiceSet.id],
    }),
    question: one(interviewQuestion, {
      fields: [practiceSetQuestion.questionId],
      references: [interviewQuestion.id],
    }),
  })
);

// ==================== Re-export Pricing Relations ====================
// Phase 0.5A: Re-export pricing relations for Drizzle's relational API
export {
  pricingSubscriptionRelations as subscriptionRelations,
  pricingUsageRecordRelations as usageRecordRelations,
  pricingPaymentHistoryRelations as paymentHistoryRelations,
  pricingStripeCustomerMappingRelations as stripeCustomerMappingRelations,
  pricingCreditGrantRelations as creditGrantRelations,
  pricingCreditReservationRelations as creditReservationRelations,
  pricingCreditReservationGrantRelations as creditReservationGrantRelations,
  pricingCreditRolloverLotRelations as creditRolloverLotRelations,
  pricingCreditRolloverLotAllocationRelations as creditRolloverLotAllocationRelations,
  pricingCreditTransactionRelations as creditTransactionRelations,
  pricingBillingAdjustmentRelations as billingAdjustmentRelations,
  pricingBillingPaymentStateRelations as billingPaymentStateRelations,
};
