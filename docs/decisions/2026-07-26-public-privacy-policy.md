# Public Privacy Policy Approval

Date: 2026-07-26
Status: accepted

## Context

Meelni's public `/privacy` route was an unindexed engineering holding page that
said the policy was not approved or effective. The optional-analytics banner
linked to that draft, creating an incomplete and confusing consent experience
on the live website.

On July 26, 2026, the human product owner explicitly asked Codex to use its best
judgment to finalize and update the Privacy Policy because no separate legal
reviewer was available. This is accountable owner approval of the working
policy, not a representation that Codex is licensed counsel.

## Decision

- Publish a Privacy Policy effective and last updated July 26, 2026.
- Identify Meelni as the Service operator and `contact@meelni.com` as the
  privacy request contact.
- Describe the implemented account, interview, transcript, feedback, billing,
  technical, communications, and optional-analytics data flows.
- Explain that interview audio is processed live and that the Meelni
  application does not create or store a replayable interview-audio recording.
- Explain necessary cookies separately from optional product analytics.
- Keep optional analytics consent-based, with no effect on product access;
  preserve manual allowlists, pseudonymous identifiers, and disabled
  autocapture/session replay.
- State that Meelni does not sell personal information, share it for
  cross-context behavioral advertising, or use third-party advertising
  networks in the reviewed product.
- Use retention criteria rather than an unsupported universal deadline, and
  describe durable asynchronous account deletion precisely.
- Provide generally applicable regional rights, California disclosures,
  international-transfer language, and an under-13 child-directedness boundary.
- Make `/privacy` canonical and indexable and include it in the sitemap.
- Keep `/terms` unapproved, unindexed, and outside the sitemap.

## Consequences

Meelni must monitor `contact@meelni.com` for privacy requests and maintain the
published practices. Provider, analytics, advertising, model-training,
retention, age, or request-process changes require the policy and durable
contract to be reviewed together.

The policy uses the public operator name because the repository contains no
separately approved incorporated legal name or physical business address. That
identity should be replaced if Meelni later adopts or confirms a different
legal entity.

This decision approves source changes only. Deployment remains a separate
owner-controlled Production action.
