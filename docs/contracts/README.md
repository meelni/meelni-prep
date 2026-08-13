# Contracts

This directory is for stable behavior and payload contracts that should survive route, provider, or runtime changes.

Good candidates:

- [interview session lifecycle](./interview-session-lifecycle.md);
- [interview session completion and feedback dispatch](./interview-session-completion.md);
- [interview credit recovery](./interview-credit-recovery.md);
- [LiveKit room metadata](./livekit-room-metadata.md);
- [versioned transcript events](./transcript-events.md);
- [derived candidate answer blocks](./answer-blocks.md);
- [feedback v2 evidence and response shape](./feedback-v2.md);
- [deterministic drill recommendations from validated Feedback v2](./drill-recommendations.md);
- [deterministic focused-practice plans from accepted recommendations](./focused-practice-plans.md);
- [focused-practice attempt lifecycle and authenticated workflow boundary](./focused-practice-attempts.md);
- [feedback generation state, event fencing, and retry recovery](./feedback-generation.md);
- [round-specific rubric-dimension evidence coverage and scorecard modes](./dimension-evidence-coverage.md);
- [four-outcome customer feedback presentation and recovery](./feedback-review-outcomes.md);
- [privacy-safe owner feedback-quality signals](./feedback-quality-signals.md);
- [LLM observability and transcript-capture boundaries](./llm-observability.md);
- [evaluation calibration gold set and report](./evaluation-calibration.md);
- [synthetic calibration output semantic adjudication](./evaluation-output-semantic-adjudication.md);
- [dashboard progress evidence](./dashboard-progress.md);
- [question-bank records, taxonomy, and pagination](./question-bank.md);
- [service health and readiness](./service-health.md);
- [redacted operational failure events](./operational-failures.md);
- [selected-question authentication intent](./auth-question-intent.md);
- [public relaunch-aware conversion behavior](./public-reactivation-conversion.md);
- [account export, recent-auth deletion, and retention boundaries](./account-privacy.md);
- [subscription entitlement convergence across Stripe webhook delivery order](./subscription-entitlement.md);
- [paid one-time Stripe Checkout fulfillment and replay behavior](./stripe-checkout-fulfillment.md);
- [required and optional Stripe webhook endpoint events](./stripe-webhook-events.md);
- [deployment provider and rehearsal authority](./deployment-preflight.md);
- [effective public Privacy Policy and Terms-draft truth/indexing gates](./public-legal-draft.md);
- [explicit optional-analytics consent, provider lifecycle, and payload boundaries](./analytics-consent.md);
- subscription entitlement and usage quota states;
- analytics event schemas.
- [contact submission persistence, idempotency, and triage](./contact-submission.md).
