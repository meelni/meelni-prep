# SAV-181 Account Privacy Task Intake

## Intent

- User request: Implement truthful account export and deletion workflows without
  weakening the durable provider-deletion design already on `main`.
- Product/user outcome: A signed-in PM candidate can download a defined copy of
  their Meelni data and request deletion without Meelni reporting unfinished
  provider work as complete.
- Why now: Account privacy is a launch-trust requirement in Wave 2 and the
  relaunch experience remains default-off until the workflow is credible.

## Slice

- Primary slice: Account privacy vertical slice.
- Secondary slices: Auth freshness, dashboard settings UX, provider operations,
  and durable contract documentation.
- Relevant skills: `meelni-ops-connections`, `meelni-ui-design-system`,
  `meelni-vertical-slice-playbooks`, `meelni-engineering-memory`,
  `meelni-product-strategy`, and `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-164.
- Child deliverable issue: SAV-181.
- Current Linear state: In Progress.

## Scope

- In scope: Stable export contract, authenticated server-generated JSON export,
  explicit provider/internal-field exclusions, recent-auth deletion gate,
  confirmation dialog, queued/retry/error UI, dependent-row deletion ordering,
  Checkout/deletion concurrency barriers and reconciliation, safe job-history
  failures, accessible async notices, behavior/API/UI tests, fixtures, contract
  and operations docs.
- Out of scope: Copying or deleting shared-environment data, creating test
  accounts, legal retention-policy invention, enabling the relaunch flag, or
  claiming provider cancellation/refund completion without evidence.
- Assumptions: `user.last_sign_in_at` returned by server-side Supabase
  `getUser()` is the available server-verifiable authentication freshness signal.

## Product Lens

- Audience: PM candidates using Meelni interview practice.
- Primary lever: Product quality and trust.
- Product Compass note: Privacy controls should be explicit and calm. Export
  promises only the allowlisted data shipped today; deletion copy distinguishes
  a durable request from completed provider cleanup.

## Technical Plan

- Likely app files: `/api/user/export`, `/api/user/delete`, dashboard settings.
- Likely package/workflow files: `@meelni/core` account-privacy contract,
  account-export database adapter, export workflow, deletion request helpers.
- Data/provider dependencies: Supabase Auth user verification, Postgres reads,
  existing Inngest/Supabase Admin/Stripe deletion workflow, Checkout creation,
  and webhook fulfillment. Implementation and automated validation use mocks
  and local PostgreSQL only; no remote provider writes are required.
- Docs/decisions to update: Account privacy contract, export/deletion runbooks,
  contract index. The accepted durable-deletion decision remains authoritative.

## Validation

- Required commands: `npm run check:ci`, `npm run build`.
- Optional/manual checks: Local mocked API/UI behavior and responsive browser
  inspection when a local authenticated fixture is available without shared
  provider mutation.
- Fixtures or regression tests needed: Versioned account export fixture,
  nested sensitive-field redaction, cross-user exclusion, stale-auth deletion,
  delayed queue retry, populated insights/session deletion, pre/post-Checkout
  tombstone races, event-order-independent Checkout/subscription/invoice
  reconciliation, late-customer cleanup failure/recovery, full-versus-partial
  manual refund replay, webhook-payload tombstone races, lost-202/session
  expiry, redacted job failures, and accessible UI action states.

## Rollout

- Risk level: High; auth, privacy, and irreversible workflow boundary.
- Backward compatibility: Existing background deletion tombstones and provider
  retry semantics are preserved. The unauthenticated `DELETE` method is closed.
- Metrics/events to watch: Export response failures, deletion request status,
  retry/recovery volume, and redacted provider failure categories.
- Follow-up slice: Owner/legal decision for completed tombstone, provider,
  backup, and legally required billing-record retention periods.
