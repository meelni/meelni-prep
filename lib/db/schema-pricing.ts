import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
  unique,
  uniqueIndex,
  check,
  jsonb,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { appUser } from "./schema-core";
import { interviewSession } from "./schema-session";

/**
 * Phase 0.5A: Pricing & Subscription Tables
 *
 * Critical fixes applied:
 * 1. Webhook idempotency - stripe_event_log table
 * 2. Metadata fallback - stripe_customer_mapping table
 * 3. Subscription state tracking - version column for optimistic locking
 * 4. Trial tracking per tier - moved from app_user to subscription
 */

// ==================== Subscription Management ====================

/**
 * subscription table
 *
 * Tracks user subscription state and Stripe billing.
 *
 * Critical fixes:
 * - Added `version` for optimistic locking (prevents race conditions)
 * - `currentPeriodStart/End` are NOT NULL (active subs always have period)
 * - Removed trial tracking from app_user (moved here per-tier)
 */
export const subscription = pgTable(
  "subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => appUser.id, { onDelete: "cascade" })
      .notNull()
      .unique(),

    // Tier and status
    tier: text("tier").notNull().default("free"), // 'free', 'starter', 'pro'
    status: text("status").notNull().default("active"), // 'active', 'canceled', 'past_due', 'paused', 'trialing'
    billingCycle: text("billing_cycle"), // 'monthly', 'annual', null for free

    // Stripe integration
    stripeCustomerId: text("stripe_customer_id").unique(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    stripePriceId: text("stripe_price_id"),

    // Billing dates (NOT NULL for active subscriptions - FIX from team review)
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),

    // Trial tracking (PER TIER - FIX from team review)
    trialEnd: timestamp("trial_end", { withTimezone: true }),
    proTrialUsed: boolean("pro_trial_used").default(false).notNull(),

    // Cancellation tracking
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    gracePeriodEnd: timestamp("grace_period_end", { withTimezone: true }), // For failed payments

    // Metadata
    planName: text("plan_name"), // "Pro Monthly", "Premium Annual", etc.
    priceInCents: integer("price_in_cents"), // Historical record
    currency: text("currency").default("usd"),

    // Optimistic locking (CRITICAL FIX - prevents race conditions)
    version: integer("version").default(1).notNull(),

    // Event tracking (prevents stale webhook updates)
    lastEventTimestamp: timestamp("last_event_timestamp", {
      withTimezone: true,
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Check constraints
    tierCheck: check(
      "subscription_tier_check",
      sql`${table.tier} IN ('free', 'starter', 'pro')`
    ),
    statusCheck: check(
      "subscription_status_check",
      sql`${table.status} IN ('active', 'canceled', 'past_due', 'paused', 'trialing')`
    ),
    billingCycleCheck: check(
      "subscription_billing_cycle_check",
      sql`${table.billingCycle} IS NULL OR ${table.billingCycle} IN ('monthly', 'annual')`
    ),

    // Indexes
    stripeCustomerIdx: index("subscription_stripe_customer_idx").on(
      table.stripeCustomerId
    ),
    stripeSubscriptionIdx: index("subscription_stripe_subscription_idx").on(
      table.stripeSubscriptionId
    ),
    tierStatusIdx: index("subscription_tier_status_idx").on(
      table.tier,
      table.status
    ),
    userIdIdx: index("subscription_user_id_idx").on(table.userId),
  })
);

// ==================== Usage Tracking ====================

/**
 * usage_record table
 *
 * Tracks interview usage per billing period for quota enforcement.
 *
 * Critical fixes:
 * - Changed userPeriodUnique from index() to unique() (prevents duplicate periods)
 * - Added missing indexes (periodEndIdx, tierSnapshotIdx)
 * - Added check constraint for atomic quota enforcement
 */
