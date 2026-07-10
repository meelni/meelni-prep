# Evaluation Calibration Runbook

## Safe local checks

Validate the corpus, validator classifications, evidence anchors, and
insufficient-session workflow without invoking an evaluator:

```bash
npm run calibration:preflight
```

Exercise the complete report and threshold calculations with the deterministic
local evaluator:

```bash
npm run calibration:self-test
```

Write either machine-readable report to a chosen path with:

```bash
npm run calibration:preflight -- --output /tmp/meelni-calibration-preflight.json
npm run calibration:self-test -- --output /tmp/meelni-calibration-self-test.json
```

These modes make no model or database calls. A green deterministic self-test
proves only the harness; its live-provider and launch gates remain pending.

Review the agent-authored candidate adjudications separately:

```bash
npm run calibration:adjudication-manifest -- \
  --output docs/evidence/sav-198-adjudication-review-manifest.json
```

The manifest contains the exact strength and improvement evidence, observation,
dimension, and next step for all 32 scored cases. A product owner or PM reviewer
must approve or correct these candidates in a separate
`evaluation-adjudication-approval.v1` JSON file. That approval contains the
manifest/corpus hashes, versions, reviewer identity/role, review time, and one
decision per scored case. Neither the candidate manifest, deterministic harness,
nor a live model run counts as signoff. No approval artifact is committed while
SAV-198 review remains pending.

The eight insufficient fixtures are separately enforced validator negatives,
not scored adjudication candidates. They have no score bands or findings;
preflight requires all eight to skip evaluation and make zero provider calls.

## Authorized live-provider run

Do not run this step without explicit authorization for provider spend and
confirmation that the intended model/configuration is the one being evaluated.
The minimum run evaluates 32 scored synthetic transcripts three times, for 96
model calls. The eight insufficient transcripts are expected to make zero
model calls. Three repetitions and 96 calls are also hard maximums; other
repetition counts fail before evaluator work.

`calibration:live` loads `.env.local` through `tsx --env-file=.env.local`, just
like other local feedback tooling. Run `npm run setup:local` first if the file
does not exist. Keep both the provider key and model configuration only in that
gitignored file.

Before authorizing spend, set `OPENAI_FEEDBACK_MODEL` to the exact model ID the
provider response is expected to report, preferably a pinned snapshot rather
than a moving alias. The report treats this configured value as an expectation,
not observed proof. Each validated output carries the API response's model ID,
and any mismatch fails acceptance with case/run diagnostics.

After authorization, set the acknowledgement only for the command invocation:

```bash
MEELNI_ALLOW_PAID_CALIBRATION=I_UNDERSTAND_THIS_CALLS_A_PAID_MODEL \
  npm run calibration:live -- \
  --approval /secure/path/evaluation-adjudication-approval.json \
  --output /tmp/meelni-calibration-live.json
```

The command also requires `OPENAI_API_KEY`. Never paste a key into chat,
documentation, Linear, or a report. The acknowledgement is deliberately exact
so an ambient boolean cannot accidentally enable paid calibration.

The live CLI exits zero only when the combined `launchAcceptance` gate is
`passed`. A provider-quality pass still exits nonzero when adjudication approval
is missing, stale, incomplete, or contains `changes_required` decisions.
Review the report's model and all five version fields before accepting it as
evidence. Store approved launch evidence in the release record without adding
secrets or provider responses containing sensitive data.

## Review checklist

- `customerDataUsed` is `false`.
- Corpus totals are 40 overall, 32 scored, and 8 insufficient, with 10 cases per
  round.
- Expected-state mismatches and invalid gold anchors are zero.
- Provider calls are zero for preflight and deterministic modes. In a live run,
  they equal scored cases multiplied by repetitions; local evaluator calls are
  reported separately.
- Evidence validity, adjudicated evidence match, and insufficient handling are
  all 100%.
- Pooled and per-dimension score-band agreement are at least 80%; each round and
  completion state is at least 75%.
- Maximum repeated-run score range is at most 1.
- Every output model identity matches the configured expected model and the
  observed identities are reviewed.
- Report versions match the code intended for launch.
- `launchAcceptance` is `passed`; a deterministic `passed` state is not enough.
- Adjudication acceptance records completed product-owner/PM signoff; candidate
  status is never treated as ground truth.
- Candidate and corpus hashes match the separately stored approval artifact,
  and all 32 scored-case decisions are approved.

If a live run fails, keep the launch gate closed. Inspect case/run/dimension
failure records, update the evaluator or adjudication deliberately, rerun local
tests, and obtain fresh authorization before another paid run.
