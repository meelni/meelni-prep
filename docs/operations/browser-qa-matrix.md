# Browser QA Matrix

The SAV-213 browser matrix is the repeatable responsive and accessibility gate
for Meelni's launch-critical product surfaces. It uses only synthetic fixtures
and a local application process. It must not read customer transcripts,
recordings, Preview data, Production data, or provider credentials.

The matrix provides launch-readiness evidence. It does not enable the relaunch
feature gate and does not make the product owner's launch GO/NO-GO decision.

## Coverage

The representative matrix covers the landing page, Explore, pricing,
authentication, dashboard overview, New Mock Interview, interview room,
feedback, and settings at these fixed viewports:

- Mobile: `390 x 844`.
- Desktop: `1440 x 1000`.

The public tests run the built production Next.js application. Authenticated
compositions use production components with approved synthetic fixture data
through the browser-QA fixture
boundary rather than a shared account or an authentication bypass. The fixture
boundary is unavailable on Vercel and when its explicit local/CI switch is
absent.

## Baseline Evidence

On 2026-07-18, the complete local Chromium baseline passed all 24 checks in
42.8 seconds with one worker and zero retries. The run covered both viewports,
all nine representative surfaces, and the landing, Explore, and interview
dialog-focus contracts. It used no provider credentials, customer data,
Preview data, or Production data.

The baseline exposed and verified repairs for mobile primary-action sizing,
dashboard/setup/interview/feedback/settings contrast, reduced-motion entrance
states, public-page animation timing, and the blocked external Web Vitals
loader. Generated HTML, JSON, screenshots, and traces remain gitignored and
are uploaded only as short-retention CI artifacts.

## Blocking Contract

The browser job fails for any of these launch-critical regressions:

- horizontal document or body overflow beyond the documented tolerance;
- a missing, hidden, disabled, unreachable, or horizontally clipped primary
  action; reachability is proven through the real keyboard tab order rather
  than direct focus;
- an automated accessibility violation or incomplete result with `serious` or
  `critical` impact, plus any `color-contrast` violation or incomplete result;
- a launch-critical dialog without an accessible name;
- incomplete forward or reverse modal focus cycling, focus escaping a modal,
  Escape failing to close it, or focus failing to return to the opener;
- a final URL whose exact origin, path, query, or fragment differs from the
  expected surface location;
- an unexpected page exception, console error, redirect, provider request, or
  unmocked API request.

The matrix has no CI retries and uses one Chromium worker. Fix nondeterminism at
the assertion or fixture boundary; do not hide it with retries, sleeps, broad
console allowlists, global accessibility-rule suppression, or pixel-diff
baselines.

An intentional accessibility exception must identify the exact rule and
selector, explain why it is safe, name an owner, and include an expiration or
follow-up issue. Screenshots are evidence and diagnostics, not pixel-perfect
blocking snapshots.

Every Axe run attaches its incomplete rule IDs, impacts, help text, node
selectors, and failure summaries before enforcing the blocking threshold. Do
not replace that evidence with aggregate counts: incomplete results can signal
that Axe could not finish evaluating a launch-critical element.

The only current incomplete-result exceptions are exact selectors scoped to
closed Radix triggers, inactive items clipped by the horizontally scrollable
mobile workspace navigation, landing-page gradients and decorative overlaps,
the New Mock Interview selected-card and translucent-disclosure compositions,
and the feedback gradient score card. Axe cannot resolve the unmounted popup
target, clipped element background, or composited background in those states.
The owner must remove or revalidate these selector-level exceptions through
follow-up issue `SAV-265` by 2026-08-15. The test enforces that expiration;
after the date, the selectors return to blocking status automatically. A new
project, selector, rule, or surface is not covered and fails the matrix.

## Local Operation

Use the repository-pinned Node runtime. Build the application before running
the browser matrix:

```bash
npm ci --no-audit --no-fund
npm run build:browser:qa
npm run test:browser:install
npm run test:browser:qa
```

`test:browser:install` installs only the Chromium runtime required by the
matrix. `build:browser:qa` produces the normal production artifact inside a
disposable `.context/browser-qa-workspace` mirror. The mirror copies the
current Git working tree while excluding every loadable `.env*` file, links
only the local dependency installation, and launches the build with an
explicit non-secret environment allowlist. `test:browser:qa` refuses a stale
source fingerprint and runs Playwright from the same sanitized mirror, so
Playwright's implicit child-environment merge cannot inherit provider
credentials. It copies only browser QA artifacts back to the repository root.
The sandbox uses a process-local synthetic launched deployment context, the
local relaunch fallback, and inert public fixture values; it does not mutate
the Statsig gate or any Vercel environment.
Because the local QA server uses plain HTTP, that artifact alone omits the CSP
`upgrade-insecure-requests` directive; normal Preview and Production builds
retain it. This prevents same-origin Next.js prefetches from being rewritten to
HTTPS against the local HTTP server.
The production build remains an independent prerequisite. The
Playwright configuration starts isolated local production Next.js and
fixture-harness servers on strict, non-reusable ports. Both child processes use
an allowlisted environment with no inherited provider credentials, and a Node
preload terminates the server if it attempts non-loopback egress. Operators
must not add the browser-QA runtime switch to Vercel environments.

Successful and failed runs write diagnostics beneath:

- `playwright-report/`
- `test-results/browser-qa/`

These directories are gitignored and must never contain secrets or real user
data.

## GitHub Actions Integration

Browser QA is a step inside the existing required `Validate` job. It is not a
GitHub Actions matrix or a separate job, so it reuses the existing checkout,
`npm ci`, and PostgreSQL service, and it runs after the existing production
build without building the application a second time in the workflow.

It runs only for ready pull-request validation and explicit workflow dispatch.
It intentionally skips the duplicate post-merge `main` validation. Branch
protection therefore receives the same stable `Validate` context while the
browser work is paid once per candidate PR head.

The workflow:

1. reads the exact Playwright version from `package-lock.json`;
2. restores only the Chromium cache matching that exact version, OS, and
   architecture;
3. installs Chromium system dependencies and any missing pinned browser;
4. runs the two viewport projects in one process;
5. uploads evidence on success or failure for seven days.

There is deliberately no fallback browser-cache prefix. A Chromium revision
from a different Playwright version must never be restored.

The expected steady-state cost is approximately one to two additional Actions
minutes on a ready PR. A first cache miss can take approximately two to three
minutes. The step adds no browser minutes to the post-merge `main` run. Review
actual duration and cache effectiveness after the first three successful PR
runs; remove the browser cache if restore/save time is consistently no better
than a fresh pinned download.

## Evidence Triage

The Actions artifact is named with the pull-request or run identifier and the
run attempt. Start with the line reporter, then inspect the machine-readable
results, screenshots, and retained failure traces in the artifact.

Classify failures as:

- product regression: fix before merge;
- fixture or assertion defect: fix the deterministic boundary before merge;
- intentional exception: document narrowly under the blocking contract;
- infrastructure outage: rerun only after evidence shows the external outage
  rather than a product or fixture failure.

Do not use a rerun to turn an unexplained failure green. Record recurring CI
duration or cache-capacity problems in the CI cost-control workstream instead
of weakening this product gate.
