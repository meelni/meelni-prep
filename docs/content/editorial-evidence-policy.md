# Public Content Evidence Policy

Status: accepted for relaunch
Owner: Product
Review cadence: before launch and at least every 90 days for sourced volatile claims

## Principle

Meelni should publish durable preparation guidance by default. A claim that can change with a hiring cycle must either show trustworthy evidence and an as-of date or stay out of the public product.

## Claim classes

| Claim                                                              | Public requirement                                                                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product capability, price, or credit allowance                     | Derive from the product contract or billing catalog and verify in the shipped flow.                                                                                    |
| Public question count                                              | Derive from the active public-question API response. Never hardcode a corpus total in copy or metadata.                                                                |
| Question provenance                                                | Use “practice question” or “tagged to” unless stored provenance supports a narrower claim. Do not say a prompt was actually asked merely because it has a company tag. |
| Interview stages, round count, duration, difficulty, hiring rubric | Cite a current first-party company source and show an as-of date, or omit the claim. Recruiter confirmation remains authoritative for a candidate's role.              |
| Compensation, level mapping, negotiation policy, benefits          | Cite a current first-party job posting or company policy with location and as-of date. Aggregator estimates are not sufficient for canonical guides. Otherwise omit.   |
| Market, frequency, pass-rate, or outcome claim                     | Cite a named source and methodology with an as-of date. Otherwise state the observable product behavior only.                                                          |

## Editorial template

Every volatile claim must record:

- claim text;
- source title and canonical URL;
- source owner and whether it is first-party;
- applicable role, level, and location;
- reviewed-on date and review-by date;
- editor;
- disposition when the source disappears or conflicts: remove, qualify, or replace.

Sources should support the exact claim. A general careers page does not support a precise number of rounds or a compensation figure.

## Product presentation

- Company pages lead with illustrative questions organized by round type.
- Company tags organize practice content; they are not proof that a prompt appears in the current hiring loop.
- Interview formats are explicitly described as variable by role, level, location, and hiring cycle.
- Feedback is described as available after a completed interview, not as real-time unless the active flow proves otherwise.
- Unreviewed company-specific articles remain unpublished until they satisfy this policy.

## Enforcement

The content-credibility contract rejects hardcoded legacy corpus totals, invented schema properties, unsupported published-article claim classes, and company-page use of quarantined salary, process-duration, round-count, or difficulty fields. Behavior tests operate on emitted schema and the exported published collection; source guards protect the route/component boundary. Preview review must still verify visible copy and schema after stacked SEO branches converge.
