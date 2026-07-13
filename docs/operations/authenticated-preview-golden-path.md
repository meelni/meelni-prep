# Authenticated Preview Golden Path

Status: provider-free preflight is implemented; the provider-connected receipt is not yet complete. The relaunch decision remains NO-GO.

This runbook proves one exact synthetic path:

```text
fresh Preview account
  -> canonical two-credit trial
  -> selected PM question
  -> one LiveKit interview room and named-agent dispatch
  -> durable version-2 transcript
  -> completed user_end terminal outcome and consumed credit
  -> dispatched and completed asynchronous feedback
  -> default-off rollback and complete cleanup
```

It does not authorize Production, customer data, recordings, provider provisioning, shared environment changes, agent deployment, Stripe changes, or additional sessions. Do not place an email, user ID, access token, cookie, room token, transcript text, question text, provider error, or secret in a tracked file, command argument, shell history, chat, Linear, or the final receipt.

## Why Text-Only Automation Does Not Prove The Gate

Current LiveKit Agents accepts frontend text on the `lk.chat` stream. Meelni deliberately persists only transcript turns with provider-measured `started_speaking_at` and `stopped_speaking_at` metrics. A text-only `ChatMessage` does not establish those audio-delivery measurements and is converted to a transcript-integrity marker. It cannot satisfy the five-minute, five-turn, three-substantive-response feedback boundary.

Use a private, approved synthetic audio fixture through a real LiveKit candidate participant. The fixture must remain outside the repository in a mode-`0600` file and must contain no customer or Production material. Do not enable provider recording. The runner may inspect transcript content in private process memory only to calculate the existing substantive-response rule; it emits counts, booleans, and SHA-256 correlation hashes, never content.

## Observed Preflight Evidence

The provider-free inspection observed the following pre-scaffolding deployment evidence at exact head `efcf1b7d031d712eabd449274f79d545592ba8f9`. Refresh every identity after the next commit or deployment; none of these observations automatically transfers to a later head.

- Vercel deployment `dpl_xEw713hBckBqixBM6iNsFXNfoFWn` is Ready at `https://meelni-ne5f3bcoe-meelni.vercel.app`.
- A fresh authenticated Vercel health observation returned HTTP 200 with web, database, core LiveKit, feedback dispatch, and Stripe webhook healthy. This is configuration evidence only.
- the dedicated Preview database preflight is reconciled through 23 migrations, has 29/29 RLS tables, zero unsafe policies, zero launch-integrity counts, and all launch-readiness booleans true;
- branch-scoped Vercel Preview contains the required LiveKit and Inngest environment names. The encrypted LiveKit values pull blank locally, so the local worktree cannot execute a room;
- the documented running Preview agent evidence names agent `CA_ZbGxFjfEYwsD`, version `LJ8EHo5sNzu8`, and dispatch `meelni-preview-interview`;
- the current local LiveKit CLI registry contains only `test` and Production `meelni`. It does not contain `meelni-preview`; an attempted read-only status lookup fell back to unauthorized `test` and returned 401. Re-linking the exact Preview alias is therefore a mandatory preflight, not evidence that the agent is down.

## Hard Preconditions

Stop before authentication or any provider mutation unless all are true:

1. The exact Git head, Vercel deployment ID, deployment URL, branch, and Ready state are re-read immediately before the run.
2. Authenticated health is current and fully healthy.
3. The strict Preview database preflight remains clean.
4. `meelni-preview` is positively linked in a private LiveKit CLI home. Its safe projected project ID/URL differ from Production, and a read-only status call reports the expected interview agent running at the expected version.
5. The branch Inngest environment still contains the complete 14-source-function inventory plus one generated feedback-failure handler.
6. A fresh synthetic identity and an unrelated synthetic control identity are prepared privately. Neither is derived from a customer account.
7. Statsig administration can install and later remove one exact-user allow rule while the global gate and `MEELNI_REACTIVATION_DEFAULT` remain false. A branch fallback is not an equivalent candidate-only control when a healthy Statsig gate returns false.
8. One private synthetic audio fixture has at least five minutes of elapsed delivery and at least three distinct substantive candidate answers. It has been reviewed as synthetic/approved and contains no personal data.
9. Feedback execution has an enforceable maximum of three physical model attempts and a deterministic worst-case total below a hard cap no greater than 100,000,000 nano-USD ($0.10). Stop if the exact physical call count and conservative cost ceiling cannot be captured.
10. A cleanup owner and rollback commands are ready before the temporary gate rule is installed.

