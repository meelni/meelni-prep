# Auth Question Intent Contract

Signed-out question-bank launches carry two separate internal destinations:

- `redirectTo`: the successful-auth destination. For a selected question this is the canonical `/dashboard/new-interview` route with `questionId` and a safe `returnTo` query.
- `cancelTo`: the public origin to restore when the candidate leaves authentication. For an Explore launch this includes the current safe path and any URL query parameters. Explore controls that currently live only in component state remain outside this routing contract.

Both values must pass the shared internal-redirect validator. External URLs, protocol-relative URLs, backslashes, control characters, blank values, and missing values fall back independently:

- successful auth falls back to `/dashboard`;
- cancellation falls back to `/`.

Auth transitions between sign-in and sign-up preserve both values. Google OAuth includes both values in its callback URL. An explicit provider cancellation (`access_denied`) returns to `cancelTo`; missing-code and provider callback failures return to sign-in with safe first-party recovery copy, while a successful callback returns to `redirectTo`.

Email confirmation carries both destinations through the same-browser PKCE flow. The confirmation link must be opened in the browser that initiated sign-up because the PKCE verifier is stored there. Cross-device email confirmation requires a separately configured token-hash verification route and is not claimed by this contract.

Query parsing uses the first value for repeated keys, matching `URLSearchParams.get`. Empty or invalid `questionId` values are treated as absent by the launcher. Compatibility routes may preserve raw query strings, but all successful selected-question launches resolve to `/dashboard/new-interview`.
