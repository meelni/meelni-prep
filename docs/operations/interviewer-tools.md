# Bounded Interviewer Tools

SAV-472 adds a disabled-by-default, repository-only tool surface to the full
interview LiveKit agent. It does not authorize rollout, provider mutation, or
Production use.

## Surface and authority

The LiveKit agent exposes exactly five public `function_tool` names when both
server gates and all local authorities are healthy:

- `read_interview_state`
- `read_interview_clock`
- `get_probe_candidates`
- `commit_interviewer_move`
- `request_graceful_close`

Interview type, selected question, `InterviewBriefV2`, and its round pack are
precompiled inputs. They are never remote lookup tools. Reads are side-effect
free. Commit and close only propose a deterministic local controller event;
they never write lifecycle rows, transcript evidence, feedback, billing,
credits, accounts, provider state, flags, or deployment state.

The model proposes a move type and, when required, one deterministic probe
candidate ID. The controller reconstructs and validates the complete move,
including current question, topic, source turn, writer, state revision,
lifecycle version, allowed moves, time, and move identity. Model/tool success
does not stage or deliver evidence. Only the existing acknowledged canonical
interviewer transcript can commit move history.

## Trusted lifecycle boundary

The tool layer has no HTTP or database adapter. Before any tool is visible:

1. The runtime registers its metadata-only writer through the existing HMAC-
   authenticated internal transcript endpoint.
2. Registration returns the positive generation and lifecycle state/version
   read while the server holds the session-row lock.
3. The runtime issues a separate metadata-only `runtime_lifecycle_read` through
   the same authenticated endpoint. The server accepts it only for the exact
   session, room, writer ID, and current writer generation.
4. A successful active snapshot creates a four-second process-local lease. A
   background reader refreshes it every second with a one-second deadline.
5. Tool calls read only the local lease and controller state. They cannot cause
   a refresh or access the network.

The initial read is reader-first: room metadata and LiveKit presence never
invent `active`. Initial failure keeps the existing interviewer. Refresh
failure invalidates local controller/tool authority. A newer non-active
snapshot fences speech, aborts an undelivered pending move, and is irreversible
within that runtime; an `active` refresh cannot reopen reconnecting, ending,
terminal, or locally deadline-fenced state.

## Bounds and continuation

- Per-call deadline: 150 ms, exclusive.
- LiveKit session cap: `max_tool_steps=3`.
- Adapter cap: at most three distinct calls per interviewer turn.
- Repeating a tool name, concurrent/recursive execution, a fourth call, or a
  call after commit/close is rejected without mutation.
- Mutation replay ledger: at most 128 session-local idempotency identities.
- Pinned LiveKit 1.6.5 may re-enter `llm_node` after tool output on the same
  public speech handle. Only a tool-turn record may continue. Three bounded
  continuations are allowed; overflow gets one final tool-free speech fallback,
  then later re-entry is denied.
- Prompt-led SAV-471 handles remain single-use. Continuation never mints another
  generation nonce, another handle identity, or another move capability.

The original opaque per-instance completion acceptance remains required at
`speech_finished`. A duplicate or raced callback with the same string handle ID
but another acceptance object is a controller no-op and cannot remove the
original record or correlate evidence.

## Failures and fallback

Accepted result statuses are `ok`, `duplicate`, `stale_state`, `stale_writer`,
`expired`, `idempotency_conflict`, `closed`, `invalid_request`, `timeout`, and
`unavailable`. Only `ok` and an exact `duplicate` replay carry a success payload.
Malformed authority that cannot safely form the accepted result envelope gets
an implementation-local fallback envelope instead of fabricated state.

| Condition                                     | Tool/controller effect                                 | Independent runtime effect                                                       |
| --------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Either flag absent                            | No tool surface                                        | Existing prompt-led interview                                                    |
| Initial lifecycle read unavailable/non-active | No controller/tool authority                           | Speech, transcript, watchdog, and settlement continue                            |
| Refresh unavailable/stale                     | Authority invalidated for this runtime                 | Existing interviewer fallback continues                                          |
| Stale revision/writer/lifecycle               | Typed failure, no mutation                             | Same-handle tool-free fallback remains available                                 |
| Timeout or malformed call                     | Typed failure/fallback, no partial state               | Candidate/interviewer persistence is not awaited                                 |
| Near/at deadline or terminal                  | Move denied/fenced                                     | Explicit exit, deadline close, room termination, and settlement retain ownership |
| Interruption/abort                            | No delivered-history commit without canonical evidence | Existing interruption marker and transcript behavior continue                    |

Telemetry emits only the fixed tool name, contract version, closed outcome, and
latency, plus a closed fallback reason. Arguments, results, prompt/model content,
transcript content, customer identity, secrets, and chain of thought are not
recorded by the Meelni tool adapter. The existing controlled span exporter does
not allowlist LiveKit function arguments or outputs.

## Flags and rollback

Both exact server-only values are required:

```text
MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED=true
MEELNI_INTERVIEW_TOOLS_V1_ENABLED=true
```

Neither is set in checked-in environments. Do not add public equivalents,
enable either value, deploy, canary, or infer a launch decision from this code.
Disabling either value restores prompt-led behavior; disabling the controller
gate is the complete controller rollback. Terminal lifecycle outcomes and
writer evidence are never rewritten during rollback.

## Verification

Run with Node 22.22.0 and the bootstrapped pinned Python environment:

```bash
python3 -m unittest agent/test_interviewer_tools.py agent/test_interview_controller.py
agent/venv/bin/python -m unittest agent/test_livekit_interviewer_tools.py
npm run test:python-agent
npm run test:agent
npm run test:interviewer-benchmark
npm run interviewer:benchmark:verify-baseline
npm run check
npm run verify:agent
```

These checks are provider-free and use synthetic fixtures only.
