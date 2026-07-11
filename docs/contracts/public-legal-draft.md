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

## Approval and indexing gate

Removing `noindex` or adding either route to the sitemap requires all of:

1. accountable owner and legal approval recorded in a durable issue or decision;
2. a reviewed legal entity, contact, effective date, and policy version;
3. live provider/subprocessor, analytics-consent, retention, and billing checks;
4. updated content-contract fixtures proving the approved policy and product
   behavior still agree.
