# SAV-445 shadow feedback artifacts

## Why

Future incremental evaluation needs a replay-safe measurement boundary before
any execution can be considered. Without an exact versioned key and privacy-
complete store, retries or version changes could duplicate work or accidentally
leak shadow results into customer feedback.

## What changes

- Add strict provider-neutral artifact key, value, and exact-set contracts.
- Bind one SHA-256 key to session, trusted block fingerprint, rubric, prompt,
  selection schema, and model versions.
- Add an opaque default-off service write context and immutable store.
- Add migration 0039 with service-only RLS/ACL and owner/session correlation.
- Include artifacts in account export and deletion under explicit retention
  boundaries.
- Add synthetic crash/replay/reconnect/segmentation/version/privacy fixtures.

## Non-goals

- Scheduling or executing shadow evaluation.
- Provider calls, configuration, spend, or comparisons.
- Feedback lifecycle, customer UI, insights, billing, or batch authority.
- Preview/Production migration, deployment, activation, launch, or merge.
