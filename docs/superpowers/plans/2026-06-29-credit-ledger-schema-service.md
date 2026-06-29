# Credit Ledger Schema And Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `SAV-121` by adding credit ledger tables and a tested credit service that can grant, reserve, consume, release, refund, expire, and roll over interview credits.

**Architecture:** Add additive Drizzle tables beside the existing subscription and usage tables so current callers keep working until later migration slices. Put credit behavior in `lib/billing/credits.ts` behind an injectable store; this makes ledger invariants testable without a live Postgres connection while preserving a schema that `SAV-122` and `SAV-123` can wire into session start and Stripe webhooks.

**Tech Stack:** TypeScript, Drizzle schema, Postgres migration SQL, Node test runner via `tsx --test`.

---

## File Structure

- Modify `lib/db/schema-pricing.ts`
  - Add `credit_grant`, `credit_reservation`, `credit_reservation_grant`, and `credit_transaction` table definitions.
  - Add relations for the new tables.
- Modify `lib/db/schema.ts`
  - Re-export new billing tables and relations from the central schema entrypoint.
  - Add user relations for credit grants, reservations, and transactions.
- Create `lib/db/migrations/0003_credit_ledger.sql`
  - Add additive Postgres tables, constraints, indexes, and RLS policies.
  - Do not run `drizzle-kit generate` for this slice because the repo already has a manual RLS migration (`0002_pricing_rls_policies.sql`) outside the Drizzle journal.
- Create `lib/billing/credits.ts`
  - Owns provider-neutral credit ledger types and operations.
  - Uses an injectable `CreditLedgerStore` so session and Stripe slices can provide a Drizzle-backed store later.
- Create `lib/billing/credits.test.ts`
  - Behavior tests for grants, reservation idempotency, consume/release/refund, expiration, and rollover cap.
- Modify `package.json`
  - Add `test:billing` script for focused ledger tests.

## Task 1: Add Ledger Schema And Migration

**Files:**
- Modify: `lib/db/schema-pricing.ts`
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0003_credit_ledger.sql`

- [ ] **Step 1: Add schema exports**

In `lib/db/schema-pricing.ts`, update imports:

```ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
  unique,
  check,
  jsonb,
} from "drizzle-orm/pg-core";
```

Add table definitions after `usageRecord`:

```ts
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
  sourceCheck: check("credit_grant_source_check", sql`${table.source} IN ('trial', 'checkout', 'subscription_renewal', 'rollover', 'admin', 'refund', 'migration')`),
  balanceCheck: check("credit_grant_balance_check", sql`${table.originalCredits} >= 0 AND ${table.remainingCredits} >= 0 AND ${table.reservedCredits} >= 0 AND (${table.remainingCredits} + ${table.reservedCredits}) <= ${table.originalCredits}`),
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
  statusCheck: check("credit_reservation_status_check", sql`${table.status} IN ('active', 'consumed', 'released', 'refunded', 'expired')`),
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
  typeCheck: check("credit_transaction_type_check", sql`${table.type} IN ('grant', 'reserve', 'consume', 'release', 'refund', 'expire', 'adjustment', 'rollover')`),
  creditsCheck: check("credit_transaction_credits_check", sql`${table.credits} > 0`),
}));
```

Add relations:

```ts
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
```

- [ ] **Step 2: Re-export schema**

In `lib/db/schema.ts`, add the new imports and exports from `./schema-pricing`, and add these `appUserRelations` entries:

```ts
  creditGrants: many(creditGrant),
  creditReservations: many(creditReservation),
  creditTransactions: many(creditTransaction),
```

Also re-export relation aliases:

```ts
  pricingCreditGrantRelations as creditGrantRelations,
  pricingCreditReservationRelations as creditReservationRelations,
  pricingCreditReservationGrantRelations as creditReservationGrantRelations,
  pricingCreditTransactionRelations as creditTransactionRelations,
