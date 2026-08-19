## 1. Domain and data seam

- [x] Add typed/versioned provider-free ranking input, output, weights, stable
      ties, reason codes, and safe round fallbacks.
- [x] Add one bounded candidate/history/evidence context using existing
      evidence-valid feedback helpers.
- [x] Add stable catalog hashing and explicit query/candidate/history bounds.

## 2. Workflow and persistence

- [x] Preserve explicit selected-question authority before ranking.
- [x] Compile the deterministic winner into the existing `InterviewBriefV2`.
- [x] Persist compact reason/version metadata and an exact replay snapshot.
- [x] Reuse accepted selection and brief bytes without Python/runtime reads.

## 3. Tests and documentation

- [x] Cover every factor, stable ties, invalid feedback, repeats/mastery,
      fallbacks, bounds, explicit authority, replay, and brief integration.
- [x] Add a reusable synthetic fixture matrix and local non-Production timing.
- [x] Document scoring, privacy, bounds, fallbacks, and rollout ownership.
- [x] Complete required local validation; hosted validation follows the ready
      pull request.