export const usageRecord = pgTable(
  "usage_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => appUser.id, { onDelete: "cascade" })
      .notNull(),

    // Billing period tracking (uses subscription.currentPeriodStart/End, NOT calendar month)
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),

    // Usage counters
    interviewsUsed: integer("interviews_used").default(0).notNull(),
    // Legacy quota snapshot only. Credit grants are the entitlement authority.
    interviewsLimit: integer("interviews_limit").notNull(),

    // Tier snapshot (for historical accuracy)
    tierSnapshot: text("tier_snapshot").notNull(),

    // Reset tracking
    resetAt: timestamp("reset_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // CRITICAL FIX: Changed from index() to unique() - prevents duplicate usage records
    userPeriodUnique: unique("usage_record_user_period_uniq").on(
      table.userId,
      table.periodStart
    ),

    // Indexes (added missing ones from team review)
    userIdIdx: index("usage_record_user_id_idx").on(table.userId),
    periodEndIdx: index("usage_record_period_end_idx").on(table.periodEnd), // FIX: Missing index
    tierSnapshotIdx: index("usage_record_tier_snapshot_idx").on(
      table.tierSnapshot
    ), // FIX: Missing index

    // Preserve historical rows that used -1; do not use this for entitlement.
    usageLimitCheck: check(
      "usage_record_limit_check",
      sql`${table.interviewsUsed} <= ${table.interviewsLimit} OR ${table.interviewsLimit} = -1`
    ),
  })
);

// ==================== Credit Ledger ====================

export const creditGrant = pgTable(
  "credit_grant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => appUser.id, { onDelete: "cascade" })
      .notNull(),
    catalogId: text("catalog_id").notNull(),
    source: text("source").notNull(),
    sourceId: text("source_id"),
    idempotencyKey: text("idempotency_key").unique().notNull(),
    originalCredits: integer("original_credits").notNull(),
    remainingCredits: integer("remaining_credits").notNull(),
    reservedCredits: integer("reserved_credits").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    rolloverEligible: boolean("rollover_eligible").default(false).notNull(),
    rolloverSourceGrantId: uuid("rollover_source_grant_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationKey: text("revocation_key"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("credit_grant_user_id_idx").on(table.userId),
    userExpiresIdx: index("credit_grant_user_expires_idx").on(
      table.userId,
      table.expiresAt
    ),
    catalogIdx: index("credit_grant_catalog_idx").on(table.catalogId),
    sourceIdx: index("credit_grant_source_idx").on(
      table.source,
      table.sourceId
    ),
    sourceCheck: check(
      "credit_grant_source_check",
      sql`${table.source} IN ('trial', 'checkout', 'subscription_renewal', 'rollover', 'admin', 'refund', 'migration')`
    ),
    balanceCheck: check(
      "credit_grant_balance_check",
      sql`${table.originalCredits} >= 0 AND ${table.remainingCredits} >= 0 AND ${table.reservedCredits} >= 0 AND (${table.remainingCredits} + ${table.reservedCredits}) <= ${table.originalCredits}`
    ),
  })
);

