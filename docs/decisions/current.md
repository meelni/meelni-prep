# Current Decisions

Active accepted engineering decisions:

- [Dynamic Stacked Parent Resolution](2026-07-12-dynamic-stacked-parent-resolution.md): Store immutable PR/ref identities, resolve current heads in trusted CI, and keep dependent-child topology failures off a valid parent's stable context.
- [Live PM Interview Practice Positioning](2026-07-09-live-pm-interview-practice-positioning.md): Position Meelni as live PM interview practice, remove the fitness metaphor, and treat routes, analytics, and progress claims as explicit compatibility contracts.
- [Database Reconciliation And Shared Rate Limits](2026-07-09-reconcile-database-history-and-share-rate-limits.md): Use one forward-only reconciliation migration, test RLS as a contract, and enforce LiveKit reconnect budgets atomically in Postgres.
- [Durable Account Deletion](2026-07-09-durable-account-deletion.md): Persist a tombstone that immediately ends product access, then retry provider/data/Auth cleanup while canceling captured subscriptions without automatic compensation.
- [Period-End Subscription Cancellation](2026-07-12-period-end-subscription-cancellation.md): Keep ordinary cancellation period-end only, retain subscription access and eligible subscription-derived credits through the provider cutoff, and create no automatic compensation.
- [Agent-Ready Monorepo Direction](2026-06-27-agent-ready-monorepo.md): Meelni is adopting a future monorepo shape with incremental migration instead of a big-bang rewrite.
- [Defer Physical Web App Relocation](2026-06-27-defer-web-app-relocation.md): Keep the root Next.js app in place until path, tooling, and provider-independent contracts are ready for a low-risk `apps/web` move.
- [Credit-Based Billing Catalog](2026-06-29-credit-based-billing-catalog.md): Replace ongoing free interviews and unlimited Pro with a credit-based trial, pass, Starter, and Pro catalog.
- [Payment Reversal Credit Truth](2026-07-10-payment-reversal-credit-truth.md): Revoke only payment-correlated unspent credits, freeze revoked sources durably, and preserve explainable evidence without hidden debt or unrelated clawbacks.
- [External Design Lens Adoption](2026-07-08-external-design-lens-adoption.md): Use Impeccable, ibelick/ui-skills, and Taste Skill as calibrated advisory lenses under Meelni's design system authority.
