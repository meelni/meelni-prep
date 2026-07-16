import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type {
  InterviewLifecycleState,
  InterviewTerminalReason,
  LegacyInterviewSessionStatus,
} from "@meelni/core";

import { appUser } from "./schema-core";

// Kept in a leaf schema module so both the application schema and the credit
// ledger can declare database-enforced session correlations without a cycle.
export const interviewSession = pgTable(
  "interview_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => appUser.id)
      .notNull(),
    role: text("role").default("pm"),
    roundType: text("round_type").notNull(),
    mode: text("mode").notNull(),
    persona: text("persona"),
    livekitRoomName: text("livekit_room_name"),
    config: jsonb("config"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),

    // Version 0 preserves legacy writers. Version 1 is the stable-start
    // contract and uses the client attempt UUID as the durable session ID.
    startContractVersion: integer("start_contract_version")
      .default(0)
      .notNull(),
    startAttemptId: uuid("start_attempt_id"),
    startRequestFingerprint: text("start_request_fingerprint"),
    provisioningState: text("provisioning_state").default("legacy").notNull(),
    provisioningLeaseId: uuid("provisioning_lease_id"),
    provisioningLeaseExpiresAt: timestamp("provisioning_lease_expires_at", {
      withTimezone: true,
    }),
    provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
    usableAt: timestamp("usable_at", { withTimezone: true }),
    usableTranscriptEventId: text("usable_transcript_event_id"),

    // Canonical lifecycle state. The legacy status column remains during the
    // staged workflow migration so existing readers and writers keep working.
    lifecycleState: text("lifecycle_state")
      .$type<InterviewLifecycleState>()
      .default("created")
      .notNull(),
    lifecycleVersion: integer("lifecycle_version").default(1).notNull(),
    terminalReason: text("terminal_reason").$type<InterviewTerminalReason>(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    endingAt: timestamp("ending_at", { withTimezone: true }),
    reconnectDeadlineAt: timestamp("reconnect_deadline_at", {
      withTimezone: true,
    }),
    reconnectDeadlineOwner: text("reconnect_deadline_owner").$type<
      "reconnect_grace" | "hard_deadline"
    >(),
    roomCleanupPending: boolean("room_cleanup_pending")
      .default(false)
      .notNull(),
    roomCleanupAttemptedAt: timestamp("room_cleanup_attempted_at", {
      withTimezone: true,
    }),
    roomProvisioningPending: boolean("room_provisioning_pending")
      .default(false)
      .notNull(),
    roomProvisioningStartedAt: timestamp("room_provisioning_started_at", {
      withTimezone: true,
    }),
    presenceReconciledAt: timestamp("presence_reconciled_at", {
      withTimezone: true,
    }),
    runtimeReadyAt: timestamp("runtime_ready_at", { withTimezone: true }),
    lastTransportEventAt: timestamp("last_transport_event_at", {
      withTimezone: true,
    }),
    lastTransportEventId: text("last_transport_event_id"),
    lastTransportEventName: text("last_transport_event_name"),
    lastTransitionAt: timestamp("last_transition_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deadlineRoomCleanupStatus: text("deadline_room_cleanup_status").$type<
      "pending" | "deleted" | "already_absent"
    >(),
    deadlineRoomCleanupAcknowledgedAt: timestamp(
      "deadline_room_cleanup_acknowledged_at",
      { withTimezone: true }
    ),

    // P1-001: Session validation and status tracking
    status: text("status")
      .$type<LegacyInterviewSessionStatus>()
      .default("in_progress")
      .notNull(),
    totalTurns: integer("total_turns").default(0),
    totalWords: integer("total_words").default(0),
    durationSeconds: integer("duration_seconds"),
  },
  (table) => ({
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
    startContractVersionCheck: check(
      "interview_session_start_contract_version_check",
      sql`${table.startContractVersion} IN (0, 1)`
    ),
    startContractShapeCheck: check(
      "interview_session_start_contract_shape_check",
      sql`(
        ${table.startContractVersion} = 0 AND
        ${table.startAttemptId} IS NULL AND
        ${table.startRequestFingerprint} IS NULL AND
        ${table.provisioningState} = 'legacy' AND
        ${table.provisioningLeaseId} IS NULL AND
        ${table.provisioningLeaseExpiresAt} IS NULL AND
        ${table.provisionedAt} IS NULL AND
        ${table.usableAt} IS NULL AND
        ${table.usableTranscriptEventId} IS NULL
      ) OR (
        ${table.startContractVersion} = 1 AND
        ${table.startAttemptId} IS NOT NULL AND
        ${table.id} = ${table.startAttemptId} AND
        ${table.startRequestFingerprint} ~ '^[0-9a-f]{64}$' AND
        ${table.livekitRoomName} = 'interview-' || ${table.startAttemptId}::text AND
        ${table.provisioningState} IN ('pending', 'provisioning', 'ready', 'failed')
      )`
    ),
    provisioningEvidenceCheck: check(
      "interview_session_provisioning_evidence_check",
      sql`CASE ${table.provisioningState}
        WHEN 'legacy' THEN
          ${table.provisioningLeaseId} IS NULL AND
          ${table.provisioningLeaseExpiresAt} IS NULL AND
          ${table.provisionedAt} IS NULL
        WHEN 'pending' THEN
          ${table.provisioningLeaseId} IS NULL AND
          ${table.provisioningLeaseExpiresAt} IS NULL AND
          ${table.provisionedAt} IS NULL
        WHEN 'provisioning' THEN
          ${table.provisioningLeaseId} IS NOT NULL AND
          ${table.provisioningLeaseExpiresAt} IS NOT NULL AND
          ${table.provisionedAt} IS NULL
        WHEN 'ready' THEN
          ${table.provisioningLeaseId} IS NULL AND
          ${table.provisioningLeaseExpiresAt} IS NULL AND
          ${table.provisionedAt} IS NOT NULL
        WHEN 'failed' THEN
          ${table.provisioningLeaseId} IS NULL AND
          ${table.provisioningLeaseExpiresAt} IS NULL AND
          ${table.provisionedAt} IS NULL
        ELSE false
      END`
    ),
    usableEvidenceCheck: check(
      "interview_session_usable_evidence_check",
      sql`(
        ${table.usableAt} IS NULL AND
        ${table.usableTranscriptEventId} IS NULL
      ) OR (
        ${table.startContractVersion} = 1 AND
        ${table.activatedAt} IS NOT NULL AND
        ${table.usableAt} IS NOT NULL AND
        ${table.usableTranscriptEventId} IS NOT NULL AND
        length(${table.usableTranscriptEventId}) > 0
      )`
    ),
    lifecycleStateCheck: check(
      "interview_session_lifecycle_state_check",
      sql`${table.lifecycleState} IN ('created', 'connecting', 'active', 'reconnecting', 'ending', 'completed', 'abandoned', 'failed')`
    ),
    terminalReasonCheck: check(
      "interview_session_terminal_reason_check",
      sql`${table.terminalReason} IS NULL OR ${table.terminalReason} IN ('user_end', 'time_limit', 'disconnect_timeout', 'provider_failure', 'insufficient_signal', 'legacy_unknown')`
    ),
    lifecycleVersionCheck: check(
      "interview_session_lifecycle_version_check",
      sql`${table.lifecycleVersion} >= 1`
    ),
    terminalReasonStateCheck: check(
      "interview_session_terminal_reason_state_check",
      sql`(${table.lifecycleState} IN ('ending', 'completed', 'abandoned', 'failed') AND ${table.terminalReason} IS NOT NULL) OR (${table.lifecycleState} NOT IN ('ending', 'completed', 'abandoned', 'failed') AND ${table.terminalReason} IS NULL)`
    ),
    endingAtStateCheck: check(
      "interview_session_ending_at_state_check",
      sql`${table.endingAt} IS NULL OR ${table.lifecycleState} IN ('ending', 'completed', 'abandoned', 'failed')`
    ),
    roomProvisioningClaimCheck: check(
      "interview_session_room_provisioning_claim_check",
      sql`(${table.roomProvisioningPending} AND ${table.roomProvisioningStartedAt} IS NOT NULL) OR (NOT ${table.roomProvisioningPending} AND ${table.roomProvisioningStartedAt} IS NULL)`
    ),
    reconnectDeadlineOwnerCheck: check(
      "interview_session_reconnect_deadline_owner_check",
      sql`(${table.reconnectDeadlineAt} IS NULL AND ${table.reconnectDeadlineOwner} IS NULL) OR (${table.reconnectDeadlineAt} IS NOT NULL AND ${table.reconnectDeadlineOwner} IN ('reconnect_grace', 'hard_deadline'))`
    ),
    deadlineRoomCleanupStatusCheck: check(
      "interview_session_deadline_room_cleanup_status_check",
      sql`${table.deadlineRoomCleanupStatus} IS NULL OR ${table.deadlineRoomCleanupStatus} IN ('pending', 'deleted', 'already_absent')`
    ),
    deadlineRoomCleanupAcknowledgementCheck: check(
      "interview_session_deadline_room_cleanup_ack_check",
      sql`(${table.deadlineRoomCleanupStatus} IN ('deleted', 'already_absent') AND ${table.deadlineRoomCleanupAcknowledgedAt} IS NOT NULL) OR (${table.deadlineRoomCleanupStatus} IS NULL OR ${table.deadlineRoomCleanupStatus} = 'pending') AND ${table.deadlineRoomCleanupAcknowledgedAt} IS NULL`
    ),
    idUserAttemptUnique: unique(
      "interview_session_id_user_start_attempt_uniq"
    ).on(table.id, table.userId, table.startAttemptId),
    idAttemptUnique: unique("interview_session_id_start_attempt_uniq").on(
      table.id,
      table.startAttemptId
    ),
    stableAttemptUnique: uniqueIndex("interview_session_user_start_attempt_idx")
      .on(table.userId, table.startAttemptId)
      .where(sql`${table.startContractVersion} = 1`),
    stableRoomUnique: uniqueIndex("interview_session_livekit_room_v1_idx")
      .on(table.livekitRoomName)
      .where(sql`${table.startContractVersion} = 1`),
    userIdStatusIdx: index("interview_session_user_status_idx").on(
      table.userId,
      table.status
    ),
    endedAtIdx: index("interview_session_ended_at_idx").on(table.endedAt),
    lifecycleStateTransitionIdx: index(
      "interview_session_lifecycle_state_transition_idx"
    ).on(table.lifecycleState, table.lastTransitionAt),
    reconnectDeadlineIdx: index("interview_session_reconnect_deadline_idx").on(
      table.lifecycleState,
      table.reconnectDeadlineAt
    ),
    presenceReconciliationIdx: index(
      "interview_session_presence_reconciliation_idx"
    ).on(table.lifecycleState, table.presenceReconciledAt),
    roomCleanupRecoveryIdx: index(
      "interview_session_room_cleanup_recovery_idx"
    ).on(table.roomCleanupPending, table.roomCleanupAttemptedAt),
    roomProvisioningRecoveryIdx: index(
      "interview_session_room_provisioning_recovery_idx"
    ).on(table.roomProvisioningPending, table.roomProvisioningStartedAt),
    userLifecycleStateIdx: index(
      "interview_session_user_lifecycle_state_idx"
    ).on(table.userId, table.lifecycleState),
    stableProvisioningRecoveryIdx: index(
      "interview_session_stable_provisioning_recovery_idx"
    ).on(table.provisioningState, table.provisioningLeaseExpiresAt),
    deadlineRoomCleanupIdx: index(
      "interview_session_deadline_room_cleanup_idx"
    ).on(table.deadlineRoomCleanupStatus, table.terminalReason),
  })
);