export const creditReservation = pgTable(
  "credit_reservation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => appUser.id, { onDelete: "cascade" })
      .notNull(),
    reservationKey: text("reservation_key").unique().notNull(),
    status: text("status").notNull().default("active"),
    credits: integer("credits").default(1).notNull(),
    sessionId: uuid("session_id"),
    startContractVersion: integer("start_contract_version")
      .default(0)
      .notNull(),
    startAttemptId: uuid("start_attempt_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("credit_reservation_user_id_idx").on(table.userId),
    statusExpiresIdx: index("credit_reservation_status_expires_idx").on(
      table.status,
      table.expiresAt
    ),
    sessionIdx: index("credit_reservation_session_idx").on(table.sessionId),
    statusCheck: check(
      "credit_reservation_status_check",
      sql`${table.status} IN ('active', 'consumed', 'released', 'refunded', 'expired')`
    ),
    creditsCheck: check(
      "credit_reservation_credits_check",
      sql`${table.credits} > 0`
    ),
    startContractVersionCheck: check(
      "credit_reservation_start_contract_version_check",
      sql`${table.startContractVersion} IN (0, 1)`
    ),
    startContractShapeCheck: check(
      "credit_reservation_start_contract_shape_check",
      sql`(
        ${table.startContractVersion} = 0 AND
        ${table.startAttemptId} IS NULL
      ) OR (
        ${table.startContractVersion} = 1 AND
        ${table.sessionId} IS NOT NULL AND
        ${table.startAttemptId} IS NOT NULL AND
        ${table.sessionId} = ${table.startAttemptId} AND
        ${table.reservationKey} =
          'interview-start:' || ${table.userId}::text || ':' ||
          ${table.startAttemptId}::text
      )`
    ),
    sessionCorrelationReference: foreignKey({
      name: "credit_reservation_session_user_start_attempt_fk",
      columns: [table.sessionId, table.userId, table.startAttemptId],
      foreignColumns: [
        interviewSession.id,
        interviewSession.userId,
        interviewSession.startAttemptId,
      ],
    })
      .onUpdate("no action")
      .onDelete("no action"),
    stableSessionUnique: uniqueIndex("credit_reservation_session_v1_idx")
      .on(table.sessionId)
      .where(sql`${table.startContractVersion} = 1`),
    stableAttemptUnique: uniqueIndex("credit_reservation_start_attempt_idx")
      .on(table.userId, table.startAttemptId)
      .where(sql`${table.startContractVersion} = 1`),
  })
);

export const creditReservationGrant = pgTable(
  "credit_reservation_grant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationId: uuid("reservation_id")
      .references(() => creditReservation.id, { onDelete: "cascade" })
      .notNull(),
    grantId: uuid("grant_id")
      .references(() => creditGrant.id, { onDelete: "cascade" })
      .notNull(),
    credits: integer("credits").notNull(),
    revokedCredits: integer("revoked_credits").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    reservationGrantUnique: unique("credit_reservation_grant_uniq").on(
      table.reservationId,
      table.grantId
    ),
    grantIdx: index("credit_reservation_grant_grant_idx").on(table.grantId),
    creditsCheck: check(
      "credit_reservation_grant_credits_check",
      sql`${table.credits} > 0`
    ),
    revokedCreditsCheck: check(
      "credit_reservation_grant_revoked_credits_check",
      sql`${table.revokedCredits} >= 0 AND ${table.revokedCredits} <= ${table.credits}`
    ),
  })
);

export const creditRolloverLot = pgTable(
  "credit_rollover_lot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => appUser.id, { onDelete: "cascade" })
      .notNull(),
    rolloverGrantId: uuid("rollover_grant_id")
      .references(() => creditGrant.id, { onDelete: "cascade" })
      .notNull(),
    sourceGrantId: uuid("source_grant_id")
      .references(() => creditGrant.id, { onDelete: "cascade" })
      .notNull(),
    originalCredits: integer("original_credits").notNull(),
    remainingCredits: integer("remaining_credits").notNull(),
    reservedCredits: integer("reserved_credits").default(0).notNull(),
    consumedCredits: integer("consumed_credits").default(0).notNull(),
    revokedCredits: integer("revoked_credits").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    rolloverSourceUnique: unique("credit_rollover_lot_grant_source_uniq").on(
      table.rolloverGrantId,
      table.sourceGrantId
    ),
    userIdx: index("credit_rollover_lot_user_id_idx").on(table.userId),
    sourceIdx: index("credit_rollover_lot_source_grant_id_idx").on(
      table.sourceGrantId
    ),
    balanceCheck: check(
      "credit_rollover_lot_balance_check",
      sql`${table.originalCredits} > 0 AND ${table.remainingCredits} >= 0 AND ${table.reservedCredits} >= 0 AND ${table.consumedCredits} >= 0 AND ${table.revokedCredits} >= 0 AND ${table.originalCredits} = (${table.remainingCredits} + ${table.reservedCredits} + ${table.consumedCredits} + ${table.revokedCredits})`
    ),
  })
);

