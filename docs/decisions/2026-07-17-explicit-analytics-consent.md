# Explicit Analytics Consent

Date: 2026-07-17
Status: accepted

## Context

Meelni previously initialized PostHog and Statsig before a visitor chose whether to allow optional analytics. The browser preference and historical `share_anonymous_data` setting represented different truths and defaulted toward collection. That is not acceptable for live PM interview practice.

## Decision

- Use one versioned tri-state contract: `undecided | accepted | declined`.
- Undecided, unresolved, stale, malformed, and declined states fail closed.
- Persist browser decisions in a first-party Secure, HttpOnly, host-only `__Host-` cookie and authenticated decisions in additive `user_settings` columns.
- Never treat historical soft opt-in values as current acceptance.
- Keep PostHog/Statsig autocapture and replay disabled regardless of consent.
- Do not create a browser provider client or anonymous provider identifier until current explicit acceptance.
- Reset provider identity on withdrawal, sign-out, and authentication-subject change.
- Allow only minimized event properties; use a server-keyed HMAC pseudonym for authenticated delivery and reduce private dynamic routes to templates.
- Keep the consent-independent server relaunch gate operational with a non-identifying deployment subject and Statsig logging disabled. Consent must not determine product access.
- Continue operational and security logs without analytics consent; optional provider copies still require acceptance.

## Rollout

1. Apply additive migration `0023_explicit_analytics_consent` while the relaunch flag remains off.
2. Configure a unique 32+ character `ANALYTICS_PSEUDONYM_KEY` per environment; missing keys disable authenticated/server analytics.
3. Deploy the API, providers, and UI together. A partial or failed deployment remains fail-closed.
4. In isolated Preview, prove provider-network silence for undecided and declined states, exactly-once initialization after acceptance, and shutdown/identifier rotation on withdrawal, sign-in/out, and account switch.
5. Preserve the additive columns on rollback and never restore soft opt-in behavior.

## Non-goals

- Enabling replay or autocapture.
- Treating analytics consent as launch authorization, entitlement, abuse control, or recording consent.
- Claiming legal compliance without accountable legal/owner review.
- Making any Production/provider mutation in this implementation PR.
