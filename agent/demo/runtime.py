"""Pure runtime contract for the bounded public voice preview."""

import asyncio
from dataclasses import dataclass
from datetime import datetime
import json
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
LOCAL_SESSION_CLOSE_TIMEOUT_SECONDS = 0.5


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


def parse_demo_room_metadata(room_metadata: object) -> dict:
    """Parse server-authored metadata after the LiveKit room is connected."""
    if not isinstance(room_metadata, str) or not room_metadata:
        return {}
    try:
        metadata = json.loads(room_metadata)
    except (json.JSONDecodeError, TypeError):
        return {}
    return metadata if isinstance(metadata, dict) else {}


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


def resolve_demo_deadline(
    metadata: object,
    *,
    wall_now: float,
    monotonic_now: float,
) -> DemoDeadline:
    """Map a server-authored absolute deadline onto the local monotonic clock."""
    timing = resolve_demo_timing(metadata)
    if not isinstance(metadata, dict):
        return create_demo_deadline(timing, monotonic_now - timing.duration_seconds)

    candidate = metadata.get("deadline_at")
    if not isinstance(candidate, str):
        return create_demo_deadline(timing, monotonic_now - timing.duration_seconds)

    try:
        deadline_at = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
        if deadline_at.tzinfo is None:
            raise ValueError("deadline must include a timezone")
        remaining = min(
            float(timing.duration_seconds),
            max(0.0, deadline_at.timestamp() - wall_now),
        )
    except (OverflowError, TypeError, ValueError):
        remaining = 0.0

    elapsed = timing.duration_seconds - remaining
    started_at = monotonic_now - elapsed
    return DemoDeadline(
        started_at=started_at,
        warning_at=started_at + timing.warning_seconds,
        ends_at=monotonic_now + remaining,
    )


def resolve_demo_participant_identity(metadata: object) -> str | None:
    if not isinstance(metadata, dict):
        return None
    candidate = metadata.get("participant_identity")
    if not isinstance(candidate, str):
        return None
    candidate = candidate.strip()
    return candidate if 1 <= len(candidate) <= 128 else None


async def run_bounded(operation, timeout_seconds: float) -> None:
    """Run one async provider operation without allowing an unbounded await."""
    await asyncio.wait_for(operation(), timeout=timeout_seconds)


async def run_optional(operation) -> bool:
    """Run a nonessential operation without letting its failure end the preview."""
    try:
        await operation()
        return True
    except Exception:
        return False


async def stop_then_run_bounded(stop, operation, timeout_seconds: float) -> None:
    """Await local model/audio closure before bounded provider cleanup."""
    await stop()
    await run_bounded(operation, timeout_seconds)
