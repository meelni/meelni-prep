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

## Production Later

Once you're ready for production:

1. Deploy to Vercel
2. Try syncing again with Inngest Cloud (might work with deployed version)
3. Or contact Inngest support if issue persists
4. Dev server is perfect for local development anyway!
