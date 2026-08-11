# Provider-free feedback golden path

Run:

```bash
npm run test:feedback
```

This deterministic test exercises canonical synthetic fixtures through writer
registration, transcript and marker ingest, frozen evidence, durable dispatch,
the Inngest handler/workflow, a fake evaluator, immutable persistence, and the
API/view model.

It does not read or write a database user, call an evaluation provider, send a
real Inngest event, or touch customer/Production state. The former direct-insert
script has been retired. `scripts/test-feedback-generation.ts` now only
validates and lists the synthetic fixtures for local inspection.
