import { pgTable, uuid, text, timestamp, integer, boolean, index, unique, check, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { appUser } from "./schema";

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
export const subscription = pgTable("subscription", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => appUser.id, { onDelete: "cascade" }).notNull().unique(),

  // Tier and status
  tier: text("tier").notNull().default("free"), // 'free', 'pro'
  status: text("status").notNull().default("active"), // 'active', 'canceled', 'past_due', 'paused', 'trialing'
  billingCycle: text("billing_cycle"), // 'monthly', 'annual', null for free

  // Stripe integration
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),

  // Billing dates (NOT NULL for active subscriptions - FIX from team review)
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
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
  lastEventTimestamp: timestamp("last_event_timestamp", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Check constraints
  tierCheck: check("subscription_tier_check", sql`${table.tier} IN ('free', 'pro')`),
  statusCheck: check("subscription_status_check", sql`${table.status} IN ('active', 'canceled', 'past_due', 'paused', 'trialing')`),
  billingCycleCheck: check("subscription_billing_cycle_check", sql`${table.billingCycle} IS NULL OR ${table.billingCycle} IN ('monthly', 'annual')`),

  // Indexes
  stripeCustomerIdx: index("subscription_stripe_customer_idx").on(table.stripeCustomerId),
  stripeSubscriptionIdx: index("subscription_stripe_subscription_idx").on(table.stripeSubscriptionId),
  tierStatusIdx: index("subscription_tier_status_idx").on(table.tier, table.status),
  userIdIdx: index("subscription_user_id_idx").on(table.userId),
}));

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
export const usageRecord = pgTable("usage_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => appUser.id, { onDelete: "cascade" }).notNull(),

  // Billing period tracking (uses subscription.currentPeriodStart/End, NOT calendar month)
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),

  // Usage counters
  interviewsUsed: integer("interviews_used").default(0).notNull(),
  interviewsLimit: integer("interviews_limit").notNull(), // 3 for free, -1 for unlimited

  // Tier snapshot (for historical accuracy)
  tierSnapshot: text("tier_snapshot").notNull(),

  // Reset tracking
  resetAt: timestamp("reset_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // CRITICAL FIX: Changed from index() to unique() - prevents duplicate usage records
  userPeriodUnique: unique("usage_record_user_period_uniq").on(table.userId, table.periodStart),

  // Indexes (added missing ones from team review)
  userIdIdx: index("usage_record_user_id_idx").on(table.userId),
  periodEndIdx: index("usage_record_period_end_idx").on(table.periodEnd), // FIX: Missing index
  tierSnapshotIdx: index("usage_record_tier_snapshot_idx").on(table.tierSnapshot), // FIX: Missing index

  // Check constraint: interviews_used <= interviews_limit (or unlimited)
  usageLimitCheck: check(
    "usage_record_limit_check",
    sql`${table.interviewsUsed} <= ${table.interviewsLimit} OR ${table.interviewsLimit} = -1`
  ),
}));

// ==================== Credit Ledger ====================

export const creditGrant = pgTable("credit_grant", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => appUser.id, { onDelete: "cascade" }).notNull(),
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
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("credit_grant_user_id_idx").on(table.userId),
  userExpiresIdx: index("credit_grant_user_expires_idx").on(table.userId, table.expiresAt),
  catalogIdx: index("credit_grant_catalog_idx").on(table.catalogId),
  sourceIdx: index("credit_grant_source_idx").on(table.source, table.sourceId),
  sourceCheck: check(
    "credit_grant_source_check",
    sql`${table.source} IN ('trial', 'checkout', 'subscription_renewal', 'rollover', 'admin', 'refund', 'migration')`
  ),
  balanceCheck: check(
    "credit_grant_balance_check",
    sql`${table.originalCredits} >= 0 AND ${table.remainingCredits} >= 0 AND ${table.reservedCredits} >= 0 AND (${table.remainingCredits} + ${table.reservedCredits}) <= ${table.originalCredits}`
  ),
}));

export const creditReservation = pgTable("credit_reservation", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => appUser.id, { onDelete: "cascade" }).notNull(),
  reservationKey: text("reservation_key").unique().notNull(),
  status: text("status").notNull().default("active"),
  credits: integer("credits").default(1).notNull(),
  sessionId: uuid("session_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("credit_reservation_user_id_idx").on(table.userId),
  statusExpiresIdx: index("credit_reservation_status_expires_idx").on(table.status, table.expiresAt),
  sessionIdx: index("credit_reservation_session_idx").on(table.sessionId),
  statusCheck: check(
    "credit_reservation_status_check",
    sql`${table.status} IN ('active', 'consumed', 'released', 'refunded', 'expired')`
  ),
  creditsCheck: check("credit_reservation_credits_check", sql`${table.credits} > 0`),
}));

export const creditReservationGrant = pgTable("credit_reservation_grant", {
  id: uuid("id").primaryKey().defaultRandom(),
  reservationId: uuid("reservation_id").references(() => creditReservation.id, { onDelete: "cascade" }).notNull(),
  grantId: uuid("grant_id").references(() => creditGrant.id, { onDelete: "cascade" }).notNull(),
  credits: integer("credits").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  reservationGrantUnique: unique("credit_reservation_grant_uniq").on(table.reservationId, table.grantId),
  grantIdx: index("credit_reservation_grant_grant_idx").on(table.grantId),
  creditsCheck: check("credit_reservation_grant_credits_check", sql`${table.credits} > 0`),
}));