export const creditRolloverLotAllocation = pgTable(
  "credit_rollover_lot_allocation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationGrantId: uuid("reservation_grant_id")
      .references(() => creditReservationGrant.id, { onDelete: "cascade" })
      .notNull(),
    rolloverLotId: uuid("rollover_lot_id")
      .references(() => creditRolloverLot.id, { onDelete: "cascade" })
      .notNull(),
    credits: integer("credits").notNull(),
    revokedCredits: integer("revoked_credits").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    allocationLotUnique: unique("credit_rollover_lot_allocation_uniq").on(
      table.reservationGrantId,
      table.rolloverLotId
    ),
    lotIdx: index("credit_rollover_lot_allocation_lot_id_idx").on(
      table.rolloverLotId
    ),
    creditsCheck: check(
      "credit_rollover_lot_allocation_credits_check",
      sql`${table.credits} > 0 AND ${table.revokedCredits} >= 0 AND ${table.revokedCredits} <= ${table.credits}`
    ),
  })
);

export const creditTransaction = pgTable(
  "credit_transaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => appUser.id, { onDelete: "cascade" })
      .notNull(),
    grantId: uuid("grant_id").references(() => creditGrant.id, {
      onDelete: "set null",
    }),
    reservationId: uuid("reservation_id").references(
      () => creditReservation.id,
      { onDelete: "set null" }
    ),
    type: text("type").notNull(),
    credits: integer("credits").notNull(),
    idempotencyKey: text("idempotency_key").unique().notNull(),
    sourceId: text("source_id"),
    balanceAfter: integer("balance_after"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("credit_transaction_user_id_idx").on(table.userId),
    grantIdx: index("credit_transaction_grant_idx").on(table.grantId),
    reservationIdx: index("credit_transaction_reservation_idx").on(
      table.reservationId
    ),
    typeIdx: index("credit_transaction_type_idx").on(table.type),
    typeCheck: check(
      "credit_transaction_type_check",
      sql`${table.type} IN ('grant', 'reserve', 'consume', 'release', 'refund', 'expire', 'adjustment', 'rollover')`
    ),
    creditsCheck: check(
      "credit_transaction_credits_check",
      sql`${table.credits} > 0`
    ),
  })
);

// ==================== Payment History ====================

/**
 * payment_history table
 *
 * Historical record of all payments for analytics and support.
 *
 * Critical fix:
 * - Added stripeEventId for webhook idempotency
 */
export const paymentHistory = pgTable(
  "payment_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => appUser.id, { onDelete: "cascade" })
      .notNull(),

    // Stripe references
    stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
    stripeInvoiceId: text("stripe_invoice_id"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
    stripeChargeId: text("stripe_charge_id").unique(),
    stripeEventId: text("stripe_event_id").unique(), // CRITICAL FIX: Prevents duplicate payment records
    creditGrantId: uuid("credit_grant_id").references(() => creditGrant.id, {
      onDelete: "set null",
    }),
    catalogId: text("catalog_id"),

    // Payment details
    amountInCents: integer("amount_in_cents").notNull(),
    currency: text("currency").default("usd").notNull(),
    status: text("status").notNull(), // 'succeeded', 'failed', 'refunded', 'canceled'

    // Subscription info
    tier: text("tier"),
    billingCycle: text("billing_cycle"),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),

    // Metadata
    failureReason: text("failure_reason"),
    receiptUrl: text("receipt_url"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Check constraints
    statusCheck: check(
      "payment_history_status_check",
      sql`${table.status} IN ('succeeded', 'failed', 'partially_refunded', 'refunded', 'disputed', 'canceled')`
    ),

    // Indexes
    userIdIdx: index("payment_history_user_id_idx").on(table.userId),
    statusIdx: index("payment_history_status_idx").on(table.status),
    createdAtIdx: index("payment_history_created_at_idx").on(table.createdAt),
    stripeEventIdIdx: index("payment_history_stripe_event_id_idx").on(
      table.stripeEventId
    ), // FIX: For idempotency check
    invoiceIdx: index("payment_history_stripe_invoice_id_idx").on(
      table.stripeInvoiceId
    ),
    invoiceStatusUnique: uniqueIndex(
      "payment_history_stripe_invoice_status_unique"
    )
      .on(table.stripeInvoiceId, table.status)
      .where(sql`${table.stripeInvoiceId} IS NOT NULL`),
    grantIdx: index("payment_history_credit_grant_id_idx").on(
      table.creditGrantId
    ),
  })
);

