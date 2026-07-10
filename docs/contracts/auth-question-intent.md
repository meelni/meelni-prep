# Auth Question Intent Contract

Signed-out question-bank launches carry two separate internal destinations:

- `redirectTo`: the successful-auth destination. For a selected question this is the canonical `/dashboard/new-interview` route with `questionId` and a safe `returnTo` query.
- `cancelTo`: the public origin to restore when the candidate leaves authentication. For an Explore launch this includes the current safe path and any URL query parameters. Explore controls that currently live only in component state remain outside this routing contract.

Both values must pass the shared internal-redirect validator. External URLs, protocol-relative URLs, backslashes, control characters, blank values, and missing values fall back independently:

- successful auth falls back to `/dashboard`;
- cancellation falls back to `/`.

Auth transitions between sign-in, sign-up, forgot password, and reset password
preserve both values. Google OAuth includes both values in its callback URL. A
bare provider denial (`access_denied` without a provider `error_code` or auth
code) returns to `cancelTo`. Coded access denials, missing-code responses, and
provider callback failures return to sign-in with safe first-party recovery
copy; provider descriptions are never reflected. A successful callback returns
to `redirectTo`.

Email confirmation and password recovery carry both destinations through the
same-browser PKCE flow. The email link must be opened in the browser that
initiated the request because the PKCE verifier is stored there. Cross-device
email confirmation or recovery requires a separately configured token-hash
verification route and is not claimed by this contract.

Auth initialization releases blocking UI after ten seconds if the initial
session lookup has not settled. A delayed successful lookup may still restore
the session. While initialization is active, auth pages use one labeled live
status whose animation stops under reduced-motion preferences.

Query parsing uses the first value for repeated keys, matching `URLSearchParams.get`. Empty or invalid `questionId` values are treated as absent by the launcher. Compatibility routes may preserve raw query strings, but all successful selected-question launches resolve to `/dashboard/new-interview`.
