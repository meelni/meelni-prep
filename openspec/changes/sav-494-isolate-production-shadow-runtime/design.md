# Design

`agent/interview/agent.py` remains the dispatch entrypoint but becomes a strict
router. Exact Shadow job metadata is validated first and delegated to a new
`preview_shadow_voice_session` module. That module owns its closed room parser,
fixed voice construction, in-memory synthetic state, ephemeral owner projection
and coalesced durable settlement. The ordinary interview body is unreachable
from that branch.

The Director session gains a distinct synthetic-final observation method so no
code or evidence claims the turn was canonically persisted. A private state
simulator uses controller state contracts only as a validation vocabulary; it
does not expose a controller adapter, tools, delivery or influence.

The control-plane HTTP seam accepts one redacted Vercel bypass value and sends
it on admission and reconciliation. Operator tooling reads that value only from
an external mode-0600 file and builds the exact Shadow secret overwrite. Opik
is disabled in that overwrite. Ordinary rollback remains the existing exact
eight-key runtime.
