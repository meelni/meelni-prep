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

The matrix has no CI retries and uses one Chromium worker. Fix nondeterminism at
the assertion or fixture boundary; do not hide it with retries, sleeps, broad
console allowlists, global accessibility-rule suppression, or pixel-diff
baselines.

Any serious or critical incomplete result is blocking, as is any
`color-contrast` incomplete result regardless of impact. The only temporary
review bridge is the exact Vaul drawer overscroll pseudo-element described
below. Screenshots are evidence and diagnostics, not pixel-perfect blocking
baselines. The Vaul review uses target-clipped screenshots only for the bounded
rendered-color/occlusion contract described below.

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
surface, or browser project, except for the exact evidence-reviewed Vaul
condition below.

The repository pins Vaul 1.1.2 exactly and exposes that runtime identity on the
mounted drawer. Vaul renders the mobile drawer's overscroll fill with an empty, opaque
`[data-vaul-drawer]::after` pseudo-element. Axe cannot determine descendant
contrast whenever that pseudo-element exists, even when an explicit opaque
background is applied. The open-drawer gate may review only the single
`color-contrast` incomplete at index zero in Chromium's mobile project on the
landing or pricing surface. Its eight nodes must appear in the approved order,
resolve one-to-one to stable drawer review markers, carry Axe's exact
`pseudoContent` diagnostic, and point to the exact mounted Vaul dialog. The
package, browser context, surface, finding count/index, runtime version, and
node set are all part of the classifier identity.

The classifier then fails closed unless the pseudo-element is still empty,
absolute, opaque, image-free, and the same computed background as the drawer.
It requires Vaul's exact non-custom bottom-drawer overscroll geometry: the
pseudo-element starts at the drawer content-box bottom, extends two drawer
heights below it, and spans the exact drawer width. It also captures and checks
the complete relevant paint/compositing contract for the pseudo-element and
every target-to-drawer ancestor: animations and transitions, stacking and
transforms, outlines, shadows, backgrounds, filters and backdrop filters,
opacity, blend and isolation, clipping, containment, masks, overflow,
visibility, text fill/stroke/shadow, and zoom. That includes the exact finished
Vaul drawer animation identity. Each approved node has an exact ancestor count
and exact per-layer computed `position`/`z-index`/`display`/inset sequence
through the fixed `z-index: 50` drawer. It binds border paint, border-box
client/offset arithmetic, finite rectangles, child-within-parent containment,
non-overlapping approved targets, and nine owned interior hit-test samples per
target. The contract also binds backface visibility, container
type, float/order, perspective, pointer events, individual rotate/scale/
translate properties, and transform style, so alternate stacking contexts or
paint order cannot retain the review. An opaque child background does not
truncate the ancestry proof. An independent layer-composition calculation must recover
each rendered opaque background, and the rendered text fill/stroke contract
must match the foreground used for the required WCAG ratio. The raw Axe
finding, exact geometry, every accepted layer contract, hit topology, and each
computed ratio remain attached as evidence. A target-clipped PNG is decoded to
raw pixels and every pixel must remain within the bounded foreground,
background, and border-color blend palette derived from that accepted target
chain. Each reviewed node must remain inside its own narrow foreground and
background occupancy bands; there is no generic minimum that a mostly covered
target can satisfy. This catches opaque or translucent paint-only sibling and
pseudo-element occlusion even when `pointer-events: none` leaves DOM hit
ownership unchanged; it is not a stored cross-platform screenshot baseline.
Any other context, version, rule, diagnostic, related target, node identity,
style, geometry, stacking behavior, or insufficient ratio is blocking.

The 494 deterministic classifier tests mutate every accepted boundary and
require the review to fail closed, including context and version identity,
finding and node shape, diagnostic, related target, content, paint and
compositing fields, direction, custom-container mode, geometry, background,
contrast ratio, rendered-pixel coverage, non-finite time, and expiration.
Position, z-index, combined stacking, insets, display, painted borders,
box-model arithmetic, geometry, and hit topology are mutated for every target
and ancestor layer in every approved node path. Eight landing-drawer browser
sentinels independently move the Vaul pseudo-element over the content, add a
600px painted outline, replace rendered text fill with insufficient contrast,
position the description at `z-index: -1`, move the title link to
`top: 307px; left: 80px` so it intercepts the activation CTA, paint a 300px red
description border outside the drawer, and paint an opaque fixed 356x44 red
drawer-handle `::before` over the CTA at `z-index: 100` with
`pointer-events: none`, and overlay the left 200x44 portion of that CTA with its
own primary background color. The final same-palette sentinel preserves all
nine hit samples while covering more than half of the CTA and erasing most of
its label. The relevant sentinel first proves the real hit target, geometry, or
non-hit-testable visual coverage changed, then requires the real open-popup
gate to reject the identical Axe incomplete shape before the exact Vaul style
is restored and the clean scan runs.

This narrow bridge is owned by `SAV-278`, expires after 2026-08-15, and is
tracked for removal in `SAV-280`. It does not apply to the closed global scan,
the Explore listbox, any non-contrast result, or any different pseudo-element
condition.

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
