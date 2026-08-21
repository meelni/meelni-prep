# SAV-485: Control-Plane Activation Environment

## Intent

- User outcome: continue the one-cell Production-project Shadow rehearsal
  without buying or fabricating a separate Preview LiveKit project.
- Operator outcome: activate the durable staging run using only staging
  database identity while preserving strict LiveKit identity checks at every
  room-construction boundary.
- Trigger: the fresh SAV-482 owner artifact verified, but the provider-free
  activation command still called the combined Preview database-and-LiveKit
  environment parser.

## Tracking and scope

- Project: Meelni. Issue: SAV-485. Parent: SAV-482. Related: SAV-483/SAV-484.
- In scope: split activation and durable-stop control-plane parsing from
  Preview room parsing; add fail-closed behavior tests and durable
  contract/runbook truth.
- Out of scope: provider calls, worker deploys, room creation, customer data,
  influence, Production rollout, default-on, launch or GO/NO-GO.

## Technical plan

- `activate` and durable stop read an owner-only external environment and
  validate only the canonical Preview Supabase identity plus exact Vercel
  Preview/staging markers before opening the database connection.
- Preview room start keeps the existing canonical Preview LiveKit URL, public
  URL, agent name, key and secret requirements.
- Production-project room start keeps its separate Production LiveKit parser
  and independent deploy/room authorizations.
- No parser searches ambient environment or supplies fallback credentials.

## Validation

- Exact Node 22 focused operator parser/CLI: 6/6 green; test TypeScript
  compilation green.
- Operations: 88 TypeScript plus 47 Node contract tests green.
- `npm run check`: formatting/lint/app+test typechecks, 1,300-module/4,165-
  dependency boundary graph, Semgrep 0 findings over 1,384 targets, and 21
  quality tests green.
- `npm run verify:agent`: terminal green, including 334 Python tests with five
  expected optional-SDK skips, production build, 30 public pages over 984
  source files, and 90 public routes.
- Exact-range security diff scan, ready PR and terminal hosted CI remain
  pending at the local freeze boundary.
- After merge, redeploy the exact staging control plane and generate a fresh
  short-lived owner packet; never consume the superseded packet.
