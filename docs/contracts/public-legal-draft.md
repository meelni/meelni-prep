# Public Legal Draft Truth Contract

Status: engineering contract; final legal policy not approved

## Purpose

`/terms` and `/privacy` are engineering drafts that summarize implemented
product behavior for accountable owner and legal review. They are not approved
legal advice, effective terms, or a complete privacy notice.

Until accountable approval is recorded:

- both routes must explicitly emit `noindex, nofollow`;
- neither route may emit a canonical, Open Graph, or Twitter promotion;
- neither route may appear in the sitemap;
- no “Last updated” or effective date may imply policy approval;
- the relaunch fallback remains default-off independently of the routes.

## Evidence hierarchy

Factual statements must be grounded in this order:

1. accepted decisions and stable contracts;
2. implemented workflows, data selections, and provider adapters;
3. tested public presentation derived from the same source;
4. clearly labeled open questions.

Do not infer policy from a UI label, optional environment variable, legacy
schema field, provider marketing page, or aspirational roadmap.

## Corrected claim classes

| Legacy claim                                                         | Repository truth                                                                                                       | Draft treatment                                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Pro includes unrestricted interviews                                 | Accepted catalog is 12 credits/month with bounded rollover                                                             | Billing facts project the canonical public catalog                         |
| Accounts use Google OAuth                                            | Google and email/password auth are implemented                                                                         | Name both methods                                                          |
| Meelni stores replayable interview audio                             | Reviewed application storage persists transcript text and timing/duration metadata; voice providers process live audio | Do not claim durable audio-file storage; require provider-retention review |
| Interview content improves provider models                           | No approved training-purpose contract or separate training pipeline is established                                     | State no such purpose; require explicit approval for any future use        |
| Security controls are “industry standard” and regularly audited      | The repo has concrete auth, ownership, RLS, redaction, and secret-handling controls, but no certification contract     | Do not make comparative or audit-frequency guarantees                      |
| Account data is erased within a fixed number of days                 | Local deletion is asynchronous and completed tombstones have intentionally undefined retention                         | Describe workflow truth and promise no exact date                          |
| Human review of automated feedback is available                      | No human-review workflow is implemented                                                                                | Do not offer this control until an owned workflow exists                   |
| Regional rights, transfers, age rules, and governing law are settled | No accountable policy decision is recorded                                                                             | Keep in the owner/legal decision list                                      |
| Browser analytics consent is approved                                | Current PostHog/Statsig and cookie-banner behavior require separate consent remediation and owner review               | Disclose current engineering behavior without declaring compliance         |

## Billing boundary

Terms billing facts must be projected from
`lib/billing/catalog-presentation.ts`, which derives from the accepted core
catalog. Legal copy must not duplicate plan allowances as independent strings
or revive removed free/unrestricted plans.

## Account privacy boundary

The privacy draft may describe the implemented account export and durable
deletion workflow from `docs/contracts/account-privacy.md`. It must preserve
these limitations:

- export is allowlisted, user-scoped, and excludes provider operations;
- a deletion response means the durable asynchronous request exists, not that
  all provider cleanup completed;
- completed tombstone, provider, billing, log, and backup retention has no
  approved universal deletion period;
- provider/admin errors, secrets, and raw webhook payloads are not user-facing
  export data.

## Decisions requiring accountable approval

Privacy policy decisions include legal entity/contact, lawful bases, regional
rights and request verification, age eligibility, subprocessors and transfers,
retention schedules, and cookie/analytics consent.

Terms decisions include contracting entity/contact, eligibility and acceptable
use, content ownership/licenses, purchase/refund/cancellation/tax terms,
enforcement and appeals, warranty/liability/indemnity/disputes, governing law,
change notice, and effective date.

Engineering tests can prove the draft matches repository behavior and remains
unindexed. They cannot approve these decisions.

## Internal implementation review inventory

This section is review material for accountable owners and counsel. It must not
be copied onto the public holding pages merely because those pages are
`noindex`; indexing controls are not access controls.

### Authentication and account data

- Supabase authentication currently supports Google sign-in and email with a
  password.
- Application storage can contain account/profile settings, interview
  lifecycle and timing data, selected questions, transcript text and turn
  timing, generated feedback and scores, bookmarks, practice sets,
  progress insights, and frozen legacy streak or achievement records retained
  for export and account-deletion compatibility.
- The account export is an allowlisted JSON projection of account, settings,
  practice, transcript, feedback, progress, and billing-summary data. It
  excludes credentials, raw provider operations, logs, deletion tombstones,
  and other users.

### Voice, transcript, and model processing

- Live voice audio is transmitted through configured real-time speech and
  voice providers while an interview runs.
- The reviewed application database stores transcript text and audio-duration
  metadata, not replayable audio files.
- Provider processing, data-use, and retention terms require verification
  against deployed configuration and contracts.
- The repository does not establish a separate pipeline that trains provider
  foundation models on interview content. Any future training purpose requires
  explicit approval before it is represented publicly.

### Billing and deletion

- Stripe handles checkout and payment processing. Application storage contains
  subscription and payment summaries, usage, finite-credit ledger records, and
  the provider references needed for billing reconciliation and account
  cleanup. Raw payment-card details are not part of the reviewed application
  database model.
- A successful account-deletion response means the durable deletion request
  exists. The initial background enqueue can fail while the route still returns
  `deletion_retry_scheduled`; scheduled recovery then retries the work.
  Customer-facing wording must therefore say that cleanup runs or retries
  asynchronously, not that every successful response queued a workflow.
- Completed deletion tombstones retain the user identifier, status and attempt
  timestamps, and one-way provider fingerprints until a separate retention
  decision approves removal.

### Analytics, replay, and browser storage

- When configured, PostHog and Statsig browser clients can process an anonymous
  identifier, page and feature events, and signed-in account traits such as the
  account identifier, email domain, signup method, and account creation time.
- The repository includes automatic-capture and session-replay paths.
- Current PostHog behavior tracks until the browser user declines. Statsig
  initialization is separate and does not read that PostHog choice.
- Consent, replay, cookie classification, provider retention, and launch
  behavior remain owned by SAV-180 and accountable review. These implementation
  gaps must not be published as customer-facing policy language.

### Provider and retention review

- Current code integrates provider categories for hosting, authentication and
  database storage, real-time voice rooms, speech recognition,
  language-model processing, voice synthesis, billing, analytics and feature
  flags, and background jobs.
- The exact subprocessor list, provider roles, regions, international-transfer
  terms, and provider retention require verification against deployed
  configuration and contracts.
- The repository defines no approved universal retention period for account,
  transcript, feedback, analytics, billing, log, backup, or completed-tombstone
  data.
- The relaunch gate remains default-off independently of this legal review. Its
  operational state is not public legal-page content.

## Approval and indexing gate

Removing `noindex` or adding either route to the sitemap requires all of:

1. accountable owner and legal approval recorded in a durable issue or decision;
2. a reviewed legal entity, contact, effective date, and policy version;
3. live provider/subprocessor, analytics-consent, retention, and billing checks;
4. updated content-contract fixtures proving the approved policy and product
   behavior still agree.
