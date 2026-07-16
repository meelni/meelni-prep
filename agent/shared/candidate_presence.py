"""Candidate-presence gating for the interview runtime greeting."""

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any


WaitForParticipant = Callable[..., Awaitable[Any]]


async def wait_for_candidate_before_greeting(
    *,
    wait_for_participant: WaitForParticipant,
    candidate_identity: str | None,
    deadline_task: asyncio.Task[bool] | None,
) -> Any | None:
    """Wait for the expected candidate, yielding ``None`` when the deadline wins."""
    if candidate_identity is None:
        # JobContext's default participant kinds exclude agent participants.
        candidate_task = asyncio.create_task(wait_for_participant())
    else:
        candidate_task = asyncio.create_task(
            wait_for_participant(identity=candidate_identity)
        )

    if deadline_task is None:
        return await candidate_task

    try:
        done, _pending = await asyncio.wait(
            {candidate_task, deadline_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
    except asyncio.CancelledError:
        await _cancel_and_wait(candidate_task)
        raise
    if deadline_task in done:
        await _cancel_and_wait(candidate_task)
        await deadline_task
        return None

    return await candidate_task


async def _cancel_and_wait(task: asyncio.Task[Any]) -> None:
    if not task.done():
        task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
