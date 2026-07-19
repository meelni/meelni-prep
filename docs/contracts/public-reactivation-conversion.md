# Public Reactivation Conversion Contract

Public acquisition content remains useful while the relaunch gate is off. Explore, company guides, blog articles, and pricing information stay reachable and indexable; the gate controls activation, not access to truthful public content.

## One Decision

Every public practice, signup, demo, or purchase action consumes the same `meelni_reactivation_access` value bootstrapped by the root server layout. Public components must not resolve an independent client-only launch state. Server enforcement resolves that operational gate with the same fixed `public-launch-state` identity for every request; authentication remains a separate prerequisite and never changes the gate evaluation.

When the decision is paused:

- practice controls render the truthful `Practice currently paused` state;
- practice, signup, demo, and checkout controls have no activation destination;
- signed-out visitors retain Log In access and signed-in users retain Dashboard/account access;
- existing-account sign-in remains available, including Google; because the public OAuth flow cannot distinguish an existing identity before redirect, it may create a dormant authentication identity, but server gates still prevent practice, demo, and purchase activation;
- selected-question actions do not open the sign-in modal or navigate to setup;
- demo-token and Checkout requests do not start;

SAV-272 owns checkout-result truth. Its finalized queryless return flow remains unchanged from `main`; the confirmed-result practice action consumes the same relaunch decision without changing settlement evidence or correlation behavior.

When the decision is available, the existing destination and behavior remain intact. Selected-question launches retain the exact `questionId` and safe `returnTo` context defined by the [Auth Question Intent Contract](./auth-question-intent.md).

## Rollout Boundary

This contract does not change the gate, its default, provider configuration, or launch authority. The feature remains default-off until the product owner records an explicit GO and separately authorizes the launch action for the exact candidate.

## Verification

- Component tests cover enabled and paused rendering.
- Question-entry tests cover paused, authenticated, and signed-out decisions.
- The public activation source contract enumerates public conversion surfaces and rejects raw `/dashboard/new-interview` links outside routed blog content and the bounded SAV-272 checkout-result owner.
