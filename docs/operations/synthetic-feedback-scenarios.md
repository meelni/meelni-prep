# Synthetic Feedback Scenarios

This runner exercises the production feedback lifecycle with synthetic evidence
and a deterministic evaluator. It is a local, provider-free verification tool;
it does not read customer data, credentials, environment files, databases, or
provider configuration, and it cannot mutate credits, Production, or runtime
configuration.

## Commands

List the stable scenario catalog without running it:

```bash
npm run feedback:synthetic -- list
```

Run one terminal scenario or the whole terminal matrix:

```bash
npm run feedback:synthetic -- run <scenario-id>
npm run feedback:synthetic -- run <scenario-id> --output <directory>
npm run feedback:synthetic -- run --all
npm run feedback:synthetic -- run --all --output <directory>
```

When `--output` is omitted, artifacts are written beneath
`.artifacts/synthetic-feedback/v1/`, which is gitignored. A successful run
writes one `*.json` artifact per selected scenario and a `manifest.json` for
that exact selection. Re-running the same selection at the same code revision
reuses byte-identical files. A different selection or changed output must use a
fresh directory: the command refuses symlinked, non-identical, or otherwise
nonempty output instead of overwriting it. Publication claims a new destination
directory exclusively before writing files. A minimal child writer pins that
claimed directory as its working directory and verifies its device/inode before
accepting file bytes, so replacing the output path with a symlink cannot redirect
later files. The parent revalidates the directory identity before reporting
success. Byte-identical reuse is verified through the same directory-pinned
worker and receives the same final identity check. Publication never replaces a
concurrently created filesystem entry. A write failure after the claim may leave
a partial or displaced directory, which is intentionally fail-closed and must be
inspected or removed before retrying.

## Stable artifact boundary

The public `@meelni/test-fixtures/synthetic-feedback` entrypoint exports these version-one
contracts and fail-closed decoders:

- `SyntheticFeedbackScenarioV1`
- `SyntheticFeedbackArtifactV1`
- `SyntheticFeedbackManifestV1`
- `decodeSyntheticFeedbackArtifactV1`
- `decodeSyntheticFeedbackManifestV1`

Artifact schema versions are
`meelni.synthetic-feedback.artifact.v1` and
`meelni.synthetic-feedback.manifest.v1`. Every artifact includes the scenario
ID, expected closed customer outcome, observed closed customer outcome, stages,
the strictly decoded customer lifecycle, and the customer projection produced
by core. Content-free diagnostics are stored separately from that lifecycle and
projection. The manifest records only scenario ID, expected outcome, stages,
file name, and SHA-256 digest.

Artifact decoding also binds the lifecycle session, skipped reason family, and
replay availability to the selected catalog fixture. A lifecycle or diagnostics
payload copied from another scenario therefore fails closed even when both
scenarios share the same customer outcome.

The only supported customer outcomes come from core's
`toFeedbackCustomerProjection(FeedbackLifecycleResponse)`:
`scorecard`, `coaching_review`, or `unable_to_review`. A `null` core projection
maps to the existing unavailable view. The runner never infers an outcome from
nullable scores. Unknown, malformed, incoherent, or version-mismatched artifacts
and manifests fail closed in their public decoders.

The version-one catalog is terminal-only. Processing-state artifacts are not a
stable interface and remain owned by lab tooling.

## Production-shaped boundary

The reusable scenario workflow traverses the same transcript writer, event and
marker ingestion, runtime settlement, frozen evidence, interview end, durable
dispatch, generation handler, evaluation parser, immutable persistence,
lifecycle presenter, and core customer projection used by the application.
The deterministic runner loads that Production-shaped module in an isolated
local worker whose environment contains only `NODE_ENV=test` and `TZ=UTC`.
Listing scenarios never loads it, the parent process environment is never read,
copied, or mutated, default Production adapters are never invoked, and the
reviewed calibration runtime graph remains unchanged. A future explicitly
authorized evaluator adapter is a separate in-process opt-in boundary.
Each durable generation step crosses a JSON serialize/parse round trip so
non-durable values fail during the run. That trace includes the complete initial
generation-dispatch event and the complete post-feedback insights event, not
only `step.run` results.

The bundled evaluator implements the existing rubric and dimension-coverage
provider-selection contract deterministically. It does not call a provider and
does not reimplement scoring reduction or presentation. A future live-model
adapter must be supplied explicitly in code and separately authorized; there
is no CLI flag, environment fallback, or automatic provider mode in this
contract.

## Authoring and privacy

Add scenarios to the existing feedback fixture catalog and derive runner cases
from that catalog. Do not create a parallel static scenario registry. Synthetic
IDs and text must remain visibly synthetic. Never paste Production/customer
transcripts, identifiers, recordings, provider payloads, secrets, or model
responses into fixtures or artifacts.

Each new scenario must declare its expected closed outcome and pass:

```bash
npm run test:fixtures
npm run test:feedback
npm run feedback:synthetic -- run --all
```

Treat a scenario/outcome mismatch, failed JSON boundary, decoder rejection,
hash mismatch, or non-deterministic rerun as a test failure. Inspect the local
synthetic artifact only; do not compensate by querying a provider or customer
system.
