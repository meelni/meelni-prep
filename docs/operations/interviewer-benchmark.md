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

The package command supplies the exact repo-owned approval artifact at
`docs/evidence/sav-467-interviewer-adjudication-approval.json`. A lower-level
run without `--approval` remains pending; an invalid approval fails before any
judge call.

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

Both `--verify` and `--write` accept only the exact baseline path shown above.
`--approval` accepts only the exact approval path. The readers cannot be
swapped. Absolute paths, traversal, unrelated files, directories, and symlinks
fail closed. Writes use an exclusive same-directory temporary file and atomic
baseline replacement; the CLI never writes the approval artifact.

Approval-file parsing requires byte-for-byte canonical JSON: two-space
indentation, contract field order, and one trailing newline. Duplicate keys,
negative zero, reordered keys, alternate whitespace, or other raw forms that
could collapse under `JSON.parse` are rejected before the runner invokes a
judge.

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
passing threshold as an approval artifact or broader rollout authority.

The eight exact semantic labels under `adjudicationManifestSha256`
`312e086a46334ab3af3907406c90302990ab3ea90063e2ecc6428e17af30c70f`
are accepted through the committed v1 approval. The baseline conclusion is
`baseline_recorded_owner_adjudication_accepted`, but shadow entry remains
ineligible because provider-backed candidate evidence has not been run.

The approval records only the product-owner role, direct-message supervisor
source task, and mirrored Linear adjudication comment ID/timestamp; it has no
signature or human identity field.
Its scope explicitly denies runtime, provider call/spend,
canary, launch, default-on, Production, and SAV-476 GO/NO-GO authority. Do not
reuse this artifact as authorization for any of those actions.
