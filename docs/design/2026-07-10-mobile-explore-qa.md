# Mobile Explore Launch QA

Status: verified implementation evidence for SAV-210, re-audited after current-main convergence

## Scope

This pass tightens the existing public Explore experience for launch without
redesigning its information architecture. It covers the question list, sticky
search and type filter, pagination, and the signed-out practice handoff.

The relaunch feature flag remains off by default. This change does not alter
provider configuration, production data, or deployment settings.

## Test data

Browser verification used an isolated local browser session and a local
`window.fetch` fixture for `/api/questions`. No Preview or Production data was
read or mutated. The fixture returned 41 total questions across three pages and
included:

- a company name without natural breakpoints;
- a long Product Sense question that wraps across many lines;
- realistic Execution and Behavioral questions;
- dates and canonical four-round question types.

The post-convergence re-audit used a disposable loopback PostgreSQL database
with three local question rows and analytics keys disabled. It reproduced the
same long-content and round-type cases without reading Preview or Production.
The disposable database was dropped after verification.

## Viewport evidence

| Width | Document client/scroll width | Search | Type filter | Practice affordance |
| ----- | ---------------------------- | ------ | ----------- | ------------------- |
| 320   | 320 / 320                    | 44 px  | 44 px       | Visible             |
| 375   | 370 / 370                    | 44 px  | 44 px       | Visible             |
| 390   | 385 / 385                    | 44 px  | 44 px       | Visible             |
| 430   | 425 / 425                    | 44 px  | 44 px       | Visible             |
| 768   | 763 / 763                    | 44 px  | 44 px       | Visible             |
| 1440  | 1435 / 1435                  | 44 px  | 44 px       | Visible             |

The five-pixel difference at several widths is the browser scrollbar. At every
viewport, document scroll width equaled client width.

## Interaction evidence

- Search retained focus and its value through the debounced loading cycle.
- The type-filter trigger and each option were at least 44 px high. Escape
  returned focus from the listbox to the trigger.
- Each question row exposed one semantic button with a persistent “Practice
  question” label; no hover state was required.
- The 320 px dialog measured 288 by 500 px and stayed within the viewport. Its
  Google and email actions measured 48 px high; sign-up and close actions
  measured 44 px high.
- The shared dialog trapped focus, closed with Escape, and returned focus to the
  exact question button that opened it.
- The selected-question continuation still uses
  `/dashboard/new-interview?questionId=<id>` through the canonical route helper.

## Content and schema evidence

- Loading keeps the complete Explore shell and uses structural row skeletons.
- Fetch failures have an explicit retry path and never present an empty result
  as success.
- JSON-LD is emitted only after a successful validated response. A verified
  empty collection emits truthful zero-item schema; an outage emits no schema.
- Unverified `askedAt` freshness remains absent from the visible question rows.
- Search analytics record bounded length/result metadata, never the free-form
  query text.
- Structured data contains ItemList, BreadcrumbList, WebPage, CollectionPage,
  and a minimal Dataset grounded in visible question text and the API total.
  It does not invent FAQ answers, freshness dates, authorship, coverage,
  downloadable files, or missing images.

## Automated coverage

- The list-item rendering test protects the single-control shape, visible CTA,
  long-text wrapping, and mobile width constraints.
- Design-system guardrails protect shared primitives, dialog bounds and focus
  return, 44 px search/filter targets, responsive list states, the successful
  data gate, and the absence of unsupported structured-data claims.
