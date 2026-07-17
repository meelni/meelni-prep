# Question Bank API deployment

The question-bank schema and seed workflow are managed through the repository's reviewed migration and question-sync paths. This document is a redirect for older implementation notes; it is not an independent Production runbook.

## Required checks

1. Confirm the canonical schema and migration files are reviewed and committed.
2. Run the normal repository validation and build checks.
3. Apply reviewed migrations only through the guarded wrapper:

   ```bash
   npm run db:migrate
   ```

4. Sync approved question data through the canonical workflow documented in [question sync](../../../docs/operations/question-sync.md). Do not seed or edit provider data directly.
5. Verify the endpoints locally or in Preview before any separately authorized Production action.

Production migration and question-sync behavior is governed by [Production action authorization](../../../docs/operations/production-action-authorization.md). An authorization permits only the exact reviewed action it names; it is not launch approval. The relaunch feature flag remains off until the product owner makes a separate GO decision.