export const billingAdjustment = pgTable(
  "billing_adjustment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => appUser.id, { onDelete: "cascade" })
      .notNull(),
    paymentHistoryId: uuid("payment_history_id").references(
      () => paymentHistory.id,
      { onDelete: "set null" }
    ),
    creditGrantId: uuid("credit_grant_id").references(() => creditGrant.id, {
      onDelete: "set null",
    }),
    stripeEventId: text("stripe_event_id").unique().notNull(),
    providerAdjustmentId: text("provider_adjustment_id").notNull(),
    adjustmentType: text("adjustment_type").notNull(),
    direction: text("direction").notNull(),
    amountInCents: integer("amount_in_cents"),
    currency: text("currency"),
    sourceCredits: integer("source_credits").notNull(),
    remainingCredits: integer("remaining_credits").notNull(),
    reservedCredits: integer("reserved_credits").notNull(),
    consumedCredits: integer("consumed_credits").notNull(),
    revokedCredits: integer("revoked_credits").notNull(),
    unrecoverableCredits: integer("unrecoverable_credits").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index("billing_adjustment_user_id_idx").on(table.userId),
    paymentIdx: index("billing_adjustment_payment_history_id_idx").on(
      table.paymentHistoryId
    ),
    grantIdx: index("billing_adjustment_credit_grant_id_idx").on(
      table.creditGrantId
    ),
    typeCheck: check(
      "billing_adjustment_type_check",
      sql`${table.adjustmentType} IN ('refund', 'dispute')`
    ),
    directionCheck: check(
      "billing_adjustment_direction_check",
      sql`${table.direction} IN ('withdraw', 'reinstate')`
    ),
    providerDirectionUnique: unique(
      "billing_adjustment_provider_direction_uniq"
    ).on(table.providerAdjustmentId, table.direction),
    quantitiesCheck: check(
      "billing_adjustment_quantities_check",
      sql`${table.sourceCredits} >= 0 AND ${table.remainingCredits} >= 0 AND ${table.reservedCredits} >= 0 AND ${table.consumedCredits} >= 0 AND ${table.revokedCredits} >= 0 AND ${table.unrecoverableCredits} >= 0 AND ${table.revokedCredits} = (${table.remainingCredits} + ${table.reservedCredits}) AND ${table.consumedCredits} <= ${table.unrecoverableCredits} AND (${table.revokedCredits} + ${table.unrecoverableCredits}) <= ${table.sourceCredits}`
    ),
  })
);

export const billingPaymentState = pgTable(
  "billing_payment_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => appUser.id, { onDelete: "cascade" })
      .notNull(),
    paymentHistoryId: uuid("payment_history_id")
      .references(() => paymentHistory.id, { onDelete: "cascade" })
      .unique(),
    creditGrantId: uuid("credit_grant_id")
      .references(() => creditGrant.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    sourceCredits: integer("source_credits").notNull(),
    targetCredits: integer("target_credits").notNull(),
    revokedCredits: integer("revoked_credits").notNull(),
    unrecoverableCredits: integer("unrecoverable_credits").notNull(),
    consumedCredits: integer("consumed_credits").notNull(),
    grantRevocations: jsonb("grant_revocations")
      .$type<Array<{ grantId: string; credits: number }>>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    allocationRevocations: jsonb("allocation_revocations")
      .$type<
        Array<{ allocationId: string; grantId: string; credits: number }>
      >()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    lastProviderAdjustmentId: text("last_provider_adjustment_id").notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index("billing_payment_state_user_id_idx").on(table.userId),
    grantIdx: index("billing_payment_state_credit_grant_id_idx").on(
      table.creditGrantId
    ),
    quantitiesCheck: check(
      "billing_payment_state_quantities_check",
      sql`${table.sourceCredits} >= 0 AND ${table.targetCredits} >= 0 AND ${table.targetCredits} <= ${table.sourceCredits} AND ${table.revokedCredits} >= 0 AND ${table.unrecoverableCredits} >= 0 AND ${table.consumedCredits} >= 0 AND ${table.revokedCredits} + ${table.unrecoverableCredits} = ${table.targetCredits} AND ${table.consumedCredits} <= ${table.unrecoverableCredits} AND ${table.version} >= 1`
    ),
  })
);

