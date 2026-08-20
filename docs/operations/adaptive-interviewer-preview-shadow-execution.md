# Adaptive Interviewer Preview-Shadow Execution

Current state: repository gate under implementation; live execution prohibited

## What this runbook does not authorize

Do not read credentials or environment files, make an OpenAI/LiveKit call,
spend, deploy, create a room/session, mutate a flag or dynamic config, influence
speech, use customer data, enter Production, enable default-on, or infer GO.
The SAV-478 preparation artifact and the owner’s broad “approve all gates”
direction are not executable Preview-shadow authorization.

Generic Vercel Preview is web-only. The future target is the isolated
provider-backed `preview_staging` lane corresponding to the documented Meelni
staging environment and `meelni-preview` LiveKit project, but this repository
slice does not inspect or mutate either system.

## Provider-free verification

Use exact Node 22.22.0 and the pinned Python venv:

```bash
npm run test:agent
npm run test:python-agent
npm run test:core
npm run test:integrations
npm run test:operations
npm run test:interviewer-benchmark
npm run interviewer:benchmark:verify-baseline
npm run test:feedback
npm run calibration:verify-runtime
npm run check
npm run verify:agent
npm run build
npm run verify:public-build
```

Tests use only injected fake transports and synthetic content. They must prove
the application source still passes literal `adapter=None` and no new module
reads `os.environ`, `.env`, or a credential variable.

## After the repository candidate is merged

1. Create/sync the missing PR-sized Linear child after connector
   reauthentication; keep SAV-476 open.
2. Check out the exact reviewed merge on `origin/main` and confirm a clean tree.
3. Generate a pending request with the exact 40-character merged SHA. The
   generated record remains pending and non-executable.
4. Present its complete values and digest to the owner. The owner must record a
   new external decision reference, decision/expiry, and one-time nonce.
5. At the activation CAS, independently supply the exact deployed/reviewed SHA,
   config/selection digests, target, and trusted current time. Require a trusted
   owner-decision verifier to authenticate the authorization digest, external
   reference, decision/expiry, and nonce and return the fresh opaque result for
   that exact claim. A durable control plane must then consume it once,
   atomically allocate a bounded session lease before room/worker construction,
   and reconcile sanitized receipts centrally. Never let a worker consume stage
   authority or use a process-local store for live execution.
   Reject authorization JSON above 64 KiB UTF-8 or nesting depth 32. Keep the
   250b per-session observed ceiling separate from the exact 6.25t safe
   aggregate; stopped allocation must not prevent already-open sessions from
   reconciling upward.
6. This repository slice has no durable control-plane adapter, so runtime
   construction returns typed `unavailable` with no adapter. The checked pure
   transition functions are reference models, not live cap/replay enforcement;
   distinct in-memory instances cannot provide a global CAS. Implement/review
   the authenticated durable follow-up before any provider, deploy, or room
   action. Lease, terminal-receipt, and stop-incomplete self-digests provide
   integrity/idempotency only. They never substitute for authenticated owner
   decision, trusted lease admission, or authenticated worker provenance and
   reconciliation channel.
7. Only a separate operations slice may supply provider credentials/deploy/
   room authority. Before an attempt, require isolated target identity, all
   shadow flags, influence false, exact adapter pins, open budget reservation,
   and the canonical kill switch.

## Stop and rollback

At any hard stop, reject new session and attempt admissions first. For an
in-flight shadow, call its coalesced local settle/cancel/close boundary under
one absolute 250 ms deadline. Idle failure or timeout must not bypass the
finally-path shutdown/adapter close, and cancellation must be awaited within
the same bound. Keep any ambiguous attempt reservation.

Emit a terminal session receipt only when shutdown and adapter close are
confirmed. Otherwise emit the distinct content-free stop-incomplete incident,
keep the entire session lease reservation open, and require the durable control
plane to stop new allocation. Do not convert that incident into settlement or
release budget until an authenticated worker/process termination
acknowledgement exists. This repository deliberately ships neither that
acknowledgement transition nor a durable control-plane adapter, so the pure
reference model remains stopped permanently after such an incident. If the
incident records spend above the retained lease, retain both the full lease and
only the derived excess; a future acknowledgement must atomically replace or
reconcile those values without counting the excess twice.
The canonical LiveKit runtime independently owns `AgentSession.aclose()`,
transcript settlement, feedback handoff, and room lifecycle; shadow rollback
does not call or wait on speech. LiveKit Cloud rolling deployments route new
sessions to new instances while allowing old instances time to finish, and
production servers can gracefully drain; a redeploy is not a per-session
shadow rollback or session drain primitive.

New sessions return to `synthetic` with all five adaptive flags false and no
adapter. Re-entry requires a new exact authorization; neither the previous
record nor its one-time receipt may be replayed.

## Evidence packet

Retain only the versioned content-free sequence:

```text
planned -> admitted -> attempt -> reserved -> reconciled -> settled
                                                       \-> stopped
                                                            \-> stop-incomplete incident
```

Each record may contain the exact candidate/config/adapter versions, stage and
cohort, run/session/attempt ordinals, sanitized binding digests, timestamps,
integer reservation/reconciliation totals, and closed outcome/reason. It must
not contain identities, room/session names, transcript/prompt text, provider
payloads/IDs, or raw exceptions. Local attempt receipts reconcile centrally
outside the speech path; the runtime performs no per-turn ledger network I/O.
A stop-incomplete incident is evidence that settlement was not confirmed and
is never a terminal session receipt. A future durable reconciler must
authenticate worker provenance/channel before accepting either record; their
unkeyed IDs do not authenticate the sender.

The all-round/adverse-voice matrix is four rounds crossed with seven fixed
voice conditions (28 cells). Provider-free simulation may prove harness
coverage, but every cell remains `unperformed` until a separately authorized
live rehearsal records evidence.
