# Adaptive Interviewer Preview-Shadow Execution

Status: repository contract; no live authorization is checked in

## Versions and domains

- Runtime config: `adaptive-interviewer-preview-shadow-runtime-config.v1`
- Rehearsal matrix: `adaptive-interviewer-preview-shadow-rehearsal-matrix.v1`
- Pending owner request: `adaptive-interviewer-preview-shadow-owner-request.v1`
- Authorization: `adaptive-interviewer-preview-shadow-authorization.v1`
- Authorization digest: `adaptive-interviewer-preview-shadow-authorization-digest.v1`
- Activation command/receipt: `adaptive-interviewer-preview-shadow-activation-command.v1` /
  `adaptive-interviewer-preview-shadow-activation-receipt.v1`
- Cohort ledger: `adaptive-interviewer-preview-shadow-cohort-ledger.v1`
- Session lease/digest: `adaptive-interviewer-preview-shadow-session-lease.v1` /
  `adaptive-interviewer-preview-shadow-session-lease-digest.v1`
- Session receipt/digest: `adaptive-interviewer-preview-shadow-session-receipt.v1` /
  `adaptive-interviewer-preview-shadow-session-receipt-digest.v1`
- Local spend ledger: `adaptive-interviewer-preview-shadow-local-spend-ledger.v1`
- Evidence: `adaptive-interviewer-preview-shadow-evidence.v1`

Preparation and Production/default-on validators MUST reject the Preview-shadow
authorization. The Preview record authorizes only `synthetic -> preview_shadow`
in `preview_staging`, cohort `shadow`, exposure `none`. It MUST NOT authorize
influence, later stages, Production, default-on, GO/NO-GO, deployment, room
creation, or unrelated provider work.

## Exact runtime configuration

The config pins:

- adapter `meelni_director_openai_responses` /
  `interview-director-adapter.openai-responses.v1`;
- provider `openai-api`, model `gpt-5.4-mini-2026-03-17`, direct Responses
  endpoint `https://api.openai.com/v1/`, and `openai-python==3.3.1`;
- `store:false`, no provider tools, and zero retries;
- 25 sessions, 25,000,000,000 nano-USD overall, 10,000,000,000 nano-USD hard
  stop, a derived 1,000,000,000 nano-USD session lease, at most ten attempts per
  session, a derived 100,000,000 nano-USD attempt reservation, and 250 ms shadow
  settle/shutdown;
- the exact accepted privacy/retention, entry thresholds, stop thresholds, and
  six fixed hard stops from the selected candidate; and
- four rounds crossed with seven voice conditions, 28 required cases, with
  live status `unperformed` until separately executed.

The config SHA-256 is
`c6db8b06428fde9a7ffb13d78641e66efc584203c7862db93de42a9d9d64d89c`,
computed over the ASCII config contract version, one NUL byte, then canonical
`JSON.stringify` bytes of the closed config object. Unknown, missing, reordered
array, unsafe integer, or mismatched fixed values fail closed.

## Pending request and executable authorization

The repository pending packet contains exact config/selection values but
`candidate_git_sha:null`, pending owner fields, no nonce, and
`preview_shadow_execution_authorized:false`. It is not executable.

After merge, the generator MUST receive a 40-character merged SHA and emits a
pending request bound to that SHA and the exact config digest. A human-owned
external decision converts it into a distinct authorization only by supplying:

- `owner_decision:"approved"` and authority
  `execute_bounded_preview_shadow_only`;
- a verified external decision reference, whole-second UTC decision time, and
  expiry no more than 24 hours later;
- a unique 32-byte lowercase-hex authorization nonce;
- `one_time_execution:true`, `maximum_consumptions:1`, and
  `preview_shadow_execution_authorized:true`; and
- fixed false values for Preview influence, later stages, Production,
  default-on, and GO/NO-GO.

Parsing uses a duplicate-key-rejecting JSON reader, exact object keys, safe
integers, injected trusted time, and exact SHA/digest/stage/environment/cohort
bindings. Authority is invalid before its decision time and at or after expiry.
The parser validates shape and bindings; it does not authenticate the human
behind the external reference.

Live use MUST atomically consume the domain-separated authorization ID exactly
once in a durable control-plane activation record. A worker never consumes the
stage authorization. Activation claim failure is replay and produces no run.
The content-free activation receipt binds the authorization ID, run ID,
candidate SHA, config digest, target, and activation time.

