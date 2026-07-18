# Analytics Consent Contract

## State

Optional analytics use one versioned tri-state decision: `undecided`, `accepted`, or `declined`. A decided record also carries `policyVersion`, `source`, `decidedAt`, and a browser/account scope.

- Current-version `accepted`: optional browser analytics may initialize.
- `declined`: optional analytics remain off, including under an older policy version.
- Missing, malformed, undecided, or old-version accepted: optional analytics remain off and the user may be prompted again.

Anonymous acceptance is never promoted into an account by a read. Account persistence is last-write-wins by timestamp, with decline winning an equal-timestamp tie. Authentication subject changes immediately invalidate the prior resolved state.

## Persistence

- Browser: versioned `__Host-meelni_analytics_consent` Secure, HttpOnly, SameSite=Lax, host-only preference cookie. The `__Host-` prefix prevents sibling or parent-domain cookie shadowing.
- Account: `user_settings.analytics_consent`, `analytics_consent_version`, `analytics_consent_source`, and `analytics_consent_updated_at`.
- `share_anonymous_data` is deprecated, defaults false, and is never read as consent.
- A legacy `localStorage.cookie-consent=declined` value becomes only a browser-local decline. Historical acceptance is not migrated.
- Consent is a preference, never authentication, authorization, recording consent, or entitlement.

## API

`GET /api/analytics/consent` returns the effective snapshot with `Cache-Control: private, no-store`.

`PUT /api/analytics/consent` accepts same-origin JSON containing a current policy version, `accepted | declined`, and `banner | settings | legacy_decline` source. Anonymous decisions persist to the browser. Authenticated acceptance activates only after account persistence succeeds. Decline is fail-closed locally even when account synchronization needs retry.

## Provider Matrix

| Surface                      | Undecided/declined                                                                                     | Current accepted                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| PostHog browser              | Not initialized                                                                                        | Manual allowlisted events                          |
| Statsig browser              | No client or anonymous ID                                                                              | Evaluation-only; storage and logging disabled      |
| PostHog server               | Event dropped                                                                                          | Consent-bound aggregate event with keyed pseudonym |
| Statsig server relaunch gate | Consent-independent operational evaluation with logging disabled and a non-identifying deployment user | Same                                               |
| Operational/security logs    | Available                                                                                              | Available                                          |

PostHog and Statsig autocapture and replay are always disabled. The same-origin Statsig proxy forwards only `initialize` after trusted current acceptance; registration and SDK-exception endpoints are unavailable.

The server relaunch gate is necessary configuration, not optional product analytics. It uses a non-identifying operational subject, has event logging disabled, and remains governed by the separate owner-controlled relaunch contract.

## Sensitive Content Boundary

Analytics must not include interview audio, recordings, transcripts, prompt or question text, answer text, feedback excerpts, provider tokens, room names, emails/domains, raw user/session/question identifiers, arbitrary errors, query strings, fragments, referrers, or return destinations.

Every event uses an explicit property allowlist. Authenticated identities use an HMAC pseudonym derived with `ANALYTICS_PSEUDONYM_KEY`; raw Supabase identities and profile traits never enter browser Statsig. A missing or short key disables authenticated/server identification and billing analytics. Private feedback route identifiers are reduced to route templates before pageview delivery. Before the first new opt-in, the client purges legacy PostHog and Statsig identifiers, and incomplete cleanup is retried rather than marked complete. PostHog's final `before_send` filter rebuilds the outbound envelope from safe ingestion fields and the event allowlist.

Lifecycle-owned server workflows await consent lookup and optional PostHog delivery after their durable billing mutation commits. Provider failure remains non-fatal, but delivery is not abandoned as an unobserved background promise when a serverless request returns.

## Versioning

Increasing `ANALYTICS_CONSENT_POLICY_VERSION` invalidates prior acceptance and re-prompts. A prior decline remains effective until explicitly changed.
