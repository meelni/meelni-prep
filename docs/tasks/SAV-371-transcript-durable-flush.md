# SAV-371 durable transcript flush

## Status

- Candidate fix is under review in PR 515.
- The fix is not deployed or verified in Production.
- The failed Production session cannot be reconstructed because the missing
  turns were never durably persisted.

## Intent

- User request: Investigate why an audible Production interview produced no
  usable transcript and make ending reliable from any conversational state.
- Product/user outcome: Every accepted turn is durable before it appears in the
  room, and End Interview cannot starve the final transcript drain.
- Why now: A Production session queued its audible turns in the runtime but
  persisted only the opening interviewer turn.

## Slice

- Primary slice: Interview transcript integrity and lifecycle settlement.
- Secondary slices: LiveKit turn-taking, durable browser hydration, feedback
  eligibility, and Production operations.
- Relevant skills: LiveKit interview runtime, Linear workstream, engineering
  memory, and PR preparation.

## Linear tracking

- Project: Meelni.
- Parent slice issue: SAV-365.
- Child deliverable issue: SAV-371.
- Current Linear state: In Review.

## Verified incident evidence

The Production runtime queued ten audible turns. Durable transcript inspection
found only the opening interviewer turn. At shutdown the runtime reported an
incomplete drain with eleven pending items, ten permanent failures, and a
timeout. The signed ingest route returned twelve terminal-state conflicts
during or after finalization. The explicit end route returned success, but its
bounded runtime-settlement request was unavailable.

No transcript text, recording, room credential, provider secret, email, or
session identifier is recorded here.

## Root cause

1. A background transcript flush held the queue's single-flight ownership while
   it also waited on best-effort LiveKit room projection.
2. Foreground end settlement waited behind that task. Its internal stage budgets
   could outlive the server's five-second settlement window.
3. The server correctly honored the candidate's end intent and finalized the
   session after the bounded wait.
4. Late runtime retries then reached a terminal session and were rejected.
5. Because the room notification is post-persistence only, the browser could
   not recover turns that never reached durable storage.

The browser therefore exposed the durable truth: the transcript was absent,
rather than merely hidden by a rendering bug.

## Candidate invariants

- Durable ingest no longer waits for room data projection; projection is a
  bounded best-effort follow-up.
- Foreground settlement quiesces and, when necessary, cancels a stuck
  background flush before replaying the idempotent queue.
- Enqueue activity during post-flush status publication schedules another
  drain, closing the lost-wakeup window.
- Shutdown, server requests, RPC requests, and deadline settlement serialize
  through one runtime-settlement lock.
- Transcript status publication cannot precede the durable drain and is
  independently bounded.
- End settlement disables input, interrupts active interviewer playout,
  commits active candidate speech with `skip_reply=True`, and waits for runtime
  idle under one bounded helper.
- Synchronous provider failures and timeouts degrade evidence without escaping
  terminalization or fabricating a complete transcript.
- Agent-state transitions trigger bounded durable transcript rehydration so a
  dropped post-persistence room notification does not leave a persisted turn
  invisible until reload.

## Regression coverage

Automated behavior coverage includes:

- cancellation of a stuck background flush followed by foreground replay;
- enqueue during status publication;
- concurrent shutdown and server settlement ownership;
- end during candidate speech;
- end during interviewer playout;
- end while the model/runtime is thinking;
- speech-settlement timeout and synchronous provider failure;
- durable browser recovery after a missed room notification;
- runtime settlement success, degradation, timeout, unavailability, duplicate
  end, and terminal replay through the existing end workflow tests.

## Production rollout

Risk is high because the change affects transcript evidence, terminal lifecycle,
and feedback eligibility.

1. Merge the reviewed web/API and Python runtime changes together.
2. Record the exact merged `main` commit and wait for the matching Vercel
   Production deployment to report healthy.
3. On the authorized owner workstation, prepare the guarded
   `livekit-production-interview-deploy` payload for that exact commit and
   current Production target without printing fingerprints or secret material:

   ```bash
   export MEELNI_REVIEWED_MAIN_SHA="<exact 40-character merged main SHA>"
   npm run production-action:livekit-interview -- prepare \
     --expected-candidate-sha "$MEELNI_REVIEWED_MAIN_SHA" \
     --config-file "$MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_CONFIG" \
     --secrets-file "$MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_SECRETS_FILE" \
     --output-path "$HOME/.config/meelni/production-actions/livekit-interview-unsigned.json"
   ```

   The provider-free helper validates the reviewed config and owner-only secret
   file and binds the exact clean Git candidate.

4. The human product owner reviews and signs a fresh bounded authorization on
   the authorized workstation. This authorization is not launch GO.
5. Run `agent/interview/deploy.sh production` from the same clean merged commit.
   Do not use a direct provider CLI or dashboard deployment.
6. Confirm the new LiveKit version is running and matches the reviewed source
   commit before opening a test room. Do not begin the deploy while a controlled
   test interview is active: LiveKit uses a rolling deployment and may let old
   instances finish existing sessions for up to one hour, while routing new
   sessions to healthy new instances.
7. Run one controlled Production interview at a time and verify:
   - normal candidate and interviewer turns appear and survive reload;
   - end during silence completes once;
   - end during candidate speech preserves the measured committed prefix;
   - end during interviewer speech stops playout and preserves only delivered
     speech;
   - early exit completes without feedback when evidence is insufficient;
   - the durable turn count and speaker ordering match audible delivery;
   - runtime settlement reaches a durable settled or explicit degraded state;
   - end returns the stored terminal result without transcript-ingest conflicts;
   - feedback runs only when every writer generation has complete evidence.
8. Stop after the first integrity mismatch. Preserve metadata-only evidence and
   prepare a forward fix; do not repeat end requests or expose incomplete
   feedback.

### Recovery boundary

The guarded Production wrapper consumes authorization before provider mutation,
so any failed deploy requires a newly reviewed and signed artifact. Do not edit
the consumption ledger or bypass the wrapper. No direct rollback adapter is
approved. If the candidate fails live verification, stop further sessions,
keep feedback fail-closed, and prepare an owner-reviewed forward repair or
separately authorized emergency action.

## Prioritized remaining lifecycle work

### P0 — release and verify

- Merge and deploy SAV-371 from one reviewed commit across web and LiveKit.
- Verify SAV-366 lifecycle activation in Production so transport-connected
  rooms cannot remain application-level `connecting`.

### P1 — real-session interaction quality

- Verify SAV-368 opening duration and barge-in behavior against actual
  candidate interruptions.
- Verify SAV-369 endpointing and pause tuning against natural, fragmented PM
  answers without treating short pauses as completed turns.
- Implement SAV-370 release identity and stage-level settlement telemetry so
  web/runtime skew and drain starvation are diagnosable without transcript
  access.

### P2 — operational hardening

- Add a controlled Production canary checklist that compares audible turn
  counts with durable counts using metadata only.
- Evaluate durable outbox storage only if bounded in-memory replay continues to
  lose evidence after the P0/P1 fixes; do not add it speculatively.

## Open questions

- Whether the combined server and runtime settlement budget needs a larger
  Production envelope after live latency measurement.
- Whether agent-state rehydration should later be replaced by an explicit
  metadata-only persisted-turn acknowledgement stream.
- Whether a guarded emergency disable or rollback adapter should be added to
  the Production action contract.
