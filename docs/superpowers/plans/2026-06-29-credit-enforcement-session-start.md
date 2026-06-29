# Credit Enforcement Session Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `SAV-122` by making full interview start reserve one credit, consume it only after LiveKit starts successfully, and release it when setup fails.

**Architecture:** Add a Drizzle-backed `CreditLedgerStore` so production workflow code can use the same credit service tested in `SAV-121`. Update `startInterviewSessionWorkflow` to enforce credits as the single authenticated full-interview boundary and remove legacy free/pro interview-type gating from that workflow while leaving older services in place for unmigrated surfaces.

**Tech Stack:** TypeScript, Drizzle ORM, Node test runner via `tsx --test`, existing LiveKit workflow dependency injection.

---

## File Structure

- Create `lib/billing/credit-ledger-store.ts`
  - Drizzle-backed implementation of `CreditLedgerStore`.
  - Maps database rows into `LedgerCreditGrant`, `LedgerCreditReservation`, `LedgerReservationAllocation`, and `LedgerCreditTransaction`.
- Modify `lib/workflows/start-session.ts`
  - Replace `getUserTier` and `incrementUsage` dependencies with credit reservation lifecycle dependencies.
  - Reserve credit after request/question validation and before creating the session/LiveKit room.
  - Release reservation if session creation, question usage recording, metadata construction, or LiveKit start fails.
  - Consume reservation after LiveKit start succeeds.
- Modify `lib/workflows/start-session.test.ts`
  - Assert all round types are allowed when credit reservation succeeds.
  - Assert no session/LiveKit work happens when reservation fails with no credits.
  - Assert LiveKit failure releases the reservation and does not consume it.
  - Assert successful start consumes exactly one reservation.
- Verify `app/api/session/start/route.ts`
  - Confirm route remains thin and does not duplicate credit checks.

## Task 1: Add Drizzle Credit Ledger Store

**Files:**
- Create: `lib/billing/credit-ledger-store.ts`
- Test: `npm run typecheck`

- [ ] **Step 1: Create the store file**

Create `lib/billing/credit-ledger-store.ts` exporting:

```ts
import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  creditGrant,
  creditReservation,
  creditReservationGrant,
  creditTransaction,
} from "@/lib/db/schema";
import type {
  CreditLedgerStore,
  LedgerCreditGrant,
  LedgerCreditReservation,
  LedgerCreditTransaction,
  LedgerReservationAllocation,
} from "./credits";
import type { BillingCatalogId } from "@meelni/core";

type CreditLedgerDatabase = typeof db;

export function createDrizzleCreditLedgerStore(
  database: CreditLedgerDatabase = db
): CreditLedgerStore {
  return {
    async createGrant(input) {
      const inserted = await database
        .insert(creditGrant)
        .values(input)
        .onConflictDoNothing({ target: creditGrant.idempotencyKey })
        .returning();

      return mapGrant(
        inserted[0] ??
          (await this.findGrantByIdempotencyKey(input.idempotencyKey))
      );
    },
    async findGrantByIdempotencyKey(idempotencyKey) {
      const rows = await database
        .select()
        .from(creditGrant)
        .where(eq(creditGrant.idempotencyKey, idempotencyKey))
        .limit(1);
      return rows[0] ? mapGrant(rows[0]) : null;
    },
    async findTransactionByIdempotencyKey(idempotencyKey) {
      const rows = await database
        .select()
        .from(creditTransaction)
        .where(eq(creditTransaction.idempotencyKey, idempotencyKey))
        .limit(1);
      return rows[0] ? mapTransaction(rows[0]) : null;
    },
    async listSpendableGrants(userId, now) {
      const rows = await database
        .select()
        .from(creditGrant)
        .where(
          and(
            eq(creditGrant.userId, userId),
            gt(creditGrant.remainingCredits, 0),
            or(isNull(creditGrant.expiresAt), gt(creditGrant.expiresAt, now))
          )
        )
        .orderBy(asc(creditGrant.expiresAt), asc(creditGrant.createdAt));
      return rows.map(mapGrant);
    },
    async listUserGrants(userId) {
      return (await database.select().from(creditGrant).where(eq(creditGrant.userId, userId))).map(mapGrant);
    },
    async updateGrantBalances(grantId, balances) {
      const rows = await database
        .update(creditGrant)
        .set({ ...balances, updatedAt: new Date() })
        .where(eq(creditGrant.id, grantId))
        .returning();
      return mapGrant(rows[0]);
    },
    async createReservation(input) {
      const inserted = await database
        .insert(creditReservation)
        .values(input)
        .onConflictDoNothing({ target: creditReservation.reservationKey })
        .returning();
      return mapReservation(
        inserted[0] ??
          (await this.findReservationByKey(input.reservationKey))
      );
    },
    async findReservationByKey(reservationKey) {
      const rows = await database
        .select()
        .from(creditReservation)
        .where(eq(creditReservation.reservationKey, reservationKey))
        .limit(1);
      return rows[0] ? mapReservation(rows[0]) : null;
    },
    async updateReservationStatus(reservationId, status) {
      const rows = await database
        .update(creditReservation)
        .set({ status, updatedAt: new Date() })
        .where(eq(creditReservation.id, reservationId))
        .returning();
      return mapReservation(rows[0]);
    },
    async createAllocation(input) {
      const rows = await database
        .insert(creditReservationGrant)
        .values(input)
        .returning();
      return mapAllocation(rows[0]);
    },
    async listAllocations(reservationId) {
      return (
        await database
          .select()
          .from(creditReservationGrant)
          .where(eq(creditReservationGrant.reservationId, reservationId))
      ).map(mapAllocation);
    },
    async createTransaction(input) {
      const inserted = await database
        .insert(creditTransaction)
        .values(input)
        .onConflictDoNothing({ target: creditTransaction.idempotencyKey })
        .returning();
      return mapTransaction(
        inserted[0] ??
          (await this.findTransactionByIdempotencyKey(input.idempotencyKey))
      );
    },
  };
}
```

