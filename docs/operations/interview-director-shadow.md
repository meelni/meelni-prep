# Interview Director Shadow Operations

SAV-474 is a repository-only, read-only shadow implementation. The full-
interview entrypoint injects no Director adapter, so there is no operational
provider/model to configure and no runtime work can execute from this change.

## Current state

- Flag: `MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED`
- Accepted enabling token: exact lowercase `true`
- Rejected tokens: whitespace-padded, mixed-case, blank, and every non-exact
  value; observability remains in the `current` cohort for the same inputs
- Default/absent behavior: disabled
- Application adapter: deliberately `None`
- Test adapter: `DeterministicFakeDirectorAdapter`, provider-free only
- Storage: bounded session-local memory; cleared on reconnect generation
  rollover and settlement
- Live influence: none; no influence flag is read by this subsystem

Do not configure this flag in Preview or Production for SAV-474. A flag alone
still resolves `adapter_unavailable`; it is not evidence that a provider,
quality gate, cost gate, or rollout has been approved.

## Verification

Use Node 22.22.0 and provider-free local fixtures:

```bash
python3 -m unittest agent.test_interview_director
fnm exec --using=22.22.0 npm run test:agent
fnm exec --using=22.22.0 npm run test:python-agent
fnm exec --using=22.22.0 npm run test:interviewer-benchmark
fnm exec --using=22.22.0 npm run interviewer:benchmark:verify-baseline
fnm exec --using=22.22.0 npm run verify:agent
```

Expected evidence includes default-off/no-adapter resolution, bounded context
and output, exact speculative/final reconciliation, replay and capacity
rejection, reconnect cleanup, deadline/lifecycle fences, after-delivery
comparison, result/comparison denominator separation, finalized-turn-to-ready
queue/context latency, settlement cancellation, and privacy-safe trace
validation.

Do not run a provider, enable an environment, use customer transcripts, or
interpret synthetic comparison agreement as a quality threshold.

## Failure behavior

Timeout, exception, cancellation, invalid schema, stale authority, expired
result, duplicate/replay, and capacity pressure are ignored. The observer's
return value is not consumed by transcript projection, controller behavior,
speech, watchdog, settlement, answer-block, or feedback code.

Settlement synchronously fences and cancels Director tasks. Shutdown uses the
bounded idle/cancellation path before semantic telemetry closes. Reconnect
rollover cancels old-generation work, clears all session-local correlations,
and requires adapter recovery before new work; the current application has no
adapter and therefore never reaches that path.

## Future rollout gate

An owner must separately approve an isolated Preview shadow rehearsal, select
the server-side adapter/provider/model, impose a spend cap, approve privacy and
retention, and accept numeric freshness/quality/cost gates. SAV-475 owns any
influence experiment. No repository check authorizes Preview, Production,
default-on behavior, or launch.
