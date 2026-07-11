# SAV-236 — Escape provider text in JSON-LD

## Intent

Prevent provider-sourced public content from terminating a JSON-LD script and executing stored script content.

## Slice

Public question-bank and content SEO rendering.

## Scope

- Centralize JSON-LD serialization.
- Escape script-sensitive characters while preserving valid JSON values.
- Route Explore, company, and blog JSON-LD through the shared component.
- Cover an adversarial stored-question payload.

## Validation

- `npm run test:content`
- `npm run typecheck`
- `npm run typecheck:tests`
- `npm run check:ci`
- `npm run build`
- Verify no raw `JSON.stringify` remains in JSON-LD script rendering.

## Rollout

Merge independently of SAV-207. No feature-flag or provider configuration change is required.
