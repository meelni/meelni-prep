# Contracts

This directory is for stable behavior and payload contracts that should survive route, provider, or runtime changes.

Good candidates:

- [interview session lifecycle](./interview-session-lifecycle.md);
- [interview session completion and feedback dispatch](./interview-session-completion.md);
- [interview credit recovery](./interview-credit-recovery.md);
- [LiveKit room metadata](./livekit-room-metadata.md);
- [versioned transcript events](./transcript-events.md);
- [feedback v2 evidence and response shape](./feedback-v2.md);
- [deterministic drill recommendations from validated Feedback v2](./drill-recommendations.md);
- [deterministic focused-practice plans from accepted recommendations](./focused-practice-plans.md);
- [feedback generation state, event fencing, and retry recovery](./feedback-generation.md);
- [evaluation calibration gold set and report](./evaluation-calibration.md);
- [synthetic calibration output semantic adjudication](./evaluation-output-semantic-adjudication.md);
- [dashboard progress evidence](./dashboard-progress.md);
- [question-bank records, taxonomy, and pagination](./question-bank.md);
- [service health and readiness](./service-health.md);
- [redacted operational failure events](./operational-failures.md);
- [selected-question authentication intent](./auth-question-intent.md);
- [account export, recent-auth deletion, and retention boundaries](./account-privacy.md);
- [subscription entitlement convergence across Stripe webhook delivery order](./subscription-entitlement.md);
- [paid one-time Stripe Checkout fulfillment and replay behavior](./stripe-checkout-fulfillment.md);
- [deployment provider and rehearsal authority](./deployment-preflight.md);
- [public Terms and Privacy engineering-draft truth and indexing gates](./public-legal-draft.md);
- subscription entitlement and usage quota states;
- analytics event schemas.
