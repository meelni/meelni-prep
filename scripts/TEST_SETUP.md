# Question Sync Testing

The former test setup contained direct live-sync and raw verbose logging commands. Those instructions were removed because they bypassed the current operator policy.

Use [Question sync operations](../docs/operations/question-sync.md) as the sole executable procedure. Automated behavior coverage lives in `lib/db/question-sync-lock.test.ts`, `lib/question-sync/*.test.ts`, `lib/security/question-sync-authorization.test.ts`, and the question-sync workflow/route tests.

Provider and database rehearsals require an approved non-production environment and the rollout steps in the canonical runbook.
