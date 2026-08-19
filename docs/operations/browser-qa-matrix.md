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

The matrix also verifies the mobile navigation dialog and Explore question-type
listbox in both closed and open states. Closed triggers must not publish a
reference to an unmounted popup. Open triggers must reference the exact mounted
dialog or listbox ID, preserve the expected expanded state, pass the same
WCAG-tagged serious/critical/contrast gate scoped to the exact mounted popup,
close with Escape, and restore focus to the trigger. A synthetic image without
alternative text proves that a critical defect mounted only while the popup is
open blocks the gate. The ordinary closed-state scan remains the broad page
gate and has no accessibility allowlist.

The public tests run the built production Next.js application. Authenticated
compositions use production components with approved synthetic fixture data
through the browser-QA fixture
boundary rather than a shared account or an authentication bypass. The fixture
boundary is unavailable on Vercel and when its explicit local/CI switch is
absent.

## Baseline Evidence

On 2026-07-19, the complete local Chromium baseline passed all 24 checks in
40.5 seconds with one worker and zero retries. The run covered both viewports,
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

The matrix has no CI retries. Local runs use one Chromium worker for predictable
diagnostics; hosted CI uses two workers so isolated project/file groups share
the read-only synthetic servers without serializing independent browser
contexts. `fullyParallel` remains disabled, so tests within a file retain their
reviewed order. Fix nondeterminism at the assertion or fixture boundary; do not
hide it with retries, sleeps, broad console allowlists, global
accessibility-rule suppression, or pixel-diff baselines.

Any serious or critical incomplete result is blocking, as is any
`color-contrast` incomplete result regardless of impact. Screenshots are
evidence and diagnostics, not pixel-perfect blocking baselines.

Every Axe run attaches its incomplete rule IDs, impacts, help text, node
selectors, and failure summaries before enforcing the blocking threshold. Do
not replace that evidence with aggregate counts: incomplete results can signal
that Axe could not finish evaluating a launch-critical element.

SAV-265 removed all 27 observed `color-contrast` incomplete-result allowances
by making production foreground/background composition deterministic.
SAV-278 removed the final three `aria-valid-attr-value` allowances: the mobile
navigation trigger now exposes `aria-controls` only while its dialog is open,
and Radix Select 2.3.4 applies the same mounted-popup contract to the Explore
listbox. The matrix retains raw incomplete evidence and blocks every serious,
critical, or contrast result rather than grandfathering a rule, selector,
surface, browser project, library implementation detail, or pseudo-element
condition.

SAV-280 removed the temporary Vaul drawer overscroll pseudo-element review. The
shared drawer suppresses Vaul's generated `[data-vaul-drawer]::after`
pseudo-element on Meelni drawer content and renders a real `aria-hidden`,
pointer-inert portal sibling for the overscroll area instead. The open mobile
navigation contract proves the pseudo-element is not displayed, the fill uses
the same background as the drawer, starts at the viewport bottom, spans the
drawer width, and remains outside the dialog subtree and interactive content.
The scoped Axe gate then runs with no review bridge: every serious, critical,
or `color-contrast` incomplete result is blocking.

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

## Telemetry And Headless Runtime Noise

Browser QA should fail on unmocked provider traffic, but it should not confuse
same-origin telemetry plumbing with product regressions. Web-vitals reporting
must use Next.js' bundled `next/web-vitals` integration; do not reintroduce the
legacy `unpkg.com/web-vitals` loader or broaden CSP for it. Statsig browser
traffic remains consent-gated and same-origin through `/api/statsig/*`; the
proxy supports only evaluation initialization and SDK exception reporting so
headless runs do not emit CSP-blocked `statsigapi.net/v1/sdk_exception`
console errors after consent.

LiveKit audio capture and disconnect messages can still appear in purely
headless/local checks when the scenario intentionally mounts voice-session
surfaces without a real browser audio device or cloud room. Treat those as
fixture/runtime-environment evidence, not a product pass, and keep the expected
messages documented with the scenario that produces them.

## GitHub Actions Integration

Browser QA runs in the `production` lane that feeds the required aggregate
`Validate` job. It is not a GitHub Actions matrix, and it uses the same
checkout, `npm ci`, and production build as the public-route crawl without
building the application a second time in that lane.

It runs only for ready pull-request validation and explicit workflow dispatch.
It intentionally skips the duplicate post-merge `main` validation. Branch
protection therefore receives the same stable `Validate` context while the
browser work is paid once per candidate PR head.

The workflow:

1. starts the lane as UID 1001 in the digest-pinned official Playwright Noble
   container whose version must match `package-lock.json`;
2. installs the repository's Node.js dependencies without provisioning a
   browser or host system packages;
3. builds the production artifact and crawls the public routes;
4. runs the two viewport projects in one process;
5. uploads evidence on success or failure for seven days.

The container includes the matching Chromium runtime and system dependencies.
The workflow contract rejects tag drift, an unpinned image, a version that
differs from the lockfile, or a host-side Playwright install/cache step.

The expected steady-state cost is approximately one to two additional Actions
minutes on a ready PR. A cold container pull can take longer. The step adds no
browser minutes to the post-merge `main` run. Review actual duration after the
first three successful PR runs and update the pinned image deliberately when
the lockfile's Playwright version changes.

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
