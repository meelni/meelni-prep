# Transcript runtime integrity delta

## Requirement: pre-output writer identity

The interview runtime MUST register a unique writer generation durably before producing audible output. Registration retries MUST be idempotent. Registration failure MUST prevent output.

### Scenario: replacement writer

Given generation A is registered and generation B replaces it, B MUST receive a later generation, A MUST be fenced from new distinct writes, and A's missing or degraded settlement MUST remain visible to terminal validation.

## Requirement: writer-scoped terminal proof

Each writer generation MUST settle only its own evidence. Feedback eligibility MUST require all registered generations to be settled and no integrity marker or degraded/missing generation.

### Scenario: replacement cannot mask loss

Given A has no watermark and B is settled, the session MUST be ineligible for feedback. Given both are settled and normal signal thresholds pass, the session MAY be eligible.

## Requirement: semantic cutoff

Input and output MUST stop at cutoff `D`. Post-cutoff cleanup MAY persist evidence measured at or before `D`, but no event may end after `D` and the settlement watermark MUST represent `D`.

### Scenario: deadline cleanup grace

Given cleanup completes at `D + 5s`, a watermark representing `D` delivered within the bounded grace MUST be accepted; a watermark representing `D + 1ms` MUST be rejected.

## Requirement: reconnect settlement handshake

Reconnect enforcement MUST request runtime settlement while the room and agent exist, await durable acknowledgement or bounded failure, and only then delete the room and finalize. A passive delay MUST NOT count as acknowledgement.

### Scenario: missing acknowledgement

If the settlement request is unavailable or acknowledgement is missing/degraded at the bound, the room MUST still be deleted and the session MUST terminalize without feedback as insufficient signal.

## Requirement: privacy boundary

The browser MUST NOT persist or retry raw transcript writes. Content-bearing runtime/application paths MUST NOT log questions, prompts, greetings, transcript text, unrestricted error messages, or tracebacks.

### Scenario: content sentinel

Given a synthetic sentinel in question and transcript fixtures, the sentinel MUST be absent from captured Python, TypeScript, provider, analytics, and application logs.
