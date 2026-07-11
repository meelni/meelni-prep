# Analytics Consent Contract

## State

`decision` is `undecided`, `accepted`, or `declined`. A decided record also carries `policyVersion`, `source`, and `decidedAt`.

- Current-version `accepted`: optional analytics may initialize.
- `declined`: optional analytics remain off, including when recorded under an older policy version.
- Missing, malformed, undecided, or old-version accepted: optional analytics remain off and the user may be prompted again.

Browser decisions are scoped as anonymous or account-local. Anonymous acceptance is never promoted into an account by a read; the user must make an explicit authenticated choice. Account persistence uses one atomic conditional write: newer timestamps win and decline wins an equal-timestamp tie. A newer local account withdrawal may temporarily override stale account acceptance while account synchronization is retried, but browser acceptance can never override account state.

## Persistence

- Browser: versioned `meelni_analytics_consent` HttpOnly, SameSite=Lax preference cookie.
- Account: `user_settings.analytics_consent`, `_version`, `_source`, and `_updated_at`.
- `share_anonymous_data` is deprecated, defaults false, and is never read as consent.
- Browser consent is not an authentication or authorization signal.
- Consent is resolved for the current authentication subject. A sign-in, sign-out, or account switch synchronously returns providers to the unresolved/off state until that subject is loaded.
- A legacy `localStorage.cookie-consent=declined` value is migrated only to a browser-local decline. It is never written into whichever account happens to be signed in on a shared browser.

## API

`GET /api/analytics/consent` returns the effective snapshot and current policy version with `Cache-Control: private, no-store`.

`PUT /api/analytics/consent` accepts JSON:

```json
{
  "decision": "accepted",
  "policyVersion": 1,
  "source": "banner"
}
```

Only `accepted` and `declined` can be written. An outdated version returns `409 consent_policy_outdated`. Anonymous decisions persist only to the browser; authenticated decisions use atomic account persistence before acceptance is activated. Withdrawal is applied optimistically, rotates provider identifiers immediately, persists to the browser even if account synchronization is temporarily unavailable, and exposes a retry action until account persistence succeeds.

## Provider Matrix

| Surface                   | Undecided/declined        | Current accepted                                 |
| ------------------------- | ------------------------- | ------------------------------------------------ |
| PostHog browser           | Not initialized           | Manual minimized events only                     |
| Statsig browser           | No client or anonymous ID | Evaluation-only client; logging disabled         |
| Statsig server gate       | Configured fallback only  | Network evaluation allowed                       |
| PostHog server            | Optional event dropped    | Minimized event allowed when consent is supplied |
| Operational/security logs | Available                 | Available                                        |

PostHog and Statsig autocapture and replay are always disabled regardless of consent. Statsig IDs, including known legacy IDs, are removed on withdrawal and authentication-subject boundaries.

The same-origin Statsig proxy independently resolves trusted consent and
forwards only the evaluation `initialize` endpoint. Undecided, declined,
outdated, or unresolved consent returns without provider traffic; event
registration and SDK-exception forwarding are not part of the product
contract.

## Sensitive Content Boundary

Analytics must not include interview audio, recordings, transcripts, prompt or question text, answer text, feedback excerpts, provider tokens, room names, emails/domains, raw user/session/question identifiers, arbitrary errors, referrers, focus values, or return destinations. Every event uses an explicit property allowlist. Internal locations become paths without query strings or fragments; external locations become origins. Errors use bounded codes.

Authenticated analytics identities are server-generated HMAC pseudonyms using `ANALYTICS_PSEUDONYM_KEY`; a plain browser hash is not accepted. Consent-aware billing analytics read current account consent, use the HMAC pseudonym, and emit aggregate credit facts only.

Before the first explicit opt-in after this decision, Meelni purges legacy PostHog identities and stored super-properties from local storage, session storage, and non-HttpOnly cookies. The new Meelni consent cookie is excluded. PostHog's final `before_send` boundary then rebuilds every outbound envelope from ingestion identifiers plus the event-specific allowlist, so SDK-added campaign, referrer, URL, session, device, and person properties cannot bypass the contract.

Consent-aware auth completion telemetry is emitted only after the matching account subject is resolved and PostHog is ready. Signup/signin carry only the method. Explicit signout is captured after successful authentication signout while the prior accepted runtime is still active.

## Versioning

Increasing `ANALYTICS_CONSENT_POLICY_VERSION` invalidates prior acceptance and re-prompts. A prior decline remains effective until the user explicitly changes it.