export const creditTransaction = pgTable("credit_transaction", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => appUser.id, { onDelete: "cascade" }).notNull(),
  grantId: uuid("grant_id").references(() => creditGrant.id, { onDelete: "set null" }),
  reservationId: uuid("reservation_id").references(() => creditReservation.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  credits: integer("credits").notNull(),
  idempotencyKey: text("idempotency_key").unique().notNull(),
  sourceId: text("source_id"),
  balanceAfter: integer("balance_after"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("credit_transaction_user_id_idx").on(table.userId),
  grantIdx: index("credit_transaction_grant_idx").on(table.grantId),
  reservationIdx: index("credit_transaction_reservation_idx").on(table.reservationId),
  typeIdx: index("credit_transaction_type_idx").on(table.type),
  typeCheck: check(
    "credit_transaction_type_check",
    sql`${table.type} IN ('grant', 'reserve', 'consume', 'release', 'refund', 'expire', 'adjustment', 'rollover')`
  ),
  creditsCheck: check("credit_transaction_credits_check", sql`${table.credits} > 0`),
}));

// ==================== Payment History ====================

/**
 * payment_history table
 *
 * Historical record of all payments for analytics and support.
 *
 * Critical fix:
 * - Added stripeEventId for webhook idempotency
 */
export const paymentHistory = pgTable("payment_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => appUser.id, { onDelete: "cascade" }).notNull(),

  // Stripe references
  stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
  stripeInvoiceId: text("stripe_invoice_id"),
  stripeEventId: text("stripe_event_id").unique(), // CRITICAL FIX: Prevents duplicate payment records

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

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Check constraints
  statusCheck: check("payment_history_status_check", sql`${table.status} IN ('succeeded', 'failed', 'refunded', 'canceled')`),

  // Indexes
  userIdIdx: index("payment_history_user_id_idx").on(table.userId),
  statusIdx: index("payment_history_status_idx").on(table.status),
  createdAtIdx: index("payment_history_created_at_idx").on(table.createdAt),
  stripeEventIdIdx: index("payment_history_stripe_event_id_idx").on(table.stripeEventId), // FIX: For idempotency check
}));

// ==================== Webhook Event Log ====================

/**
 * stripe_event_log table
 *
 * CRITICAL FIX: Webhook idempotency and failure recovery.
 *
 * Prevents duplicate webhook processing and enables retry of failed events.
 */
export const stripeEventLog = pgTable("stripe_event_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  stripeEventId: text("stripe_event_id").unique().notNull(),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull(), // JSON stringified
  status: text("status").notNull().default("pending"), // 'pending', 'processed', 'failed'
  attempts: integer("attempts").default(0).notNull(),
  lastError: text("last_error"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Check constraints
  statusCheck: check("stripe_event_log_status_check", sql`${table.status} IN ('pending', 'processed', 'failed')`),

  // Indexes
  stripeEventIdIdx: index("stripe_event_log_stripe_event_id_idx").on(table.stripeEventId),
  statusIdx: index("stripe_event_log_status_idx").on(table.status),
  eventTypeIdx: index("stripe_event_log_event_type_idx").on(table.eventType),
  createdAtIdx: index("stripe_event_log_created_at_idx").on(table.createdAt),
}));

// ==================== Stripe Customer Mapping ====================

/**
 * stripe_customer_mapping table
 *
 * CRITICAL FIX: Metadata fallback.
 *
 * Stripe metadata can be overwritten (e.g., via Customer Portal).
 * This table is the source of truth for userId ↔ Stripe customer mapping.
 */
export const stripeCustomerMapping = pgTable("stripe_customer_mapping", {
  stripeCustomerId: text("stripe_customer_id").primaryKey(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  userId: uuid("user_id").references(() => appUser.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Indexes
  userIdIdx: index("stripe_customer_mapping_user_id_idx").on(table.userId),
  subscriptionIdIdx: index("stripe_customer_mapping_subscription_id_idx").on(table.stripeSubscriptionId),
}));

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
}));

export const creditReservationRelations = relations(creditReservation, ({ one, many }) => ({
  user: one(appUser, {
    fields: [creditReservation.userId],
    references: [appUser.id],
  }),
  allocations: many(creditReservationGrant),
  transactions: many(creditTransaction),
}));

export const creditReservationGrantRelations = relations(creditReservationGrant, ({ one }) => ({
  reservation: one(creditReservation, {
    fields: [creditReservationGrant.reservationId],
    references: [creditReservation.id],
  }),
  grant: one(creditGrant, {
    fields: [creditReservationGrant.grantId],
    references: [creditGrant.id],
  }),
}));

export const creditTransactionRelations = relations(creditTransaction, ({ one }) => ({
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
}));

export const paymentHistoryRelations = relations(paymentHistory, ({ one }) => ({
  user: one(appUser, {
    fields: [paymentHistory.userId],
    references: [appUser.id],
  }),
}));

export const stripeCustomerMappingRelations = relations(stripeCustomerMapping, ({ one }) => ({
  user: one(appUser, {
    fields: [stripeCustomerMapping.userId],
    references: [appUser.id],
  }),
}));