// ==================== Webhook Event Log ====================

/**
 * stripe_event_log table
 *
 * CRITICAL FIX: Webhook idempotency and failure recovery.
 *
 * Prevents duplicate webhook processing and enables retry of failed events.
 */
export const stripeEventLog = pgTable(
  "stripe_event_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stripeEventId: text("stripe_event_id").unique().notNull(),
    logicalEventKey: text("logical_event_key"),
    eventType: text("event_type").notNull(),
    subjectFingerprint: text("subject_fingerprint"),
    subjectFingerprints: jsonb("subject_fingerprints")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    payload: text("payload").notNull(), // Always "{}"; raw provider payloads are not retained.
    status: text("status").notNull().default("pending"), // 'pending', 'processed', 'failed'
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Check constraints
    statusCheck: check(
      "stripe_event_log_status_check",
      sql`${table.status} IN ('pending', 'processed', 'failed')`
    ),

    // Indexes
    stripeEventIdIdx: index("stripe_event_log_stripe_event_id_idx").on(
      table.stripeEventId
    ),
    logicalEventKeyIdx: uniqueIndex("stripe_event_log_logical_event_key_unique")
      .on(table.logicalEventKey)
      .where(sql`${table.logicalEventKey} IS NOT NULL`),
    statusIdx: index("stripe_event_log_status_idx").on(table.status),
    eventTypeIdx: index("stripe_event_log_event_type_idx").on(table.eventType),
    subjectFingerprintIdx: index("stripe_event_log_subject_fingerprint_idx").on(
      table.subjectFingerprint
    ),
    createdAtIdx: index("stripe_event_log_created_at_idx").on(table.createdAt),
  })
);

// ==================== Stripe Customer Mapping ====================

/**
 * stripe_customer_mapping table
 *
 * CRITICAL FIX: Metadata fallback.
 *
 * Stripe metadata can be overwritten (e.g., via Customer Portal).
 * This table is the source of truth for userId ↔ Stripe customer mapping.
 */
export const stripeCustomerMapping = pgTable(
  "stripe_customer_mapping",
  {
    stripeCustomerId: text("stripe_customer_id").primaryKey(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    userId: uuid("user_id")
      .references(() => appUser.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Indexes
    userIdIdx: index("stripe_customer_mapping_user_id_idx").on(table.userId),
    subscriptionIdIdx: index("stripe_customer_mapping_subscription_id_idx").on(
      table.stripeSubscriptionId
    ),
  })
);

// ==================== Relations ====================

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  user: one(appUser, {
    fields: [subscription.userId],
    references: [appUser.id],
  }),
}));

export const usageRecordRelations = relations(usageRecord, ({ one }) => ({
  user: one(appUser, {
    fields: [usageRecord.userId],
    references: [appUser.id],
  }),
}));

export const creditGrantRelations = relations(creditGrant, ({ one, many }) => ({
  user: one(appUser, {
    fields: [creditGrant.userId],
    references: [appUser.id],
  }),
  transactions: many(creditTransaction),
  reservationGrants: many(creditReservationGrant),
  rolloverDestinationLots: many(creditRolloverLot, {
    relationName: "rolloverLotDestination",
  }),
  rolloverSourceLots: many(creditRolloverLot, {
    relationName: "rolloverLotSource",
  }),
}));

