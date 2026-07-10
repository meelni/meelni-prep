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

## Authorized live-provider run

Do not run this step without explicit authorization for provider spend and
confirmation that the intended model/configuration is the one being evaluated.
The minimum run evaluates 32 scored synthetic transcripts three times, for 96
model calls. The eight insufficient transcripts are expected to make zero
model calls.

After authorization, set the acknowledgement only for the command invocation:

```bash
MEELNI_ALLOW_PAID_CALIBRATION=I_UNDERSTAND_THIS_CALLS_A_PAID_MODEL \
  npm run calibration:live -- \
  --repetitions 3 \
  --output /tmp/meelni-calibration-live.json
```

The command also requires `OPENAI_API_KEY`. Never paste a key into chat,
documentation, Linear, or a report. The acknowledgement is deliberately exact
so an ambient boolean cannot accidentally enable paid calibration.

The CLI exits nonzero when the live report misses any acceptance threshold.
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
- Score-band agreement is at least 80%.
- Maximum repeated-run score range is at most 1.
- Report versions match the code intended for launch.
- `launchAcceptance` is `passed`; a deterministic `passed` state is not enough.

If a live run fails, keep the launch gate closed. Inspect case-level failure
codes, update the evaluator or adjudication deliberately, rerun local tests,
and obtain fresh authorization before another paid run.