## Safest Execution Order

Create one private directory outside the repository with mode `0700`. Store all ephemeral identities, cookies, tokens, the audio fixture, and the unredacted operator log there with mode `0600`. Never pass secrets as process arguments.

1. Capture the immutable deployment/provider identities and their current status.
2. Create the fresh synthetic Preview user through the isolated Supabase admin boundary and establish an ordinary authenticated browser session on the exact deployment. Keep the identity only in the private workspace.
3. With the relaunch gate still globally off, call `POST /api/session/start` using a new stable UUID and a selected active question. Require HTTP 403 `interview_practice_unavailable`. Compare Preview database and LiveKit inventories before/after; session, credit-transaction, room, and dispatch deltas must all be zero.
4. Install a temporary Statsig allow rule matching only the synthetic user's exact stable ID. Keep the global gate false. Verify the unrelated synthetic control still receives the same 403 and zero-mutation result.
5. Start one 15-minute `voice_video` session with the approved selected question. Require the response session ID to equal the start-attempt UUID, the deterministic room hash to match, the returned selected-question ID to match the request, and exactly one matching named-agent dispatch.
6. Join as the exact candidate identity and publish the private synthetic audio fixture through a real audio track. Observe candidate and distinct agent presence plus the signed durable runtime-activation event. Confirm the interviewer asks the selected question first without persisting its text in evidence.
7. Wait until the authenticated transcript read shows at least five durable contract-v2 turns, at least three candidate turns, at least three substantive candidate responses, and at least 300 seconds between the earliest valid start and latest valid end. Require every turn to correlate to the same session and room. Keep content private.
8. End once through `POST /api/interview/end`. Require `completed`, `user_end`, eligible `partial` or `full` tier, usable evidence, consumed credit, and acknowledged room deletion/already-absent cleanup. Retry only documented idempotent recovery paths.
9. Poll authenticated feedback. Require dispatch `dispatched` and terminal `completed` feedback with exact v2 schema, prompt, rubric, configured model, and at least one strength and improvement. Record only safe counts, the physical call count, and the deterministic worst-case provider cost.
10. Remove the temporary Statsig allow rule. With the same authenticated synthetic account and a new attempt UUID, re-prove HTTP 403 plus zero mutation delta.
11. Remove the synthetic account through the normal immediate-deletion path, prove the LiveKit room absent, revoke or rotate only the dedicated rehearsal bypasses, preserve independently verified consumer credentials, and remove every temporary private artifact except the receipt.

If any step fails, restore default-off first, stop provider work, preserve only the private diagnostic needed for recovery, and record NO-GO. Do not weaken authentication, broaden the feature gate, forge transcript rows, call the internal transcript endpoint as the browser, seed credits directly, or manually mark feedback complete.

## Receipt Verification

The private receipt must conform exactly to the verifier's content-free contract. The verifier rejects stale deployment identity, extra fields, weak lifecycle/transcript/feedback thresholds, missing candidate isolation, spend at or above the cap, incomplete cleanup, a non-private file, and mismatched provider identities.

Run it under pinned Node 22.22.0 after replacing the placeholders with freshly observed non-secret identities:

```bash
node scripts/verify-preview-golden-path-receipt.mjs \
  --receipt /absolute/private/path/sav-186-receipt.json \
  --expect-head <40-character-head> \
  --expect-deployment-id <dpl-id> \
  --expect-deployment-url <exact-https-vercel-url> \
  --expect-branch codex/sav-226-provider-isolation \
  --expect-supabase-project-ref <preview-ref> \
  --expect-livekit-project-id <preview-project-id> \
  --expect-livekit-agent-id <preview-agent-id> \
  --expect-livekit-dispatch-name meelni-preview-interview \
  --expect-inngest-environment <exact-branch-environment> \
  --expect-feedback-model <exact-model>
```

The only successful stdout is a compact object containing the contract/version, pass code, exact commit/deployment IDs, and SHA-256 receipt hash. It contains no candidate, question, room, transcript, feedback content, token, cookie, or secret. Publish only that object plus provider-owned safe receipt IDs after cleanup, then remove the private receipt.

## Go/No-Go

This slice is GO only when the verifier passes on a fresh complete receipt and the exact sources behind every observation remain inspectable. Health, unit tests, a running agent, an Inngest sync, or a manually inserted transcript is not a substitute. Until then SAV-186 and the relaunch remain NO-GO.
