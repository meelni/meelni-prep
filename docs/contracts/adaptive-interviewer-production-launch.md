# Adaptive Interviewer Production Launch Contract

## Admission

`adaptive-interviewer-production-admission.v1` is an optional nested field in
ordinary interview room metadata. It is emitted only when every exact server
flag and launch binding is present. The HMAC-SHA-256 payload binds:

- session ID, room name, request fingerprint and interview deadline;
- Production/candidate-default/canary/default rollout identity;
- exact candidate Git SHA and launch configuration SHA-256;
- exact adapter/provider/model/base URL and retry-free limits;
- ten attempts, 100,000,000 nano-USD attempt reserve,
  1,000,000,000 nano-USD session ceiling and 750 ms deadline.

The web signs with the existing LiveKit API secret. The worker verifies with the
same secret using constant-time comparison. The secret and signature input are
never logged. Missing admission means current deterministic behavior. Present
but malformed, tampered, stale, cross-session or configuration-drifted admission
fails closed to deterministic behavior with no Director provider construction.

## Runtime

The Production Director uses the reviewed direct OpenAI Responses adapter:
`store=false`, no tools, no continuation, no background execution, no streaming,
direct `https://api.openai.com/v1/`, exact model, default service tier and zero
SDK/generic retries. A local conservative ledger reserves before each provider
attempt. Failure, timeout, cancellation, invalid response and ambiguous usage
retain at least the reservation; trusted higher normalized usage reconciles
upward. The next attempt is denied at the session ceiling.

## Authority

The Director cannot speak, persist transcripts, create feedback or settle
credits. Recommendations enter only through the existing Director store and
influence gate. The assessor and deterministic controller remain final move
authority; lifecycle freshness, deadline, target/probe, replay and canonical
delivery checks remain unchanged.

## Rollback and feedback

New sessions become all-off when launch configuration is absent or invalid.
Within one worker process, Director influence still re-reads its supplied policy
mapping on each admission and falls back to the original tool move when that
mapping is disabled. Production configuration rollback applies to newly
assigned work while the replaced worker drains; it is not represented as an
instant mutation of an already-running process. Existing transcript, feedback
and credit behavior is unchanged. Feedback may remain scoreless when the
interview does not cover enough rubric dimensions; launch must not fabricate
numerical precision.
