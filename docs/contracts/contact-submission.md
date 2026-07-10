# Contact Submission Contract

Status: implemented locally for SAV-182; shared-environment rollout not performed

## Guarantee

`stored` means one normalized request was committed to `contact_submission` and can be retrieved by its receipt. It does not mean an email was sent, delivered, read, or answered. The public UI must not claim provider delivery or a response-time SLA.

The route is a thin adapter: parse the request, require a UUID idempotency key, validate and normalize fields, derive rate-limit identities at the trusted edge, consume the durable attempt budget before any authentication-provider lookup, invoke the workflow, and map the result to HTTP.

## Request

- Header: `Idempotency-Key`, required UUID.
- Body: `name` (1–100), normalized email (maximum 320), one canonical reason, `subject` (1–200), and `message` (10–5000).
- Reasons: `billing`, `support`, `bug`, `feedback`, `other`.
- Whitespace is trimmed and email is lowercased before persistence and idempotency comparison.

## Response states

| HTTP | Code/state                                     | Retry                | Meaning                                                                                                              |
| ---- | ---------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 202  | `stored`                                       | no                   | A new row committed; response includes a receipt and `duplicate: false`.                                             |
| 200  | `stored`                                       | no                   | The same key and normalized payload replayed the original receipt with `duplicate: true`.                            |
| 400  | `invalid_request` or `invalid_idempotency_key` | after correction     | No workflow write occurred.                                                                                          |
| 413  | `invalid_request`                              | after shortening     | The bounded JSON body exceeded 32 KiB; no workflow write occurred.                                                   |
| 409  | `idempotency_conflict`                         | new key after review | The key already belongs to a different normalized payload.                                                           |
| 429  | `rate_limited`                                 | yes                  | No submission committed; `Retry-After` and `retryAfterSeconds` agree.                                                |
| 503  | `storage_unavailable`                          | yes                  | Trusted identity, security configuration, limiter, transaction, or storage could not be proven. No success is shown. |

Network retries reuse the same key while the payload is unchanged. Editing any field clears the browser's key. The database serializes accepted-submission work for that key, so concurrent replays create one row. Every request consumes one attempt-budget unit; accepted-submission budgets are consumed only by the request that creates the row.

## Persistence and triage

- `persistence_state` is exactly `stored` in this slice.
- An authenticated submission is linked to `user_id` only when the server-verified account email exactly matches the normalized form email. Account deletion removes only those linked rows; it never deletes another person's request merely because a form contained the account email.
- Anonymous or mismatched-email submissions remain unlinked and require a separately verified privacy request from the submitting email address. Automated deletion by email alone is intentionally forbidden.
- `triage_state` is `new`, `claimed`, or `resolved` and is independent of persistence.
- Queue listing returns receipt, reason, triage state, and created time only.
- Reading customer content requires an exact receipt plus a non-PII operator reference and writes an append-only `read` audit row.
- Claiming or resolving writes an append-only audit row. Service-role callers cannot select the underlying tables directly.

## Abuse-control threat model

Every request first consumes a separately committed trusted-client attempt budget, including exact replays and idempotency conflicts. A second transaction consumes accepted-submission budgets only for a new row:

- trusted-edge client attempt HMAC: 60 requests/hour;
- normalized email HMAC: 3 accepted requests/hour;
- trusted-edge client-address HMAC: 10 accepted requests/hour;
- emergency global HMAC: 10,000 accepted requests/hour.

The dedicated server-only HMAC secret prevents offline guessing of common email/IP values from database fingerprints. Production accepts only Vercel's `x-vercel-forwarded-for` identity and fails closed outside a recognized Vercel edge. Local development may use `x-forwarded-for`. Raw client addresses are never returned by the helper or written to the database.

Residual risks: distributed clients can rotate both IP and email; NAT users share a client budget; the high global ceiling is emergency containment, not primary abuse control. A CAPTCHA/WAF or authenticated support path is a separate decision. The global ceiling is deliberately high so it is not an easy site-wide denial lever.

Relaunch remains gated until a trusted-edge WAF/bot-control policy covers distributed traffic; the database attempt budget is the durable application backstop, not a complete botnet defense.

Limiter rows are operational security state, not support content or a contact-retention mechanism. An indexed, service-only cleanup function deletes at most 5,000 windows older than 24 hours per call with `SKIP LOCKED`.

## Logging and privacy

Operational logs may contain only fixed event and result codes. They must not contain name, email, reason-associated subject, message, raw client address, provider response, request body, or validation payload. Receipt IDs may be used only in the private triage workflow, not routine logs or Linear evidence.

Contact-content retention is intentionally not encoded by SAV-182. The public policy precisely distinguishes account-linked deletion from separately verified communication deletion. Product/Legal must still accept a maximum ordinary retention period before launch; an arbitrary expiry timestamp would not itself delete data and must not be presented as policy.

## Rollout invariant

Keep `support@meelni.com` and `billing@meelni.com` visible until the migration, secret, operator access, cleanup schedule, and monitoring have been proven in the target environment. No provider or shared-environment change is part of this branch.
