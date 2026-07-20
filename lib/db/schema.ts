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
  unique,
  uniqueIndex,
  primaryKey,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import type {
  FocusedPracticeAttemptCompletion,
  FocusedPracticeFeedbackVersionSnapshot,
  FocusedPracticeSourceFindingSnapshot,
  AvailableFocusedPracticePlan,
} from "@meelni/core";
import type {
  QuestionQualityStatus,
  QuestionSourceKind,
} from "@/lib/question-sync/types";
import type { ContactReason } from "@/lib/contact/contracts";
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

// Shared anonymous budget for the public LiveKit demo. Identifiers are
// domain-separated HMAC digests; raw IP addresses and cookie values never
// enter Postgres. All three scopes are consumed atomically by the database
// function in the demo rate-limit migration.
export const publicDemoRateLimit = pgTable(
  "public_demo_rate_limit",
  {
    deploymentScope: text("deployment_scope").notNull(),
    scope: text("scope").notNull(),
    identifierHash: text("identifier_hash").notNull(),
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
      name: "public_demo_rate_limit_pkey",
      columns: [table.deploymentScope, table.scope, table.identifierHash],
    }),
    deploymentScopeCheck: check(
      "public_demo_rate_limit_deployment_scope_check",
      sql`${table.deploymentScope} IN ('production', 'preview', 'development')`
    ),
    scopeCheck: check(
      "public_demo_rate_limit_scope_check",
      sql`${table.scope} IN ('global', 'ip', 'device')`
    ),
    hashCheck: check(
      "public_demo_rate_limit_hash_check",
      sql`${table.identifierHash} ~ '^[0-9a-f]{64}$'`
    ),
    capacityCheck: check(
      "public_demo_rate_limit_capacity_check",
      sql`cardinality(${table.acceptedAt}) <= 100`
    ),
  })
);

// One durable record per browser demo session fences room creation and agent
// dispatch across retries and serverless instances.
export const publicDemoSession = pgTable(
  "public_demo_session",
  {
    id: uuid("id").primaryKey().notNull(),
    deploymentScope: text("deployment_scope").notNull(),
    ipHash: text("ip_hash").notNull(),
    deviceHash: text("device_hash").notNull(),
    roomName: text("room_name").notNull().unique(),
    status: text("status").default("provisioning").notNull(),
    tokenIssues: integer("token_issues").default(0).notNull(),
    recoveryClaimToken: uuid("recovery_claim_token"),
    recoveryFinalizedAt: timestamp("recovery_finalized_at", {
      withTimezone: true,
    }),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    activeExpiresAt: timestamp("active_expires_at", {
      withTimezone: true,
    }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    statusCheck: check(
      "public_demo_session_status_check",
      sql`${table.status} IN ('provisioning', 'ready', 'failed')`
    ),
    deploymentScopeCheck: check(
      "public_demo_session_deployment_scope_check",
      sql`${table.deploymentScope} IN ('production', 'preview', 'development')`
    ),
    ipHashCheck: check(
      "public_demo_session_ip_hash_check",
      sql`${table.ipHash} ~ '^[0-9a-f]{64}$'`
    ),
    deviceHashCheck: check(
      "public_demo_session_device_hash_check",
      sql`${table.deviceHash} ~ '^[0-9a-f]{64}$'`
    ),
    tokenIssuesCheck: check(
      "public_demo_session_token_issues_check",
      sql`${table.tokenIssues} BETWEEN 0 AND 2`
    ),
    recoveryClaimCheck: check(
      "public_demo_session_recovery_claim_check",
      sql`(${table.recoveryClaimToken} IS NULL AND ${table.recoveryFinalizedAt} IS NULL) OR (${table.status} = 'ready' AND ${table.tokenIssues} = 2 AND (${table.recoveryFinalizedAt} IS NULL OR ${table.recoveryClaimToken} IS NOT NULL))`
    ),
    failureCodeCheck: check(
      "public_demo_session_failure_code_check",
      sql`${table.failureCode} IS NULL OR ${table.failureCode} ~ '^[a-z0-9_]{1,64}$'`
    ),
    expiryOrderCheck: check(
      "public_demo_session_expiry_order_check",
      sql`${table.activeExpiresAt} <= ${table.expiresAt}`
    ),
    deviceExpiryIdx: index("public_demo_session_device_expiry_idx").on(
      table.deploymentScope,
      table.deviceHash,
      table.activeExpiresAt
    ),
    expiryIdx: index("public_demo_session_expiry_idx").on(table.expiresAt),
  })
);