The activated run owns one durable authoritative cohort ledger. Before any
room or worker construction, that ledger atomically allocates a closed session
lease. The lease binds the run, candidate/config/adapter, environment/stage/
cohort, one session ordinal, a sanitized session-binding SHA-256, issue/expiry,
the 1,000,000,000 nano-USD session budget, ten-attempt limit, and 100,000,000
nano-USD per-attempt reservation. Its domain-separated self-digest proves
deterministic integrity only; it is not a signature and provides no
authenticity. Runtime admission additionally requires an injected trusted
durable-control-plane verifier to attest that the exact unexpired lease was
actually allocated. Allocation counts outstanding leases against both overall
and stop caps. The runtime cannot mint or activate a lease.

This repository slice defines pure reference transition models, protocols, and
validators, not a durable database/provider adapter. Two independent in-memory
reference stores can each accept the same authorization; that demonstrates why
they are not live enforcement. Therefore live runtime construction remains
impossible until a follow-up authenticated control-plane implementation
provides one durable activation CAS, atomic lease allocation, and idempotent
central reconciliation. A process-local test store is never sufficient.

## Construction and isolation

No ambient configuration is accepted by the runtime construction seam. Its
inputs bind the exact config digest, an unexpired session lease, an injected
trusted admission verifier backed by the future durable control plane, and an
explicit injected provider transport factory. Default-off returns a typed
`disabled` result. Missing/incomplete durable admission returns typed
`unavailable` with `adapter=None`; it does not throw into a fallback, discover
credentials, construct the OpenAI adapter, or begin shadow work.

The application remains default-off and passes literal `adapter=None`. The
constructed adapter, if a later authorized entrypoint injects it, is read-only
shadow. It cannot call speech/session APIs, modify controller state, publish or
persist transcripts, invoke feedback, emit customer output, or block any of
those paths. Provider-specific behavior remains behind `DirectorAdapter`.

## Attempt spend

Before every transport call, the local lease ledger reserves the full derived
100,000,000 nano-USD per-attempt amount. Admission includes both reconciled and
outstanding reservations and fails at the 1,000,000,000 nano-USD session lease
or ten-attempt limit. One attempt ordinal may be reserved and reconciled exactly
once. The local ledger makes no global-cap claim.

- Completed normalized usage is evidence rather than provider billing truth,
  so local reconciliation retains at least the full reservation and records a
  larger observed amount without clipping.
- Failure, timeout, cancellation, rejected/invalid response, missing usage, and
  every ambiguous outcome reconcile at the full reservation.
- If later trusted billing exceeds the reservation, record the larger value and
  stop; never clip to the reservation.
- Normalized `DirectorAdapterResult.estimated_cost_microusd` remains response
  evidence, not provider billing truth.

The ledger and evidence contain no prompt, transcript, provider response,
provider request ID, room/session/writer/participant/customer ID, or raw error.
Attribution is limited to stage, config/adapter versions, attempt ordinal,
closed state/outcome, and integer amounts.

Idempotent sanitized session and attempt receipts reconcile to the authoritative
cohort ledger outside the speech path. Receipt identity binds the run, session
lease, allocation-ledger revision, attempt count/digest, outcome, and spend;
exact replay is idempotent and divergent replay conflicts. Central
reconciliation releases the session-lease reservation only after a valid
terminal receipt, records larger spend without clipping, and stops the run on a
cap or invariant breach. There is no database/network round trip for each
spoken turn beyond the provider request itself.

## Lifecycle and evidence

The closed state sequence is `planned -> admitted -> attempt -> reserved ->
reconciled -> stopped|settled`. Stop fences new sessions/attempts first.
In-flight shadow tasks then settle/cancel and the adapter closes inside the
250 ms bound. Timeout or close ambiguity retains reservations and emits a hard
stop. Settle is idempotent, admission closes before cancellation, and exactly
one immutable content-free terminal session receipt may be emitted. The shadow
never requests a speech drain or voice-session close.

Provider-free rehearsal MUST cover startup, success, failure, timeout,
cancellation, stale authorization/config/version, replay, kill-switch all-off
for new sessions, and in-flight settle/shutdown. It MUST prove no calls into
speech, transcript, feedback, customer-output, room, or provider surfaces. The
28-case live matrix remains closed but `unperformed`; repository simulation is
not live evidence.