Also add mapper helpers in the same file. If TypeScript rejects nullable conflict-return values, replace the inline fallback with a small helper that throws a clear error when the unique row cannot be reloaded.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/billing/credit-ledger-store.ts
git commit -m "Add Drizzle credit ledger store"
```

## Task 2: Change Session Workflow Dependencies

**Files:**
- Modify: `lib/workflows/start-session.ts`
- Modify: `lib/workflows/start-session.test.ts`

- [ ] **Step 1: Write failing workflow tests**

Update tests to expect:

- successful interview calls `reserveCredit` then `consumeReservation`;
- `roundType: "execution"` can start when reservation succeeds;
- reservation failure returns status `402` with body error `no_credits_remaining`;
- LiveKit retryable failure calls `releaseReservation` and does not call `consumeReservation`.

- [ ] **Step 2: Run tests red**

Run:

```bash
npm run test:workflows
```

Expected: FAIL because the workflow still uses `getUserTier` and `incrementUsage`.

- [ ] **Step 3: Implement workflow credit dependencies**

Change `StartInterviewSessionDeps` to use:

```ts
reserveCredit(input: {
  userId: string;
  reservationKey: string;
  sessionId?: string | null;
}): Promise<{ reservation: { id: string; reservationKey: string } }>;
consumeReservation(input: {
  reservationKey: string;
  idempotencyKey: string;
}): Promise<unknown>;
releaseReservation(input: {
  reservationKey: string;
  idempotencyKey: string;
}): Promise<unknown>;
```

Default dependencies should create a ledger with `createCreditLedgerService({ store: createDrizzleCreditLedgerStore() })`.

- [ ] **Step 4: Update workflow order**

Use this order:

1. parse request;
2. select question;
3. upsert user;
4. build room name;
5. reserve credit with reservation key `interview-start:${userId}:${roomName}`;
6. create session;
7. record question usage;
8. start LiveKit room;
9. if LiveKit succeeds, consume reservation with key `consume:${reservationKey}`;
10. if any step after reservation fails, release reservation with key `release:${reservationKey}` before returning or rethrowing.

- [ ] **Step 5: Run workflow tests green**

Run:

```bash
npm run test:workflows
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/workflows/start-session.ts lib/workflows/start-session.test.ts
git commit -m "Enforce credits when starting interviews"
```

## Task 3: Verify API Boundary And Legacy Quota Isolation

**Files:**
- Verify: `app/api/session/start/route.ts`
- Verify: `app/api/livekit/token/route.ts`
- Optional docs: Linear comment only

- [ ] **Step 1: Inspect routes**

Confirm `/api/session/start` still only authenticates, parses request JSON, calls `startInterviewSessionWorkflow`, and maps status/body.

Confirm `/api/livekit/token` is not the full authenticated interview enforcement path. If it still advertises quota enforcement for full interviews, add a comment or narrow logic only when it is safe and directly covered by tests.

- [ ] **Step 2: Run validation**

Run:

```bash
npm run test:billing
npm run test:workflows
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit only if route docs/code changed**

If route files changed:

```bash
git add app/api/session/start/route.ts app/api/livekit/token/route.ts
git commit -m "Clarify session credit enforcement boundary"
```

## Task 4: Final Validation And Linear Update

- [ ] **Step 1: Run final checks**

Run:

```bash
npm run test:billing
npm run test:workflows
npm run test:core
npm run test:packages
npm run typecheck
```

- [ ] **Step 2: Open stacked PR**

Push `codex/sav-122-credit-enforcement` and open a draft PR against `codex/sav-121-credit-ledger`.

- [ ] **Step 3: Update Linear**

Comment on `SAV-122` with PR link and validation, then move it to `In Review`.

## Self-Review

Spec coverage:

- No credit consumed when access/request validation fails: reservation happens after parsing and question validation.
- No credit consumed when LiveKit fails: release path before failure response.
- One credit consumed on successful full interview start: consume path after successful LiveKit start.
- Tests cover no-credit, successful consume, and failure release.

Intentional boundary:

- This slice replaces full interview start enforcement. Stripe grants and product UI are still tracked by `SAV-123` and `SAV-124`.