// Server-only support inbox. A committed row is the product's durable
// acceptance guarantee; delivery to an external email provider is not implied.
export const contactSubmission = pgTable(
  "contact_submission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    userId: uuid("user_id").references(() => appUser.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    reason: text("reason").$type<ContactReason>().notNull(),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    persistenceState: text("persistence_state").default("stored").notNull(),
    triageState: text("triage_state").default("new").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    idempotencyKeyIdx: uniqueIndex("contact_submission_idempotency_key_idx").on(
      table.idempotencyKey
    ),
    createdAtIdx: index("contact_submission_created_at_idx").on(
      table.createdAt
    ),
    userIdIdx: index("contact_submission_user_id_idx").on(table.userId),
    reasonCheck: check(
      "contact_submission_reason_check",
      sql`${table.reason} IN ('billing', 'support', 'bug', 'feedback', 'other')`
    ),
    nameBoundsCheck: check(
      "contact_submission_name_bounds_check",
      sql`${table.name} = btrim(${table.name}) AND char_length(${table.name}) BETWEEN 1 AND 100 AND octet_length(${table.name}) <= 400 AND ${table.name} !~ '[[:cntrl:]]'`
    ),
    emailBoundsCheck: check(
      "contact_submission_email_bounds_check",
      sql`${table.email} = btrim(${table.email}) AND ${table.email} = lower(${table.email}) AND char_length(${table.email}) BETWEEN 3 AND 320 AND octet_length(${table.email}) <= 320 AND position('@' IN ${table.email}) > 1 AND ${table.email} !~ '[[:cntrl:][:space:]]'`
    ),
    subjectBoundsCheck: check(
      "contact_submission_subject_bounds_check",
      sql`${table.subject} = btrim(${table.subject}) AND char_length(${table.subject}) BETWEEN 1 AND 200 AND octet_length(${table.subject}) <= 800 AND ${table.subject} !~ '[[:cntrl:]]'`
    ),
    messageBoundsCheck: check(
      "contact_submission_message_bounds_check",
      sql`${table.message} = btrim(${table.message}) AND char_length(${table.message}) BETWEEN 10 AND 5000 AND octet_length(${table.message}) <= 20000 AND regexp_replace(${table.message}, E'[\\t\\n\\r]', '', 'g') !~ '[[:cntrl:]]'`
    ),
    persistenceStateCheck: check(
      "contact_submission_persistence_state_check",
      sql`${table.persistenceState} = 'stored'`
    ),
    triageStateCheck: check(
      "contact_submission_triage_state_check",
      sql`${table.triageState} IN ('new', 'claimed', 'resolved')`
    ),
  })
);

// Append-only, PII-free record of privileged support inbox access and triage.
export const contactSubmissionAccessAudit = pgTable(
  "contact_submission_access_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .references(() => contactSubmission.id, { onDelete: "cascade" })
      .notNull(),
    accessType: text("access_type").notNull(),
    actorReference: text("actor_reference").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    submissionCreatedIdx: index(
      "contact_submission_access_audit_submission_created_idx"
    ).on(table.submissionId, table.createdAt),
    accessTypeCheck: check(
      "contact_submission_access_audit_type_check",
      sql`${table.accessType} IN ('read', 'claim', 'resolve')`
    ),
    actorReferenceCheck: check(
      "contact_submission_access_audit_actor_reference_check",
      sql`${table.actorReference} ~ '^[A-Za-z0-9_.:-]{3,80}$'`
    ),
  })
);

