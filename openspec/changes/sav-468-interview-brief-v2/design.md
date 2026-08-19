# Design: Replay-Stable Pre-Room Brief Compilation

## Flow

1. The web workflow resolves trusted runtime config and selects the exact
   question using existing start semantics.
2. For a new stable start, the TypeScript compiler combines those authorities
   with the absolute deadline, request fingerprint, fixed policy, and static PM
   round pack.
3. The workflow stores the complete serialized brief in the existing session
   config JSON. A replay uses that stored string rather than replacing it.
4. Immediately before LiveKit room creation, the workflow parses the stored
   string and attaches it only when the exact server-owned emission flag is on.
5. Python validates digest and v1 correlation. A valid brief adds bounded
   interviewer-only constraints to the prompt; every other nested-brief state
   falls back to v1.

## Decisions

- Static PM content lives in `@meelni/core`; wire compilation and parsing live
  behind the public `@meelni/agent` entrypoint.
- The production start compiler supplies neither company summary nor candidate
  practice goal because no trusted versioned input is present in this slice.
- A round pack is a catalog. It cannot prescribe a sequence, score an answer,
  or relax no-coaching/no-hints/end-only evaluation policy.
- The persisted wire makes accepted bytes replay-stable without schema work or
  a new database read.
- Trace metadata is content-free and allowlisted. It never carries session,
  candidate, company, question, transcript, or provider-tuning values.

## Compatibility And Rollback

- Top-level room metadata remains version 1.
- Old starts without a stored wire and all missing/unknown/invalid briefs use
  v1 behavior.
- Disabling `MEELNI_INTERVIEW_BRIEF_V2_ENABLED` stops emission without changing
  persisted start or selected-question authority.
- Existing v1 sessions retain the same deterministic opening, deadline,
  hints-off, end-only, and completion behavior.