```

- [ ] **Step 3: Add manual migration**

Create `lib/db/migrations/0003_credit_ledger.sql` with this full body:

```sql
CREATE TABLE "credit_grant" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "catalog_id" text NOT NULL,
  "source" text NOT NULL,
  "source_id" text,
  "idempotency_key" text NOT NULL,
  "original_credits" integer NOT NULL,
  "remaining_credits" integer NOT NULL,
  "reserved_credits" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone,
  "rollover_eligible" boolean DEFAULT false NOT NULL,
  "rollover_source_grant_id" uuid,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "credit_grant_idempotency_key_unique" UNIQUE("idempotency_key"),
  CONSTRAINT "credit_grant_source_check" CHECK ("credit_grant"."source" IN ('trial', 'checkout', 'subscription_renewal', 'rollover', 'admin', 'refund', 'migration')),
  CONSTRAINT "credit_grant_balance_check" CHECK ("credit_grant"."original_credits" >= 0 AND "credit_grant"."remaining_credits" >= 0 AND "credit_grant"."reserved_credits" >= 0 AND ("credit_grant"."remaining_credits" + "credit_grant"."reserved_credits") <= "credit_grant"."original_credits")
);
--> statement-breakpoint
CREATE TABLE "credit_reservation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "reservation_key" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "credits" integer DEFAULT 1 NOT NULL,
  "session_id" uuid,
  "expires_at" timestamp with time zone NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "credit_reservation_reservation_key_unique" UNIQUE("reservation_key"),
  CONSTRAINT "credit_reservation_status_check" CHECK ("credit_reservation"."status" IN ('active', 'consumed', 'released', 'refunded', 'expired')),
  CONSTRAINT "credit_reservation_credits_check" CHECK ("credit_reservation"."credits" > 0)
);
--> statement-breakpoint
CREATE TABLE "credit_reservation_grant" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reservation_id" uuid NOT NULL,
  "grant_id" uuid NOT NULL,
  "credits" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "credit_reservation_grant_uniq" UNIQUE("reservation_id","grant_id"),
  CONSTRAINT "credit_reservation_grant_credits_check" CHECK ("credit_reservation_grant"."credits" > 0)
);
--> statement-breakpoint
CREATE TABLE "credit_transaction" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "grant_id" uuid,
  "reservation_id" uuid,
  "type" text NOT NULL,
  "credits" integer NOT NULL,
  "idempotency_key" text NOT NULL,
  "source_id" text,
  "balance_after" integer,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "credit_transaction_idempotency_key_unique" UNIQUE("idempotency_key"),
  CONSTRAINT "credit_transaction_type_check" CHECK ("credit_transaction"."type" IN ('grant', 'reserve', 'consume', 'release', 'refund', 'expire', 'adjustment', 'rollover')),
  CONSTRAINT "credit_transaction_credits_check" CHECK ("credit_transaction"."credits" > 0)
);
--> statement-breakpoint
ALTER TABLE "credit_grant" ADD CONSTRAINT "credit_grant_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_reservation" ADD CONSTRAINT "credit_reservation_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_reservation_grant" ADD CONSTRAINT "credit_reservation_grant_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."credit_reservation"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_reservation_grant" ADD CONSTRAINT "credit_reservation_grant_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."credit_grant"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."credit_grant"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."credit_reservation"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "credit_grant_user_id_idx" ON "credit_grant" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "credit_grant_user_expires_idx" ON "credit_grant" USING btree ("user_id","expires_at");
--> statement-breakpoint
CREATE INDEX "credit_grant_catalog_idx" ON "credit_grant" USING btree ("catalog_id");
--> statement-breakpoint
CREATE INDEX "credit_grant_source_idx" ON "credit_grant" USING btree ("source","source_id");
--> statement-breakpoint
CREATE INDEX "credit_reservation_user_id_idx" ON "credit_reservation" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "credit_reservation_status_expires_idx" ON "credit_reservation" USING btree ("status","expires_at");
--> statement-breakpoint
CREATE INDEX "credit_reservation_session_idx" ON "credit_reservation" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "credit_reservation_grant_grant_idx" ON "credit_reservation_grant" USING btree ("grant_id");
--> statement-breakpoint
CREATE INDEX "credit_transaction_user_id_idx" ON "credit_transaction" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "credit_transaction_grant_idx" ON "credit_transaction" USING btree ("grant_id");
--> statement-breakpoint
CREATE INDEX "credit_transaction_reservation_idx" ON "credit_transaction" USING btree ("reservation_id");
--> statement-breakpoint
CREATE INDEX "credit_transaction_type_idx" ON "credit_transaction" USING btree ("type");
--> statement-breakpoint
ALTER TABLE credit_grant ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE credit_reservation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE credit_reservation_grant ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE credit_transaction ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "Users can view own credit grants" ON credit_grant FOR SELECT USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "Service can manage credit grants" ON credit_grant FOR ALL USING (auth.role() = 'service_role');
--> statement-breakpoint
CREATE POLICY "Users can view own credit reservations" ON credit_reservation FOR SELECT USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "Service can manage credit reservations" ON credit_reservation FOR ALL USING (auth.role() = 'service_role');
--> statement-breakpoint
CREATE POLICY "Users can view own credit reservation grants" ON credit_reservation_grant FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM credit_reservation
    WHERE credit_reservation.id = credit_reservation_grant.reservation_id
      AND credit_reservation.user_id = auth.uid()
  )
);
--> statement-breakpoint
CREATE POLICY "Service can manage credit reservation grants" ON credit_reservation_grant FOR ALL USING (auth.role() = 'service_role');
--> statement-breakpoint
CREATE POLICY "Users can view own credit transactions" ON credit_transaction FOR SELECT USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "Service can manage credit transactions" ON credit_transaction FOR ALL USING (auth.role() = 'service_role');
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema-pricing.ts lib/db/schema.ts lib/db/migrations/0003_credit_ledger.sql
git commit -m "Add credit ledger schema"
```

## Task 2: Add Credit Ledger Service Contracts

**Files:**
- Create: `lib/billing/credits.ts`
- Modify: `package.json`

- [ ] **Step 1: Create service shell**

Create `lib/billing/credits.ts` with exported types:

```ts
import {
  BILLING_CATALOG,
  type BillingCatalogId,
} from "@meelni/core";

