# Isolate Production Shadow From The Customer Interview Runtime

Status: accepted

Issue: SAV-494

## Context

The Production-project Shadow bootstrap authenticated durable admission before
room connection, but then continued through the ordinary interview entrypoint.
That path registers a transcript writer, reads customer lifecycle authority,
constructs controller/tools and can persist transcript, feedback and credit
effects. The live check stopped before lease allocation or provider work.

The LiveKit Cloud worker also calls a Deployment-Protected staging endpoint for
admission and terminal reconciliation. Owner browser authentication and Vercel
CLI authentication do not authenticate that worker request.

## Decision

An exact Shadow job is a separate runtime mode, not an option inside the
ordinary customer interview. The interview entrypoint validates the private job
bootstrap, delegates to a dedicated synthetic runner and returns before room
connection or any ordinary metadata, writer, lifecycle, controller, tool,
feedback or credit behavior.

The synthetic runner accepts only a closed room contract bound to the admitted
lease. It may create the fixed owner-only LiveKit voice pipeline and publish
ephemeral transcript events to that private room so the canary UI works. Those
events are not canonical evidence: they are never sent to transcript ingest,
stored, hydrated, evaluated, logged, analyzed or used for customer state.

Director receives finalized turns only through a synthetic observation method
and a process-local state simulator. The simulator exists solely to build the
bounded read-only Director context; it is not the customer controller and has
no delivery, tool or influence consumer.

The worker receives a temporary Vercel Automation Bypass secret in the exact
Shadow secret snapshot. The HTTPS client sends it only as
`x-vercel-protection-bypass` for the canonical staging endpoint. Signed owner
activation, durable lease validation and worker evidence capability remain the
application authentication. The bypass grants no control-plane action by
itself. It is removed by the ordinary eight-key secret overwrite and revoked
after the one-cell operation.

The Shadow snapshot disables Opik tracing and content capture for the entire
temporary shared-worker window. This avoids persisting synthetic owner speech;
ordinary customer sessions are not intentionally admitted during the bounded
operator window.

## Consequences

- Invalid or unavailable Shadow inputs fail before audio/provider construction.
- Ordinary Production metadata takes the unchanged customer path with literal
  Director `adapter=None` unless separately enabled by its existing contracts.
- The staging endpoint remains Deployment-Protected.
- Voice transport spend is bounded operationally by one admitted room and its
  hard lease expiry; the durable Shadow ledger continues to account Director
  adapter attempts, not LiveKit inference billing.
- Merge does not authorize a deploy, room, provider call, influence, default-on
  or launch decision. Fresh owner actions remain required.
