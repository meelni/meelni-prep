# Interviewer Benchmark Operations

The SAV-467 benchmark is local, deterministic, provider-free by default, and
uses only synthetic text.

Run the focused contract and runner suite:

```bash
npm run test:interviewer-benchmark
```

Print a fresh provider-free report:

```bash
npm run interviewer:benchmark
```

Verify that the committed current-runtime baseline matches the source,
fixtures, frozen judge outputs, and thresholds byte for byte:

```bash
npm run interviewer:benchmark:verify-baseline
```

After an intentional reviewed change to the prompt/runtime source or benchmark
inputs, rebuild the evidence and inspect the diff:

```bash
npm run interviewer:benchmark:build-baseline
git diff -- docs/evidence/sav-467-current-interviewer-baseline.json
```

The default entrypoint does not read provider credentials, import a provider
adapter, make network calls, use customer transcripts, or mutate Production.
The report must show `providerCalls: 0`, `actualCostUsd: 0`, and
`providerCredentialRead: false`. A changed runtime-source hash makes verification
fail until the baseline is deliberately reviewed and rebuilt.

Actionable failures include scenario and interviewer/candidate turn IDs. Use
those records to design a candidate prompt/runtime change, then compare it
against the checked regression and shadow-entry thresholds. Do not interpret a
passing automated report as owner approval.

The only pending owner task in v1 is to review the eight exact examples under
the report's `adjudicationManifestSha256` and record accept or reject for each.
Until then, the report remains
`baseline_recorded_owner_adjudication_pending` and shadow entry is ineligible.