export type CreditGrantSource =
  | "trial"
  | "checkout"
  | "subscription_renewal"
  | "rollover"
  | "admin"
  | "refund"
  | "migration";

export type CreditTransactionType =
  | "grant"
  | "reserve"
  | "consume"
  | "release"
  | "refund"
  | "expire"
  | "adjustment"
  | "rollover";

export type CreditReservationStatus =
  | "active"
  | "consumed"
  | "released"
  | "refunded"
  | "expired";

export interface LedgerCreditGrant {
  id: string;
  userId: string;
  catalogId: BillingCatalogId;
  source: CreditGrantSource;
  sourceId: string | null;
  idempotencyKey: string;
  originalCredits: number;
  remainingCredits: number;
  reservedCredits: number;
  expiresAt: Date | null;
  rolloverEligible: boolean;
  rolloverSourceGrantId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerCreditReservation {
  id: string;
  userId: string;
  reservationKey: string;
  status: CreditReservationStatus;
  credits: number;
  sessionId: string | null;
  expiresAt: Date;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerReservationAllocation {
  id: string;
  reservationId: string;
  grantId: string;
  credits: number;
  createdAt: Date;
}

export interface LedgerCreditTransaction {
  id: string;
  userId: string;
  grantId: string | null;
  reservationId: string | null;
  type: CreditTransactionType;
  credits: number;
  idempotencyKey: string;
  sourceId: string | null;
  balanceAfter: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface CreditLedgerStore {
  createGrant(input: Omit<LedgerCreditGrant, "id" | "createdAt" | "updatedAt">): Promise<LedgerCreditGrant>;
  findGrantByIdempotencyKey(idempotencyKey: string): Promise<LedgerCreditGrant | null>;
  findTransactionByIdempotencyKey(idempotencyKey: string): Promise<LedgerCreditTransaction | null>;
  listSpendableGrants(userId: string, now: Date): Promise<LedgerCreditGrant[]>;
  updateGrantBalances(grantId: string, balances: Pick<LedgerCreditGrant, "remainingCredits" | "reservedCredits">): Promise<LedgerCreditGrant>;
  createReservation(input: Omit<LedgerCreditReservation, "id" | "createdAt" | "updatedAt">): Promise<LedgerCreditReservation>;
  findReservationByKey(reservationKey: string): Promise<LedgerCreditReservation | null>;
  updateReservationStatus(reservationId: string, status: CreditReservationStatus): Promise<LedgerCreditReservation>;
  createAllocation(input: Omit<LedgerReservationAllocation, "id" | "createdAt">): Promise<LedgerReservationAllocation>;
  listAllocations(reservationId: string): Promise<LedgerReservationAllocation[]>;
  createTransaction(input: Omit<LedgerCreditTransaction, "id" | "createdAt">): Promise<LedgerCreditTransaction>;
}
```

- [ ] **Step 2: Add package script**

Add to `package.json` scripts:

```json
"test:billing": "tsx --test lib/billing/*.test.ts"
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/billing/credits.ts package.json
git commit -m "Add credit ledger service contracts"
```

## Task 3: Implement Grants, Balance, And Expiration

**Files:**
- Modify: `lib/billing/credits.ts`
- Create: `lib/billing/credits.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for:

```ts
test("grantCredits is idempotent and balance ignores expired grants", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store, now: () => new Date("2026-06-29T00:00:00.000Z") });

  const first = await ledger.grantCredits({
    userId: "user-1",
    catalogId: "trial",
    source: "trial",
    idempotencyKey: "trial:user-1",
  });
  const second = await ledger.grantCredits({
    userId: "user-1",
    catalogId: "trial",
    source: "trial",
    idempotencyKey: "trial:user-1",
  });

  assert.equal(first.grant.id, second.grant.id);
  assert.equal(first.grant.originalCredits, 2);
  assert.equal(first.grant.remainingCredits, 2);

  assert.deepEqual(await ledger.getCreditBalance("user-1"), {
    availableCredits: 2,
    reservedCredits: 0,
    expiringCredits: 2,
    nextCreditExpiresAt: new Date("2026-07-06T00:00:00.000Z"),
  });

  const later = createCreditLedgerService({ store, now: () => new Date("2026-07-07T00:00:00.000Z") });
  assert.equal((await later.expireCredits("user-1")).expiredCredits, 2);
  assert.equal((await later.getCreditBalance("user-1")).availableCredits, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:billing
```

Expected: FAIL because the service functions are not implemented.

- [ ] **Step 3: Implement minimal behavior**

Implement:

- `createCreditLedgerService`
- `createMemoryCreditLedgerStore`
- `grantCredits`
- `getCreditBalance`
- `expireCredits`

Use `BILLING_CATALOG[catalogId].includedCredits` and `expiresAfterDays` to derive credit amounts and expiration dates unless explicit overrides are passed.

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test:billing
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/billing/credits.ts lib/billing/credits.test.ts
git commit -m "Add credit grant ledger behavior"
```

## Task 4: Implement Reservation, Consumption, Release, And Refund

**Files:**
- Modify: `lib/billing/credits.ts`
- Modify: `lib/billing/credits.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for:

```ts
test("reserveCredit is idempotent and consumes oldest expiring grants first", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store, now: () => new Date("2026-06-29T00:00:00.000Z") });
  await ledger.grantCredits({ userId: "user-1", catalogId: "trial", source: "trial", idempotencyKey: "trial:user-1" });

  const first = await ledger.reserveCredit({ userId: "user-1", reservationKey: "session:1", sessionId: "session-1" });
  const second = await ledger.reserveCredit({ userId: "user-1", reservationKey: "session:1", sessionId: "session-1" });

  assert.equal(first.reservation.id, second.reservation.id);
  assert.equal((await ledger.getCreditBalance("user-1")).availableCredits, 1);
  assert.equal((await ledger.getCreditBalance("user-1")).reservedCredits, 1);

  await ledger.consumeReservation({ reservationKey: "session:1", idempotencyKey: "consume:session:1" });
  await ledger.consumeReservation({ reservationKey: "session:1", idempotencyKey: "consume:session:1" });

  assert.equal((await ledger.getCreditBalance("user-1")).availableCredits, 1);
  assert.equal((await ledger.getCreditBalance("user-1")).reservedCredits, 0);
});

test("release and refund restore credits exactly once", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store, now: () => new Date("2026-06-29T00:00:00.000Z") });
  await ledger.grantCredits({ userId: "user-1", catalogId: "interview_pass", source: "checkout", idempotencyKey: "checkout:pi_1" });

  await ledger.reserveCredit({ userId: "user-1", reservationKey: "session:release", sessionId: "session-release" });
  await ledger.releaseReservation({ reservationKey: "session:release", idempotencyKey: "release:session:release" });
  await ledger.releaseReservation({ reservationKey: "session:release", idempotencyKey: "release:session:release" });
  assert.equal((await ledger.getCreditBalance("user-1")).availableCredits, 1);

  await ledger.reserveCredit({ userId: "user-1", reservationKey: "session:refund", sessionId: "session-refund" });
  await ledger.consumeReservation({ reservationKey: "session:refund", idempotencyKey: "consume:session:refund" });
  await ledger.refundReservation({ reservationKey: "session:refund", idempotencyKey: "refund:session:refund" });
  await ledger.refundReservation({ reservationKey: "session:refund", idempotencyKey: "refund:session:refund" });
  assert.equal((await ledger.getCreditBalance("user-1")).availableCredits, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:billing
```

Expected: FAIL because reservation APIs are missing.

- [ ] **Step 3: Implement behavior**

Implement:

- `reserveCredit`
- `consumeReservation`
- `releaseReservation`
- `refundReservation`

Rules:

- Spendable grants are sorted by earliest `expiresAt`, with non-expiring grants last.
- A reservation moves credits from `remainingCredits` to `reservedCredits`.
- Consumption moves credits out of `reservedCredits`.
- Release moves credits from `reservedCredits` back to `remainingCredits`.
- Refund after consumption restores credits to `remainingCredits`.
- Repeated calls with the same idempotency key return without applying balance changes again.

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test:billing
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/billing/credits.ts lib/billing/credits.test.ts
git commit -m "Add credit reservation ledger behavior"
```

## Task 5: Implement Rollover Cap Behavior

**Files:**
- Modify: `lib/billing/credits.ts`
- Modify: `lib/billing/credits.test.ts`

- [ ] **Step 1: Write failing test**

Add:

```ts
test("rolloverSubscriptionCredits respects plan cap and 60 day expiration", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store, now: () => new Date("2026-06-29T00:00:00.000Z") });

  await ledger.grantCredits({ userId: "user-1", catalogId: "pro", source: "subscription_renewal", idempotencyKey: "renewal:1", includedCredits: 12 });
  await ledger.grantCredits({ userId: "user-1", catalogId: "pro", source: "subscription_renewal", idempotencyKey: "renewal:2", includedCredits: 12 });

  const rollover = await ledger.rolloverSubscriptionCredits({
    userId: "user-1",
    catalogId: "pro",
    idempotencyKey: "rollover:2026-07",
  });

  assert.equal(rollover.rolledCredits, 12);
  assert.equal(rollover.grant?.expiresAt?.toISOString(), "2026-08-28T00:00:00.000Z");

  const duplicate = await ledger.rolloverSubscriptionCredits({
    userId: "user-1",
    catalogId: "pro",
    idempotencyKey: "rollover:2026-07",
  });
  assert.equal(duplicate.grant?.id, rollover.grant?.id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:billing
```

Expected: FAIL because rollover is missing.

- [ ] **Step 3: Implement rollover**

Implement `rolloverSubscriptionCredits`:

- Sum remaining credits for eligible non-expired grants for the user and catalog.
- Cap by `BILLING_CATALOG[catalogId].rolloverCapCredits`.
- Set rolled source grants' `remainingCredits` to `0` until the cap is satisfied.
- Create a new `rollover` grant with `expiresAt = now + rolloverExpiresAfterDays`.
- Return existing rollover grant for duplicate idempotency key.

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test:billing
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/billing/credits.ts lib/billing/credits.test.ts
git commit -m "Add credit rollover ledger behavior"
```

## Task 6: Final Validation And Linear Update

**Files:**
- Verify: all changed files
- Update: Linear `SAV-121`

- [ ] **Step 1: Run focused validation**

Run:

```bash
npm run test:billing
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run affected package validation**

Run:

```bash
npm run test:core
npm run test:packages
```

Expected: PASS.

- [ ] **Step 3: Check worktree and commits**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: clean worktree with commits for schema, service contract, grant behavior, reservation behavior, and rollover behavior.

- [ ] **Step 4: Update Linear**

Add a `SAV-121` comment:

```markdown
Implemented additive credit ledger schema and provider-neutral credit service.

Validation:
- npm run test:billing
- npm run test:core
- npm run test:packages
- npm run typecheck

Notes:
- Existing subscription/usage tables remain in place for migration safety.
- Session enforcement will consume the ledger in SAV-122.
```

Move `SAV-121` to `In Review` after opening its PR.

## Self-Review

Spec coverage:

- Credit grants store source, amount, remaining balance, expiration, and rollover metadata: Task 1 and Task 3.
- Credit transactions record grant, reserve, consume, release, refund, expire, and adjustment-compatible entries: Task 1, Task 3, Task 4, Task 5.
- Reservation and consumption are idempotent: Task 4.
- Concurrency safety: schema provides unique idempotency keys and balance constraints; `SAV-122` should use a Drizzle-backed store with transaction boundaries when wiring runtime enforcement.
- Tests cover expiration, rollover cap, duplicate idempotency keys, and refund/release behavior: Tasks 3, 4, and 5.

Intentional migration boundary:

- This slice adds the ledger and tested service behavior but does not replace `/api/session/start` or Stripe webhooks. Those are tracked in `SAV-122` and `SAV-123`.
