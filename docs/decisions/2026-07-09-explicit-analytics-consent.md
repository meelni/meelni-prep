# Explicit Analytics Consent

Date: 2026-07-09
Status: accepted

## Context

Meelni previously initialized PostHog and Statsig before a visitor chose whether to allow optional analytics. A browser local-storage value and the account setting `share_anonymous_data` represented different truths, both defaulted toward collection, and neither controlled every client and server analytics path. This is incompatible with the trust required for live voice PM interview practice, where interview audio, transcripts, questions, answers, and feedback are particularly sensitive.

## Decision

- Optional analytics use one versioned tri-state contract: `undecided`, `accepted`, or `declined`.
- `undecided` and `declined` are fail-closed. PostHog and Statsig do not initialize or send optional events.
- A first-party HttpOnly preference cookie persists the browser decision. Authenticated users also persist the current decision, policy version, source, and timestamp in `user_settings`.
- Anonymous acceptance is never promoted on sign-in. Authenticated writes are explicit and atomic; newer timestamps win and decline wins ties. Provider access fails closed during any authentication-subject transition.
- Historical `share_anonymous_data=true` values and legacy accepted local-storage values are not affirmative acceptance for the current policy. A legacy decline remains effective.
- PostHog autocapture and session replay remain globally disabled. Statsig autocapture, event logging, storage, and stable-ID generation remain disabled; Statsig is used only for feature evaluation after acceptance.
- Interview audio, transcript text, question or answer text, provider tokens, room names, and direct account/session identifiers are excluded from analytics payloads.
- Event-specific allowlists exclude arbitrary referrers, errors, focus/return destinations, and question identifiers. Account identities use a server-keyed HMAC pseudonym, and provider identifiers rotate on withdrawal or account boundaries.
- A final PostHog envelope filter removes SDK-enriched campaign, referrer, full-URL, session, device, and arbitrary person properties. A one-time pre-init purge removes legacy PostHog browser identities without touching Meelni's consent cookie.
- Legacy browser declines remain browser-local even when an account is signed in. Consent-aware auth completion events wait for the matching accepted subject, and server billing capture is awaited and flushed without making ledger success depend on optional analytics.
- Operational and security logs may continue without analytics consent, but an optional PostHog copy requires current acceptance.

## Relaunch Gate Tradeoff

Statsig network evaluation is unavailable before analytics acceptance. Undecided and declined visitors receive `MEELNI_REACTIVATION_DEFAULT`. It remains `false` before relaunch. When the product launches, operators must intentionally change the fallback with the launch flip so users who decline analytics still receive the product. An instant consent-independent kill switch would require a strictly necessary configuration provider separate from the analytics SDK.

## Rollout

1. Apply additive migration `0009_explicit_analytics_consent` while the relaunch fallback is false.
2. Verify the ten-entry migration chain and exact analytics-consent schema fingerprint in Preview.
3. Deploy the consent API and provider lifecycle together; partial deployment must fail closed.
4. Verify browser network silence for undecided and declined states before enabling the relaunch.
5. Configure and rotate a Preview/Production `ANALYTICS_PSEUDONYM_KEY` of at least 32 random characters; missing or short keys disable authenticated identification and billing analytics.
6. Preserve the additive columns on rollback. Older application code ignores them, but must not be allowed to restore soft opt-in collection.

## Non-goals

- Enabling session replay, autocapture, or transcript analytics.
- Treating analytics consent as authorization, entitlement, abuse-control, or recording consent.
- Claiming legal compliance without legal review.
- Migrating historical soft opt-in values into acceptance.
