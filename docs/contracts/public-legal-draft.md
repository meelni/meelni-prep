# Public Legal Policy Contract

## Status

- Privacy Policy status: approved and effective.
- Privacy Policy version: July 26, 2026.
- Terms status: draft and not effective.

The historical filename is retained because repository tests and references use
it. The contract now distinguishes the approved Privacy Policy from the
unapproved Terms holding page.

## Public route contract

`/privacy` is the public Privacy Policy. It must:

- identify Meelni as the operator and `contact@meelni.com` as the privacy
  contact;
- show an effective date and last-updated date of July 26, 2026;
- emit canonical, indexable public metadata;
- appear in the Production sitemap; and
- use plain language that agrees with implemented product behavior.

`/terms` remains a temporary holding page. It must remain `noindex, nofollow`,
must not emit a canonical or social promotion, and must remain outside the
sitemap until the contracting entity, acceptance process, commercial terms,
governing law, and liability provisions are separately approved.

## Approved privacy representations

### Account and practice data

The public policy may state that Meelni stores:

- account identity, profile, authentication references, settings, and
  preferences;
- selected questions, interview lifecycle and timing data, transcript text,
  generated feedback and scores, bookmarks, practice sets, focused-practice
  responses, and progress insights;
- support/contact submissions; and
- subscription, purchase, usage, payment-summary, and credit-ledger data.

Supabase authentication supports Google and email/password sign-in. Google may
provide profile information for authentication.

### Voice, transcript, and model processing

Live interview audio is transmitted to configured real-time voice and speech
providers while a session runs. Meelni stores transcript text and
audio-duration metadata in the application; it does not create or store a
replayable interview-audio recording in the application.

Interview content may be processed by speech-recognition, language-model, and
speech-synthesis providers to run the interview and generate feedback. The
repository has no separate Meelni model-training pipeline, so the policy states
that Meelni does not use interview content to train a separate Meelni model. It
does not make a broader claim about every provider's independent legal
obligations or retention.

Automated feedback is informational. The product does not use it to make legal
or similarly significant decisions about a user.

### Billing

Stripe processes payment-card details. Meelni stores plan, subscription,
purchase, credit, transaction, invoice, payment-status, and reconciliation
references, but not full payment-card numbers.

### Cookies and optional analytics

Necessary cookies and similar technologies may operate for authentication,
security, continuity, billing handoffs, and privacy-preference storage.

Optional browser analytics stay off until current explicit acceptance. If
accepted:

- PostHog and Statsig may initialize for manually approved product-usage events
  and feature evaluation;
- interview audio, transcripts, questions, answers, and feedback excerpts must
  not enter analytics;
- authenticated identifiers remain pseudonymous;
- PostHog autocapture and session replay remain disabled; and
- Statsig browser storage and event logging remain disabled.

Declining optional analytics does not affect product access. The preference
cookie may last 180 days. Users can change the decision in Data & privacy
settings.

Meelni does not sell personal information, share it for cross-context
behavioral advertising, or run third-party advertising networks in the
reviewed product.

### Provider categories

The approved policy names the current core providers that may process personal
information for their service category: Vercel, Supabase, Google, LiveKit,
Deepgram, OpenAI, Cartesia, Stripe, Inngest, PostHog, and Statsig.

Provider configuration, regions, transfer safeguards, and retention remain
operational facts that must be maintained against deployed contracts. The
policy therefore describes legally recognized transfer mechanisms and
retention criteria without inventing provider-specific periods.

### Retention and deletion

No unsupported universal deletion deadline is promised. Retention is described
using criteria: data type, account activity, the product purpose, security,
dispute resolution, financial reconciliation, tax/accounting requirements, and
other legal obligations.

An authenticated account can request a JSON export or submit an account deletion
request from settings. A successful deletion request means a durable tombstone
exists and product access ends. Application and provider cleanup runs or retries
asynchronously; the response does not mean every provider, backup, log, billing
record, or legally retained record was erased immediately.

Completed tombstones, provider fingerprints, restricted backups, security logs,
and billing records may be retained only where reasonably necessary for
security, legal compliance, fraud prevention, financial reconciliation, or
reliable completion of the deletion request.

### Rights and age

The policy provides one online-business request method through
`contact@meelni.com` plus authenticated export and deletion controls. Requests
may require identity and authority verification.

The policy describes access, copy, correction, deletion, restriction,
objection, portability, withdrawal, appeal, supervisory-authority complaint,
and non-discrimination rights as applicable by location and law.

The Service is not directed to children under 13. Meelni does not knowingly
collect personal information from children under 13 and provides a contact path
for review and deletion.

## Approval evidence

The human product owner explicitly instructed Codex on July 26, 2026 to use its
best judgment to finalize and update the Privacy Policy because no separate
legal reviewer was available. The accepted durable decision is
[`2026-07-26-public-privacy-policy.md`](../decisions/2026-07-26-public-privacy-policy.md).

This approval authorizes the repository content and indexing changes. It does
not certify jurisdiction-by-jurisdiction compliance, approve the Terms draft,
or authorize a Production deployment.

## Change control

Any change to the categories collected, interview-content processing,
analytics purpose, sale/sharing posture, advertising use, provider list,
retention criteria, request methods, age posture, or effective date requires a
policy review and corresponding contract/test update. A material analytics
purpose change must also advance the analytics-consent policy version and
re-prompt prior acceptances.
