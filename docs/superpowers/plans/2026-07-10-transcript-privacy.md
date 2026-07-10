# SAV-193 — Transcript Privacy And Heard-Interruption Evidence

## Outcome

Evaluation receives only speech the candidate actually heard, raw transcript
retry data never persists in the browser, and incomplete evidence fails safe.

## Slice

- Move canonical durability from the authenticated browser to the Python voice runtime.
- Reuse SAV-194 identity, ordering, room-correlation, and session-row locking.
- Preserve LiveKit's provider-synchronized interrupted prefix as
  `partially_delivered`.
- Persist a textless marker when no prefix is available and prevent feedback.
- Use a bounded in-memory outbox, signed internal route, settlement RPC, and
  bounded deadline/shutdown drains.
- Hydrate durable transcript after reload/reconnect and show runtime integrity state.
- Scrub retired browser keys and mask transcript text from replay/logging.
- Carry event identity and delivery provenance into evaluation prompts.

## Validation

- TypeScript/Python cross-runtime contract tests.
- HMAC authorization, route, marker, storage-scrub, and evaluation prompt tests.
- Completed, zero-prefix, and mid-sentence interruption fixtures.
- Network/retry/permanent/fairness/overflow queue behavior.
- Real PostgreSQL clean/upgrade migration, idempotent marker persistence, least
  privilege, transcript/end concurrency, and marker-driven feedback exclusion.
- `npm run check:ci`, `npm run build`, `npm run db:check`,
  `npm run test:python-agent`, and isolated `npm run test:database-migrations`.

## Rollout

The relaunch flag stays default-off. Preview rehearsal remains blocked by
SAV-226 because Preview targets Production data. No separate Supabase project
is provisioned without explicit approval.
