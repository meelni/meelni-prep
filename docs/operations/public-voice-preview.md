# Public Voice Preview Operations

## Runtime Contract

- Duration: 120 seconds; the agent starts its final takeaway at 90 seconds.
- Token TTL: 150 seconds; maximum participants: 2.
- Production budgets: 100/24h global, 20/24h per IP, 3/10m per IP, 2/24h per device.
- Preview/Development global budget: 20/24h.
- Signed browser session: 15 minutes, one dispatch, and at most two connected
  same-room tokens (the initial token plus one acknowledged recovery token).
- Recovery delivery: the browser acknowledges the opaque recovery receipt only
  after LiveKit connects. Unacknowledged claims may be reclaimed after 30
  seconds; stale or mismatched receipts cannot consume the recovery allowance.
- Signed device identity: 30 days.
- Active same-room recovery window: 7 minutes.
- A recovery check waits once for one second before declaring the dispatched
  agent missing, avoiding a false tombstone while the agent is still joining.
- Signed session reservation/tombstone: 15 minutes. Expiry of the shorter
  recovery window does not permit a second dispatch under the same signed
  session.
- Pseudonymous-data cleanup eligibility: 48 hours after expiry/inactivity.

## Required Configuration

Generate a different 32-byte base64url value for each environment with
`openssl rand -base64 32 | tr '+/' '-_' | tr -d '='` and store it only as the
server-side Vercel variable `DEMO_ABUSE_HMAC_SECRET`. Do not reuse a LiveKit,
Supabase, Stripe, or Statsig credential. The endpoint rejects placeholders and
non-32-byte formats. Secret rotation invalidates existing preview cookies and
resets the corresponding anonymous rate-limit continuity.

Production also requires `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` so the
hourly pseudonymous-data cleanup is durable. The Vercel production build runs
deployed-environment validation and fails closed when these values are absent.

## Deployment Order

1. Keep the relaunch feature flag and fallback default-off.
2. Set and verify `DEMO_ABUSE_HMAC_SECRET` in the target non-production environment.
3. Run the database preflight.
4. Apply migrations through `0008_public_demo_limits`.
5. Deploy and verify the matching demo agent runtime first. Its independent
   monotonic hard-stop task must be active before the web endpoint can expose
   the preview.
6. Deploy the web app while the relaunch gate remains disabled.
7. Configure the Vercel WAF/bot controls for the route and record the applied
   rule as launch evidence. Postgres remains the spend authority; the edge rule
   prevents denied bot traffic from serializing through the database.
8. In Preview, use an explicit targeted gate override and verify one normal
   preview, one connected and acknowledged same-session recovery, an aborted
   recovery followed by a retry after 30 seconds, a concurrent replay, a typed
   429, and forced room deletion at the cap.
9. Review `[PublicDemoAudit]` and `public_demo_authorization` events. They may
   contain outcome, reason, limiting scope, and coarse retry bucket only.
10. Verify both PostHog and Statsig session replay are disabled before any
    transcript-bearing preview is exposed.
11. Verify `prune-public-demo-abuse-data` has a successful Inngest run within
    the last two hours and configure an alert when no successful run occurs for
    two consecutive hours.

## Signals And Alerts

Track aggregate starts, denials by scope, limiter unavailability, provider
start failure, cleanup failure, and global utilization. Alert before launch at
50%, 80%, and 100% of the global budget; limiter-unavailable rate above 1%; or
provider-start failure above 5%. Never attach IPs, hashes, cookies, room names,
tokens, participant identity, transcripts, audio, question text, or provider
payloads.

Limiter audit scope `active_device` identifies the single-active-preview fence;
`device` identifies the rolling two-per-day budget.

## Cleanup

`public.prune_public_demo_abuse_data()` removes pseudonymous session rows 48
hours after expiry and limiter rows 48 hours after inactivity. The registered
Inngest function runs hourly at minute 17. Enforcement prunes rolling timestamp
windows itself and does not depend on cleanup succeeding.

## Rollback

Disable the public relaunch gate and keep `MEELNI_REACTIVATION_DEFAULT=false`,
then revert the dependent web/agent release. Leave the additive tables and
functions in place; dropping them is not part of application rollback. If the
limiter is unhealthy, the endpoint must continue to fail closed rather than
falling back to process-local counters.
