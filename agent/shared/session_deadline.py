"""Provider-neutral duration policy and hard-deadline watchdog helpers."""

import asyncio
import re
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable


INTERVIEW_DURATION_MINUTES = (15, 30, 45)
DEFAULT_INTERVIEW_DURATION_MINUTES = 30
_CANONICAL_UTC_ISO_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"
)

AsyncAction = Callable[[], Awaitable[None]]
Clock = Callable[[], datetime]
Sleep = Callable[[float], Awaitable[None]]


def normalize_duration_minutes(value: Any) -> int:
    """Return one supported duration without accepting bools or numeric coercion."""
    if isinstance(value, bool) or value not in INTERVIEW_DURATION_MINUTES:
        return DEFAULT_INTERVIEW_DURATION_MINUTES
    return int(value)


def parse_deadline_at(value: Any) -> datetime | None:
    """Parse the canonical UTC metadata representation; reject alternate forms."""
    if value is None:
        return None
    if not isinstance(value, str) or not _CANONICAL_UTC_ISO_PATTERN.fullmatch(value):
        raise ValueError("Invalid interview deadline")

    try:
        parsed = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ").replace(
            tzinfo=timezone.utc
        )
    except ValueError as error:
        raise ValueError("Invalid interview deadline") from error

    if serialize_deadline_at(parsed) != value:
        raise ValueError("Invalid interview deadline")
    return parsed


def serialize_deadline_at(value: datetime) -> str:
    """Serialize an aware deadline as the shared millisecond UTC ISO shape."""
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ValueError("Interview deadline must be timezone-aware")
    utc_value = value.astimezone(timezone.utc)
    return utc_value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def normalize_deadline_at(value: Any) -> str | None:
    """Normalize metadata to its canonical wire representation."""
    parsed = parse_deadline_at(value)
    return serialize_deadline_at(parsed) if parsed is not None else None


class DeadlineEnforcer:
    """Share one immediate-close operation across duplicate watchdog tasks."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._enforcement_task: asyncio.Task[None] | None = None

    @property
    def enforcement_started(self) -> bool:
        return self._enforcement_task is not None

    async def enforce_once(
        self,
        *,
        close_session: AsyncAction,
        terminate_room: AsyncAction,
    ) -> bool:
        created = False
        async with self._lock:
            if self._enforcement_task is None:
                self._enforcement_task = asyncio.create_task(
                    _close_session_and_terminate_room(
                        close_session=close_session,
                        terminate_room=terminate_room,
                    )
                )
                created = True
            enforcement_task = self._enforcement_task

        await asyncio.shield(enforcement_task)
        return created


async def watch_session_deadline(
    *,
    deadline_at: datetime,
    close_session: AsyncAction,
    terminate_room: AsyncAction,
    enforcer: DeadlineEnforcer,
    now: Clock = lambda: datetime.now(timezone.utc),
    sleep: Sleep = asyncio.sleep,
) -> bool:
    """Wait until the absolute deadline, then close I/O without draining speech."""
    deadline = _as_utc(deadline_at, "deadline_at")
    current = _as_utc(now(), "now")
    delay_seconds = max(0.0, (deadline - current).total_seconds())
    if delay_seconds > 0:
        await sleep(delay_seconds)

    return await enforcer.enforce_once(
        close_session=close_session,
        terminate_room=terminate_room,
    )


def cancel_deadline_watchdog(
    task: asyncio.Task[bool] | None,
    enforcer: DeadlineEnforcer,
) -> bool:
    """Cancel a normal pending watchdog without interrupting active enforcement."""
    if task is None or task.done() or enforcer.enforcement_started:
        return False
    task.cancel()
    return True


async def _close_session_and_terminate_room(
    *,
    close_session: AsyncAction,
    terminate_room: AsyncAction,
) -> None:
    close_error: Exception | None = None
    try:
        await close_session()
    except Exception as error:
        close_error = error

    try:
        await terminate_room()
    except Exception as termination_error:
        if close_error is not None:
            raise close_error from termination_error
        raise

    if close_error is not None:
        raise close_error


def _as_utc(value: datetime, name: str) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ValueError(f"{name} must be a timezone-aware datetime")
    return value.astimezone(timezone.utc)