// Shared PostgreSQL budget used by the public contact endpoint. Only hashes of
// normalized limiter identities are retained; no raw email or IP is stored.
export const contactSubmissionRateLimit = pgTable(
  "contact_submission_rate_limit",
  {
    identityHash: text("identity_hash").primaryKey().notNull(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    }).notNull(),
    requestCount: integer("request_count").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    identityHashCheck: check(
      "contact_submission_rate_limit_identity_hash_check",
      sql`${table.identityHash} ~ '^[0-9a-f]{64}$'`
    ),
    requestCountCheck: check(
      "contact_submission_rate_limit_request_count_check",
      sql`${table.requestCount} >= 0`
    ),
    windowStartedAtIdx: index(
      "contact_submission_rate_limit_window_started_idx"
    ).on(table.windowStartedAt),
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
    writerGeneration: integer("writer_generation"),
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
        ${table.writerGeneration} IS NULL AND
        ${table.sequence} IS NULL AND
        ${table.roomName} IS NULL AND
        ${table.deliveryState} IS NULL
      ) OR (
        ${table.contractVersion} = 2 AND
        ${table.eventId} IS NOT NULL AND
        ${table.writerId} IS NOT NULL AND
        ${table.writerGeneration} IS NOT NULL AND
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
      table.writerGeneration,
      table.writerId,
      table.sequence,
      table.eventId,
      table.id
    ),
    runtimeWriterForeignKey: foreignKey({
      name: "transcript_turn_runtime_writer_fk",
      columns: [table.sessionId, table.writerGeneration, table.writerId],
      foreignColumns: [
        transcriptRuntimeWriter.sessionId,
        transcriptRuntimeWriter.generation,
        transcriptRuntimeWriter.writerId,
      ],
    }),
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
    writerGeneration: integer("writer_generation").notNull(),
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
    writerGenerationCheck: check(
      "transcript_interruption_marker_writer_generation_check",
      sql`${table.writerGeneration} > 0`
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
    runtimeWriterForeignKey: foreignKey({
      name: "transcript_interruption_marker_runtime_writer_fk",
      columns: [table.sessionId, table.writerGeneration, table.writerId],
      foreignColumns: [
        transcriptRuntimeWriter.sessionId,
        transcriptRuntimeWriter.generation,
        transcriptRuntimeWriter.writerId,
      ],
    }),
  })
);

// Every audible runtime writer registers before output. A later registration
// fences earlier generations without erasing their settlement obligation.
export const transcriptRuntimeWriter = pgTable(
  "transcript_runtime_writer",
  {
    sessionId: uuid("session_id")
      .references(() => interviewSession.id)
      .notNull(),
    generation: integer("generation").notNull(),
    contractVersion: integer("contract_version").notNull(),
    roomName: text("room_name").notNull(),
    writerId: text("writer_id").notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    primaryKey: primaryKey({
      name: "transcript_runtime_writer_pkey",
      columns: [table.sessionId, table.generation],
    }),
    contractCheck: check(
      "transcript_runtime_writer_contract_check",
      sql`${table.contractVersion} = 1`
    ),
    generationCheck: check(
      "transcript_runtime_writer_generation_check",
      sql`${table.generation} > 0`
    ),
    writerUnique: uniqueIndex(
      "transcript_runtime_writer_session_writer_idx"
    ).on(table.sessionId, table.writerId),
    writerIdentityUnique: uniqueIndex(
      "transcript_runtime_writer_identity_idx"
    ).on(table.sessionId, table.generation, table.writerId),
    roomGenerationIdx: index(
      "transcript_runtime_writer_room_generation_idx"
    ).on(table.roomName, table.generation),
  })
);