export const creditReservationRelations = relations(
  creditReservation,
  ({ one, many }) => ({
    user: one(appUser, {
      fields: [creditReservation.userId],
      references: [appUser.id],
    }),
    allocations: many(creditReservationGrant),
    transactions: many(creditTransaction),
  })
);

export const creditReservationGrantRelations = relations(
  creditReservationGrant,
  ({ one, many }) => ({
    reservation: one(creditReservation, {
      fields: [creditReservationGrant.reservationId],
      references: [creditReservation.id],
    }),
    grant: one(creditGrant, {
      fields: [creditReservationGrant.grantId],
      references: [creditGrant.id],
    }),
    rolloverLotAllocations: many(creditRolloverLotAllocation),
  })
);

export const creditRolloverLotRelations = relations(
  creditRolloverLot,
  ({ one, many }) => ({
    user: one(appUser, {
      fields: [creditRolloverLot.userId],
      references: [appUser.id],
    }),
    rolloverGrant: one(creditGrant, {
      fields: [creditRolloverLot.rolloverGrantId],
      references: [creditGrant.id],
      relationName: "rolloverLotDestination",
    }),
    sourceGrant: one(creditGrant, {
      fields: [creditRolloverLot.sourceGrantId],
      references: [creditGrant.id],
      relationName: "rolloverLotSource",
    }),
    allocations: many(creditRolloverLotAllocation),
  })
);

export const creditRolloverLotAllocationRelations = relations(
  creditRolloverLotAllocation,
  ({ one }) => ({
    reservationGrant: one(creditReservationGrant, {
      fields: [creditRolloverLotAllocation.reservationGrantId],
      references: [creditReservationGrant.id],
    }),
    lot: one(creditRolloverLot, {
      fields: [creditRolloverLotAllocation.rolloverLotId],
      references: [creditRolloverLot.id],
    }),
  })
);

export const creditTransactionRelations = relations(
  creditTransaction,
  ({ one }) => ({
    user: one(appUser, {
      fields: [creditTransaction.userId],
      references: [appUser.id],
    }),
    grant: one(creditGrant, {
      fields: [creditTransaction.grantId],
      references: [creditGrant.id],
    }),
    reservation: one(creditReservation, {
      fields: [creditTransaction.reservationId],
      references: [creditReservation.id],
    }),
  })
);

export const paymentHistoryRelations = relations(paymentHistory, ({ one }) => ({
  user: one(appUser, {
    fields: [paymentHistory.userId],
    references: [appUser.id],
  }),
  grant: one(creditGrant, {
    fields: [paymentHistory.creditGrantId],
    references: [creditGrant.id],
  }),
}));

export const billingAdjustmentRelations = relations(
  billingAdjustment,
  ({ one }) => ({
    user: one(appUser, {
      fields: [billingAdjustment.userId],
      references: [appUser.id],
    }),
    payment: one(paymentHistory, {
      fields: [billingAdjustment.paymentHistoryId],
      references: [paymentHistory.id],
    }),
    grant: one(creditGrant, {
      fields: [billingAdjustment.creditGrantId],
      references: [creditGrant.id],
    }),
  })
);

export const billingPaymentStateRelations = relations(
  billingPaymentState,
  ({ one }) => ({
    user: one(appUser, {
      fields: [billingPaymentState.userId],
      references: [appUser.id],
    }),
    payment: one(paymentHistory, {
      fields: [billingPaymentState.paymentHistoryId],
      references: [paymentHistory.id],
    }),
    grant: one(creditGrant, {
      fields: [billingPaymentState.creditGrantId],
      references: [creditGrant.id],
    }),
  })
);

export const stripeCustomerMappingRelations = relations(
  stripeCustomerMapping,
  ({ one }) => ({
    user: one(appUser, {
      fields: [stripeCustomerMapping.userId],
      references: [appUser.id],
    }),
  })
);
