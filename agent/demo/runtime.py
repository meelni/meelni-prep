"""Pure runtime contract for the bounded public voice preview."""

import asyncio
from dataclasses import dataclass
import math

MAX_DEMO_DURATION_SECONDS = 120
DEFAULT_DEMO_DURATION_SECONDS = 120
TAKEAWAY_WINDOW_SECONDS = 30
ROOM_CONNECT_TIMEOUT_SECONDS = 10
SESSION_START_TIMEOUT_SECONDS = 15
GREETING_TIMEOUT_SECONDS = 8
TAKEAWAY_TIMEOUT_SECONDS = 20
CONTROL_PUBLISH_TIMEOUT_SECONDS = 2
SESSION_END_PUBLISH_TIMEOUT_SECONDS = 0.2
SESSION_END_DELIVERY_GRACE_SECONDS = 0.25
ROOM_DELETE_TIMEOUT_SECONDS = 2


@dataclass(frozen=True)
class DemoTiming:
    duration_seconds: int
    warning_seconds: int


@dataclass(frozen=True)
class DemoDeadline:
    started_at: float
    warning_at: float
    ends_at: float

    def remaining_seconds(self, now: float) -> int:
        return max(0, math.ceil(self.ends_at - now))

    def session_end_notify_at(self, delivery_grace_seconds: float) -> float:
        return self.ends_at - delivery_grace_seconds


def resolve_demo_timing(metadata: object) -> DemoTiming:
    duration = DEFAULT_DEMO_DURATION_SECONDS
    if isinstance(metadata, dict):
        candidate = metadata.get("duration_seconds")
        if isinstance(candidate, int) and not isinstance(candidate, bool):
            duration = min(MAX_DEMO_DURATION_SECONDS, max(60, candidate))
    return DemoTiming(
        duration_seconds=duration,
        warning_seconds=max(15, duration - TAKEAWAY_WINDOW_SECONDS),
    )


def create_demo_deadline(timing: DemoTiming, started_at: float) -> DemoDeadline:
    return DemoDeadline(
        started_at=started_at,
        warning_at=started_at + timing.warning_seconds,
        ends_at=started_at + timing.duration_seconds,
    )


async def run_bounded(operation, timeout_seconds: float) -> None:
    """Run one async provider operation without allowing an unbounded await."""
    await asyncio.wait_for(operation(), timeout=timeout_seconds)


async def stop_then_run_bounded(stop, operation, timeout_seconds: float) -> None:
    """Stop local spend synchronously before attempting bounded provider cleanup."""
    stop()
    await run_bounded(operation, timeout_seconds)