// Trusted writer-scoped proof that every queued transcript fact reached a
// terminal persistence outcome before completion freezes evaluation evidence.
export const transcriptRuntimeSettlement = pgTable(
  "transcript_runtime_settlement",
  {
    sessionId: uuid("session_id")
      .references(() => interviewSession.id)
      .notNull(),
    writerGeneration: integer("writer_generation").notNull(),
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
    primaryKey: primaryKey({
      name: "transcript_runtime_settlement_pkey",
      columns: [table.sessionId, table.writerGeneration],
    }),
    contractCheck: check(
      "transcript_runtime_settlement_contract_check",
      sql`${table.contractVersion} = 1`
    ),
    stateCheck: check(
      "transcript_runtime_settlement_state_check",
      sql`${table.state} IN ('settled', 'degraded')`
    ),
    writerGenerationCheck: check(
      "transcript_runtime_settlement_writer_generation_check",
      sql`${table.writerGeneration} > 0`
    ),
    writerRegistrationForeignKey: foreignKey({
      name: "transcript_runtime_settlement_writer_fk",
      columns: [table.sessionId, table.writerGeneration, table.writerId],
      foreignColumns: [
        transcriptRuntimeWriter.sessionId,
        transcriptRuntimeWriter.generation,
        transcriptRuntimeWriter.writerId,
      ],
    }),
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
    schemaVersion: text("schema_version"),
    promptVersion: text("prompt_version"),
    modelVersion: text("model_version"),
    evaluationState: text("evaluation_state").$type<"full" | "partial">(),
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
    idSessionUnique: unique("feedback_id_session_uniq").on(
      table.id,
      table.sessionId
    ),
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
    feedbackVersionTupleCheck: check(
      "feedback_version_tuple_check",
      sql`(
        ${table.schemaVersion} IS NULL AND
        ${table.promptVersion} IS NULL AND
        ${table.modelVersion} IS NULL AND
        ${table.evaluationState} IS NULL
      ) OR (
        ${table.schemaVersion} IS NOT NULL AND
        ${table.promptVersion} IS NOT NULL AND
        ${table.modelVersion} IS NOT NULL AND
        ${table.evaluationState} IS NOT NULL AND
        ${table.schemaVersion} = 'feedback.v2' AND
        ${table.promptVersion} = 'feedback.prompt.v2' AND
        length(trim(${table.modelVersion})) > 0 AND
        ${table.rubricVersion} = 'pm-feedback-rubric.v2' AND
        ${table.evaluationState} IN ('full', 'partial')
      )`
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

// A provider-neutral, candidate-authored practice attempt derived from one
// owned completed feedback record. The immutable source snapshot is stored in
// full so later feedback/question changes cannot rewrite an in-flight attempt.
// Only the server workflow mutates this table; authenticated users receive
// owner-scoped reads through RLS and the no-store API.
export const focusedPracticeAttempt = pgTable(
  "focused_practice_attempt",
  {
    id: uuid("id").primaryKey().notNull(),
    userId: uuid("user_id")
      .references(() => appUser.id, { onDelete: "cascade" })
      .notNull(),
    sourceSessionId: uuid("source_session_id")
      .references(() => interviewSession.id, { onDelete: "cascade" })
      .notNull(),
    sourceFeedbackId: uuid("source_feedback_id")
      .references(() => feedback.id, { onDelete: "cascade" })
      .notNull(),
    contractVersion: text("contract_version").notNull(),
    lifecycleVersion: integer("lifecycle_version").default(0).notNull(),
    state: text("state").$type<"in_progress" | "completed">().notNull(),
    feedbackVersion: jsonb("feedback_version")
      .$type<FocusedPracticeFeedbackVersionSnapshot>()
      .notNull(),
    planContractVersion: text("plan_contract_version").notNull(),
    planTemplateVersion: text("plan_template_version").notNull(),
    planTemplateId: text("plan_template_id").notNull(),
    plan: jsonb("plan").$type<AvailableFocusedPracticePlan>().notNull(),
    sourceFinding: jsonb("source_finding")
      .$type<FocusedPracticeSourceFindingSnapshot>()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completion: jsonb("completion").$type<FocusedPracticeAttemptCompletion>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    ownerSourceContractUnique: uniqueIndex(
      "focused_practice_attempt_owner_source_contract_idx"
    ).on(table.userId, table.sourceSessionId, table.contractVersion),
    ownerAttemptUnique: unique("focused_practice_attempt_id_user_uniq").on(
      table.id,
      table.userId
    ),
    sourceSessionOwnerForeignKey: foreignKey({
      name: "focused_practice_attempt_source_session_owner_fk",
      columns: [table.sourceSessionId, table.userId],
      foreignColumns: [interviewSession.id, interviewSession.userId],
    }).onDelete("cascade"),
    sourceFeedbackSessionForeignKey: foreignKey({
      name: "focused_practice_attempt_source_feedback_session_fk",
      columns: [table.sourceFeedbackId, table.sourceSessionId],
      foreignColumns: [feedback.id, feedback.sessionId],
    }).onDelete("cascade"),
    contractVersionCheck: check(
      "focused_practice_attempt_contract_version_check",
      sql`${table.contractVersion} = 'focused-practice-attempt.v1'`
    ),
    planVersionCheck: check(
      "focused_practice_attempt_plan_version_check",
      sql`${table.planContractVersion} = 'focused-practice-plan.v1' AND ${table.planTemplateVersion} = 'focused-practice-templates.v1' AND length(trim(${table.planTemplateId})) > 0`
    ),
    snapshotVersionCheck: check(
      "focused_practice_attempt_snapshot_version_check",
      sql`jsonb_typeof(${table.feedbackVersion}) = 'object' AND
        ${table.feedbackVersion}->>'schemaVersion' = 'feedback.v2' AND
        ${table.feedbackVersion}->>'promptVersion' = 'feedback.prompt.v2' AND
        ${table.feedbackVersion}->>'rubricVersion' = 'pm-feedback-rubric.v2' AND
        ${table.feedbackVersion}->>'evaluationState' IN ('full', 'partial') AND
        jsonb_typeof(${table.plan}) = 'object' AND
        ${table.plan}->>'state' = 'available' AND
        ${table.plan}->>'contractVersion' = ${table.planContractVersion} AND
        ${table.plan}->>'templateVersion' = ${table.planTemplateVersion} AND
        ${table.plan}->>'templateId' = ${table.planTemplateId} AND
        jsonb_typeof(${table.sourceFinding}) = 'object' AND
        octet_length(${table.feedbackVersion}::text) <= 65536 AND
        octet_length(${table.plan}::text) <= 65536 AND
        octet_length(${table.sourceFinding}::text) <= 65536 AND
        (${table.completion} IS NULL OR (jsonb_typeof(${table.completion}) = 'object' AND octet_length(${table.completion}::text) <= 65536))`
    ),
    lifecycleCheck: check(
      "focused_practice_attempt_lifecycle_check",
      sql`(
        ${table.state} = 'in_progress' AND
        ${table.lifecycleVersion} = 0 AND
        ${table.completedAt} IS NULL AND
        ${table.completion} IS NULL
      ) OR (
        ${table.state} = 'completed' AND
        ${table.lifecycleVersion} = 1 AND
        ${table.completedAt} IS NOT NULL AND
        ${table.completedAt} >= ${table.startedAt} AND
        ${table.completion} IS NOT NULL
      )`
    ),
    ownerStateUpdatedIdx: index(
      "focused_practice_attempt_owner_state_updated_idx"
    ).on(table.userId, table.state, table.updatedAt),
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
    sourceKind: text("source_kind")
      .$type<QuestionSourceKind>()
      .default("legacy")
      .notNull(),
    sourceCategory: text("source_category"),
    sourceFingerprint: text("source_fingerprint"),
    qualityStatus: text("quality_status")
      .$type<QuestionQualityStatus>()
      .default("quarantined_unverified")
      .notNull(),
    duplicateOfQuestionId: uuid("duplicate_of_question_id"),
    isActive: boolean("is_active").default(false).notNull(),
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
    sourceKindCheck: check(
      "interview_question_source_kind_check",
      sql`${table.sourceKind} IN ('legacy', 'google_sheets')`
    ),
    sourceFingerprintCheck: check(
      "interview_question_source_fingerprint_check",
      sql`${table.sourceFingerprint} IS NULL OR ${table.sourceFingerprint} ~ '^[0-9a-f]{64}$'`
    ),
    qualityStatusCheck: check(
      "interview_question_quality_status_check",
      sql`${table.qualityStatus} IN ('published', 'quarantined_unverified', 'quarantined_near_duplicate', 'retired_exact_duplicate', 'retired_source_missing')`
    ),
    publicationProjectionCheck: check(
      "interview_question_publication_projection_check",
      sql`${table.isActive} = (${table.qualityStatus} = 'published')`
    ),
    duplicateDispositionCheck: check(
      "interview_question_duplicate_disposition_check",
      sql`(${table.qualityStatus} IN ('quarantined_near_duplicate', 'retired_exact_duplicate')) = (${table.duplicateOfQuestionId} IS NOT NULL)`
    ),
    duplicateNotSelfCheck: check(
      "interview_question_duplicate_not_self_check",
      sql`${table.duplicateOfQuestionId} IS NULL OR ${table.duplicateOfQuestionId} <> ${table.id}`
    ),
    duplicateQuestionFk: foreignKey({
      columns: [table.duplicateOfQuestionId],
      foreignColumns: [table.id],
      name: "interview_question_duplicate_of_question_id_fk",
    }),
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
    qualityStatusIdx: index("interview_question_quality_status_idx").on(
      table.qualityStatus
    ),
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
    // Deprecated compatibility column. Runtime transcript persistence is not
    // controlled by a user setting; retain until a separately rehearsed cleanup.
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
    // Deprecated compatibility column. Analytics consent is owned by the
    // explicit consent contract, not this historical setting.
    shareAnonymousData: boolean("share_anonymous_data")
      .default(false)
      .notNull(),
    analyticsConsent: text("analytics_consent").default("undecided").notNull(),
    analyticsConsentVersion: integer("analytics_consent_version"),
    analyticsConsentSource: text("analytics_consent_source"),
    analyticsConsentUpdatedAt: timestamp("analytics_consent_updated_at", {
      withTimezone: true,
    }),
    analyticsConsentRevision: bigint("analytics_consent_revision", {
      mode: "number",
    })
      .default(0)
      .notNull(),
    // Deprecated compatibility column. Canonical transcripts are persisted for
    // feedback and review regardless of this historical preference.
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
    analyticsConsentCheck: check(
      "analytics_consent_check",
      sql`${table.analyticsConsent} IN ('undecided', 'accepted', 'declined')`
    ),
    analyticsConsentMetadataCheck: check(
      "analytics_consent_metadata_check",
      sql`(${table.analyticsConsent} = 'undecided' AND ${table.analyticsConsentVersion} IS NULL AND ${table.analyticsConsentSource} IS NULL AND ${table.analyticsConsentUpdatedAt} IS NULL AND ${table.analyticsConsentRevision} = 0) OR (${table.analyticsConsent} IN ('accepted', 'declined') AND ${table.analyticsConsentVersion} > 0 AND ${table.analyticsConsentSource} IN ('banner', 'settings', 'legacy_decline', 'account_sync') AND ${table.analyticsConsentUpdatedAt} IS NOT NULL AND ${table.analyticsConsentRevision} > 0)`
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

// Legacy read-only compatibility. SAV-257 stopped active writes; retain rows for
// account export and cascade deletion until a separately approved migration.
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
    transcriptRuntimeWriters: many(transcriptRuntimeWriter),
    transcriptRuntimeSettlements: many(transcriptRuntimeSettlement),
    sessionQuestions: many(sessionQuestion),
  })
);

export const feedbackRelations = relations(feedback, ({ one }) => ({
  session: one(interviewSession, {
    fields: [feedback.sessionId],
    references: [interviewSession.id],
  }),
}));

export const focusedPracticeAttemptRelations = relations(
  focusedPracticeAttempt,
  ({ one }) => ({
    user: one(appUser, {
      fields: [focusedPracticeAttempt.userId],
      references: [appUser.id],
    }),
    sourceSession: one(interviewSession, {
      fields: [focusedPracticeAttempt.sourceSessionId],
      references: [interviewSession.id],
    }),
    sourceFeedback: one(feedback, {
      fields: [focusedPracticeAttempt.sourceFeedbackId],
      references: [feedback.id],
    }),
  })
);

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
    writer: one(transcriptRuntimeWriter, {
      fields: [
        transcriptRuntimeSettlement.sessionId,
        transcriptRuntimeSettlement.writerGeneration,
      ],
      references: [
        transcriptRuntimeWriter.sessionId,
        transcriptRuntimeWriter.generation,
      ],
    }),
  })
);

export const transcriptRuntimeWriterRelations = relations(
  transcriptRuntimeWriter,
  ({ one, many }) => ({
    session: one(interviewSession, {
      fields: [transcriptRuntimeWriter.sessionId],
      references: [interviewSession.id],
    }),
    settlements: many(transcriptRuntimeSettlement),
  })
);

export const appUserRelations = relations(appUser, ({ many, one }) => ({
  sessions: many(interviewSession),
  focusedPracticeAttempts: many(focusedPracticeAttempt),
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
