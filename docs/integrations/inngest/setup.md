# Local Inngest Dev Server

Use the local Inngest Dev Server for development. It executes local background jobs immediately and exposes the UI locally.

## Normal Agent Startup

```bash
npm run dev:local
```

This starts Next.js and Inngest together. By default, Next.js runs at `http://127.0.0.1:3000` and the Inngest UI runs at `http://127.0.0.1:8288`.

When a worktree uses another web port, pass `CONDUCTOR_PORT` or `PORT`:

```bash
CONDUCTOR_PORT=3001 npm run dev:local
```

The startup script points Inngest at the matching SDK URL, such as `http://127.0.0.1:3001/api/inngest`, and derives a separate Inngest UI port.

Pulled Vercel metadata does not change this behavior: any process outside
`NODE_ENV=production` is forced into Inngest dev mode.

## Manual Debugging

Use this only when isolating Inngest from the rest of the local stack:

```bash
npm run dev:inngest
```

or:

```bash
npx --yes inngest-cli@latest dev --sdk-url http://127.0.0.1:3000/api/inngest
```

## Test It

1. Complete an interview
2. Click "End Interview"
3. Watch the Inngest dev server terminal:
   - Event received: `feedback/generate.requested`
   - Function executing: `feedback-generate`
   - Steps running: validate, fetch transcript, evaluate, save
   - Event sent: `insights/update.requested`
   - Function executing: `insights-update`
   - All steps complete

4. Feedback page should load with results!

## Why This Error Happened

The error "Cannot read properties of undefined (reading 'triggers')" is likely:

- Inngest Cloud UI bug with the way we define triggers
- Or Inngest SDK version mismatch
- Local dev server doesn't have this issue

## Hosted Identity

Hosted deployments fail closed unless their Inngest routing identity matches
their Vercel identity:

- Preview requires `INNGEST_ENV` to exactly equal
  `VERCEL_GIT_COMMIT_REF`, plus both `INNGEST_EVENT_KEY` and
  `INNGEST_SIGNING_KEY`.
- Production requires `VERCEL_GIT_COMMIT_REF=main`, both keys, and no
  branch-only `INNGEST_ENV` override.
- `/api/inngest` registers 14 named source functions. The SDK adds exactly one
  `Generate Interview Feedback (failure)` handler for a 15-entry dashboard
  inventory. The route exports a 300-second Vercel duration. Verify that exact
  inventory and a synthetic run; key presence and the service-health response
  do not prove provider connectivity.
