# Proposal: Control-Plane-Only Staging

The owner has one paid LiveKit project. SAV-483 intentionally uses that
Production project only through a separately authorized external operator, but
the current trusted staging build contract still requires the unavailable
Preview LiveKit project. Add an exact staging capability that deploys only the
durable Shadow control plane while every ordinary web LiveKit path remains
disabled.

This does not enable a provider, deploy a worker, create a room, advance the
rollout stage, or grant Production/default-on/launch authority.
