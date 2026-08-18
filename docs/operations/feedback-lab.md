# Local Feedback Lab

The Feedback Lab is a build-excluded browser harness for inspecting generated,
synthetic interview feedback through the same review compositions used by the
customer experience. It is not a Next.js route or feature flag and does not
create an account, interview, credit transaction, database row, provider
request, or Production state.

## Open the lab

From the repository root:

```bash
npm run feedback:lab
```

The command regenerates the deterministic provider-free scenario matrix,
scrubs provider credentials from its child processes, blocks non-loopback
network access, and starts the existing browser harness. Open:

```text
http://127.0.0.1:4173/?scenario=feedback-lab
```

Use the scenario controls to switch between generated terminal artifacts and
the lab-owned processing, loading, and malformed states. The panel beside the
preview contains only content-free development diagnostics: scenario ID,
artifact schema, ordered stage names, source, and expected/rendered outcome.

## Generate and inspect artifacts directly

The synthetic runner commands are:

```bash
npm run feedback:synthetic -- list
npm run feedback:synthetic -- run <scenario-id> [--output <dir>]
npm run feedback:synthetic -- run --all [--output <dir>]
```

The lab command writes its ephemeral files to
`tests/browser/harness/generated-feedback/`, which is gitignored. Each artifact
uses `meelni.synthetic-feedback.artifact.v1`; its manifest uses
`meelni.synthetic-feedback.manifest.v1` and binds the artifact filename to a
deterministic content hash. The lab decodes both contracts fail-closed before
rendering. The adapter imports this contract only through the public
`@meelni/test-fixtures/synthetic-feedback` v1 entrypoint.

## Add a synthetic scenario

1. Add the scenario to the canonical synthetic feedback catalog exported by
   `@meelni/test-fixtures/synthetic-feedback`. Keep all names, questions,
   transcript text, citations, and IDs explicitly synthetic.
2. Declare the expected closed customer outcome in that scenario. Do not add a
   lab-side score or outcome classifier.
3. Add or update fixture/workflow coverage proving the scenario traverses the
   production-shaped feedback workflow and durable JSON round trips.
4. Run the named scenario, then the complete matrix.
5. Start the lab and inspect the generated artifact at mobile and desktop
   widths, including keyboard focus and repeated citation actions.
6. Extend SAV-455 browser assertions when the scenario represents a new state
   or regression boundary.

Processing and loading remain lab-owned because generated artifacts are
terminal-only. Customer terminal outcomes must come from
`toFeedbackCustomerProjection`; consumers must not infer them from nullable
scores.

## Interpret a mismatch

The scenario's expected outcome comes from the generated manifest. The
rendered outcome comes from the decoded artifact's core-owned customer
projection. If they differ, the lab shows a visible mismatch alert and browser
tests fail.

Do not make the lab expectation match by relabeling scores or adding UI-side
classification. Instead:

1. Regenerate the artifact and verify the manifest hash.
2. Check whether artifact or manifest decoding failed closed.
3. Check the core customer projection and production feedback renderer for a
   contract regression.
4. Correct the owning fixture, workflow, core policy, or renderer, then rerun
   the full matrix.

Malformed, unknown-version, hash-invalid, or internally incoherent bundle
input fails before customer projection and maps to the lab's explicit Feedback
unavailable state. A valid v1 artifact containing the deliberately malformed
persisted-result scenario projects to `null` in core and uses the existing
protective Unable to review lifecycle copy. Neither path is coerced to
Scorecard, Coaching review, or a scored outcome.

## CI and privacy boundary

The default browser QA lane removes the previous ephemeral directory, lets the
synthetic publisher claim a new directory, and regenerates the deterministic
matrix before building the harness. The lane runs with the repository's
server-egress guard and a sanitized environment, so provider credentials and
calls cannot cross the harness boundary. Browser evidence covers responsive layout,
keyboard focus, accessible names, atomic status announcements, terminal
unavailable states, customer-outcome matching, and screenshots.

Never put customer data, provider payloads or tuning, credentials, room tokens,
credit state, or Production identifiers in a scenario, artifact, screenshot,
test output, document, or Linear comment.
