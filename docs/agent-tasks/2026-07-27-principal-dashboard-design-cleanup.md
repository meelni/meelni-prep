# Principal dashboard design cleanup

Status: Implementation and local verification complete on
`codex/dashboard-follow-up-cleanup`; publication pending.

## Goal

Resolve every validated issue from the principal-design audit across Overview,
Question Bank, History, Analytics, Settings, interview setup, the live interview
room, and feedback. The finished experience should have a clear hierarchy,
truthful states, deliberate responsive behavior, and no avoidable overflow,
contrast, or interaction ambiguity.

## Linear tracking

- Requested destination: Linear.
- Connector status: The installed Linear connector was not callable in this
  workspace when implementation began.
- Local source of truth: This task record and
  `.context/audits/principal-dashboard-ui-audit-2026-07-26/audit.md`.
- Reconciliation: Create or attach the Linear work item when the connector is
  available; do not invent an issue identifier.

## Scope

- Simplify dashboard navigation, headings, dividers, spacing, and semantic
  action colors across dark and light themes.
- Make unavailable, failed, skipped, and unscored interview states explicit
  without overflowing history rows.
- Make Question Bank search primary, keep filters stable, derive every count
  from the authoritative result set, expose all company facets, and confine
  scrolling to the results pane on desktop.
- Qualify analytics samples and pattern claims so a single interview is never
  presented as a longitudinal trend.
- Add category-specific Settings dirty states, visible labels, coherent
  notification hierarchy, and robust long-value wrapping.
- Put the recommended interview setup and start action first; describe
  experience level as seniority calibration.
- Replace color-only live-room state with words and make end-session feedback
  eligibility language explicit.
- Put feedback score and evidence before practice, reduce nested card density,
  and preserve distinct complete, partial, unavailable, and failed states.

## Acceptance contract

- No page-level horizontal scrolling at 390, 768, or 1280 CSS pixels.
- Mobile dashboard navigation occupies one compact row and exposes every
  destination in an accessible drawer.
- The first viewport of interview setup contains both the recommended
  configuration and the real start action.
- Question Bank facet counts, result counts, and visible rows agree after
  search, round, company, and saved-only changes.
- History status remains visible on compact rows; missing feedback never falls
  back to a dash or layout-breaking raw status.
- Analytics exposes the aggregation window and sample size for every score.
- Settings save actions are disabled until their category differs from the
  last saved state.
- Primary controls meet readable foreground/background contrast in both themes.
- Destructive dialogs use matching visual semantics and focus the reversible
  action first.
- Live interview microphone, connection, agent, and end states are legible
  without relying on color.
- Feedback follows score → evidence → improvement → practice → transcript.

## Validation

- `npm run typecheck` and `npm run typecheck:tests`.
- `npm run lint`, `npm run test:auth-ui`, `npm run test:ui`,
  `npm run test:workflows`, and `npm run test:api`.
- Targeted contract, history, insight, interview-room, and end-session tests.
- Design-system guardrails: 67 passing checks.
- Browser suites for Question Bank behavior, dashboard quality, and the
  representative setup/end-session matrix at mobile and desktop widths.
- In-app browser review at 390, 768, and 1280 CSS pixels, including Question
  Bank filters and counts, Settings dirty states, setup hierarchy, live-room
  controls, and feedback states. No page-level horizontal overflow or console
  errors remained.
- Provider-neutral repository verification under the pinned Node 22.22 and
  Python 3.13 toolchain: formatting, Biome, Knip, boundaries, Semgrep,
  skill/package/fixture/core/agent/integration/local/Python test suites,
  quality tests, and the production build all passed.
- `npm run verify:agent` itself stops in the environment doctor before running
  those checks because this checkout lacks provider secrets and the default
  shell resolves Node 22.16 instead of the pinned Node 22.22. No provider-backed
  verification was claimed.
- Ready pull request with required checks green, followed by merge.

## Result

- Dashboard-wide hierarchy, responsive navigation, spacing, status language,
  containment, and semantic action styling are consistent.
- Question Bank counts now derive from one authoritative filter pipeline and
  its desktop filter rail remains fixed while results scroll.
- Analytics claims carry explicit windows and sample sizes; Settings,
  interview setup, the live room, and feedback expose clearer state and action
  hierarchy without changing persistence or scoring policy.

## Rollout

- Risk: Medium because the work spans several authenticated surfaces, but data
  contracts, persistence, scoring policy, billing, and deletion behavior remain
  unchanged.
- Watch existing dashboard-view, interview-start, settings-save, consent,
  interview-end, and feedback events for unexpected movement.
