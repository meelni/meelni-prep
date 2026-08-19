# SAV-467: Versioned interviewer benchmark

## Why

Adaptive-interviewer changes need reproducible evidence that they improve
interviewer behavior without introducing coaching, evaluation, latency, or cost
regressions.

## What changes

- Add strict v1 scenario, judge-output, and provider-adapter contracts.
- Add a fully synthetic four-round/adversarial catalog and invariant controls.
- Add a provider-free fixed-seed baseline runner, checked evidence, thresholds,
  and scenario/turn-grounded failures.
- Keep eight agent-authored calibration examples pending product-owner review.

## Boundaries

No live prompt/runtime behavior, candidate scorecard, customer data, provider
credential, network call, Production action, or launch decision changes.
