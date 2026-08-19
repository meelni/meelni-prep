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

Both `--verify` and `--write` accept only the exact repo-relative path shown
above. Absolute paths, traversal, unrelated files, directories, and symlinks
fail closed. Writes use an exclusive same-directory temporary file and atomic
replacement; do not copy the command to target another artifact.

The default entrypoint does not read provider credentials, import a provider
adapter, make network calls, use customer transcripts, or mutate Production.
The report must show provider-free authorization, `providerCalls: 0`,
`actualCostUsd: 0`, `inputTokens: null`, `outputTokens: null`,
`providerCredentialRead: false`, and `productionCalled: false`. Any
contradiction fails before report emission. A changed runtime-source hash makes
verification fail until the baseline is deliberately reviewed and rebuilt.

The provider-backed adapter boundary is not a CLI mode. Code invoking it must
provide the exact versioned explicit-opt-in authorization before the first
judge call, pin a versioned model identity, stay within 12 calls, 100,000
input/output tokens per call, and USD 1, and truthfully report credential and
Production evidence. Production calls are rejected. Do not add provider
credentials or a network-backed adapter to provider-free tests.

Actionable failures include scenario and interviewer/candidate turn IDs. Use
those records to design a candidate prompt/runtime change, then compare it
against the checked regression and shadow-entry thresholds. Do not interpret a
passing automated report as owner approval.

The only pending owner task is to review the eight exact examples under
the report's `adjudicationManifestSha256` and record accept or reject for each.
Until then, the report remains
`baseline_recorded_owner_adjudication_pending` and shadow entry is ineligible.
