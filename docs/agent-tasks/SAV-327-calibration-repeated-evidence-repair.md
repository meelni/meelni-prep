# SAV-327 Calibration Repeated-Evidence Repair

## Intent

- User request: continue relaunch-readiness work after the SAV-248 v10 and v11 live calibration lanes safely stopped.
- Product/user outcome: preserve strict transcript-grounded feedback while reducing the chance that a provider output reuses the same evidence span across multiple findings.
- Why now: the owner-authorized SAV-248 v10 lane activated and then stopped after one paid provider attempt because the first output failed with `evidence_reused_across_findings`. The repaired v11 lane then stopped after one paid provider attempt on the same synthetic case because the first output avoided exact reuse but still returned same-turn nested/overlapping evidence (`evidence_overlaps_across_findings`).

## Evidence

- Terminal v10 report: `/private/tmp/meelni-sav248-v10-live-run-20260725T152640Z/sav-248-automated-report.json`.
- Failure: `product_sense:01:caregiver-planning`, run `0`, `evaluation_provider_returned_invalid_feedback`, rejection `evidence_reused_across_findings`.
- Spend: one attempted provider call, zero completed calls, `$0.0142825` actual reconciled cost, under the `$3` cap.
- Safety: no customer transcripts, no Production data, no launch/default-on change.
- Ledger: `refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v10` activated at `9672ea31973fa6e02b93df8e48904efa7e894840`; this v10 lane is terminal and non-reusable.
- Terminal v11 report: `/private/tmp/meelni-sav248-v11-live-20260725T181525Z/sav-248-v11-automated-report.json`.
- Failure: `product_sense:01:caregiver-planning`, run `0`, `evaluation_provider_returned_invalid_feedback`, rejection `evidence_overlaps_across_findings`.
- Spend: one attempted provider call, zero completed calls, `$0.01345625` actual reconciled cost, under the `$3` cap.
- Ledger: `refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v11` activated at `3b84b1029f64cb488d6a4a7cff119cb98ccad2de`; this v11 lane is terminal and non-reusable.

## Scope

- In scope: strengthen the evaluator prompt and paid response-format field descriptions for four distinct evidence slots and whole sentence/line blacklisting; preserve parser enforcement of duplicate/overlapping evidence; keep deterministic tests for prompt/schema contract.
- Out of scope: weakening evidence uniqueness, accepting duplicated evidence, running another paid provider call, using customer/Production data, or changing the relaunch feature flag.

## Repair Notes

- The parser is already behaving correctly: `packages/core/src/feedback-v2.ts` rejects reused evidence identities and same-turn overlap variants, with regression tests in `packages/core/src/feedback-v2.test.ts`.
- The immediate repair keeps the hard parser guardrail and makes the generation contract more explicit:
  - the system prompt tells the evaluator to treat `strength[0]`, `strength[1]`, `improvement[0]`, and `improvement[1]` as four separate evidence slots;
  - the paid JSON schema descriptions now repeat that evidence must not duplicate or overlap across findings;
  - the v11 follow-up repair adds a stricter sentence/line blacklist, so trimming/extending/nesting text inside a sentence already used by another finding is explicitly invalid generation behavior;
  - `feedback-provider-response-format.v4` pins the updated paid response-format contract.
- `FEEDBACK_PROMPT_VERSION` remains `feedback.prompt.v2` to avoid expanding this repair into a database constraint migration. Future paid calibration plans still change because the plan hash includes the full prompt text.
- The v10 repaired successor plan hash was `b4d625bf10460aeb1992e73943640489a4474492ec85aded56fa6a30fdc186fb`; worst-case planned spend is `$2.626785` for the unchanged 64-call plan, still below the `$3` cap.
- The v11 source repair changes the plan hash to `a3e8d7fb563d11e60032fbc2e56c0925776d56ad942487e5ca61ca096813f8f6`; worst-case planned spend is `$2.708945` for the unchanged 64-call plan, still below the `$3` cap. A paid retry requires a successor lane because the v11 ledger is already activated and terminal.

## Follow-up

- A future paid retry requires a successor lane and fresh owner authorization. Do not reuse SAV-248 v10 or v11.
- If adding automated invalid-output retry in a later slice, the activated plan must explicitly authorize retry attempt call keys and semantic-capture review bindings before any provider call.
