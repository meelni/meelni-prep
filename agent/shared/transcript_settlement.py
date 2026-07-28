"""Provider-neutral helpers for settling in-flight LiveKit conversation work."""

import asyncio
from dataclasses import dataclass


@dataclass(frozen=True)
class SpeechSettlementResult:
    settled: bool
    timed_out: bool = False
    error_type: str | None = None


async def settle_session_speech(
    session: object,
    *,
    timeout_seconds: float,
) -> SpeechSettlementResult:
    """Stop new input and commit the measured in-flight turn before transcript drain."""
    if (
        isinstance(timeout_seconds, bool)
        or not isinstance(timeout_seconds, (int, float))
        or timeout_seconds <= 0
    ):
        raise ValueError("speech settlement timeout must be positive")

    settlement_tasks: list[asyncio.Future[object]] = []
    try:
        user_was_speaking = getattr(session, "user_state") == "speaking"
        session_input = getattr(session, "input")
        session_input.set_audio_enabled(False)

        current_speech = getattr(session, "current_speech")
        if current_speech is not None and not current_speech.done():
            current_speech.interrupt(force=True)
            settlement_tasks.append(
                asyncio.ensure_future(current_speech.wait_for_playout())
            )

        if user_was_speaking:
            settlement_tasks.append(
                asyncio.ensure_future(
                    session.commit_user_turn(
                        transcript_timeout=5.0,
                        stt_flush_duration=1.0,
                        skip_reply=True,
                    )
                )
            )

        async def await_runtime_idle() -> None:
            if settlement_tasks:
                await asyncio.gather(*settlement_tasks)
            await session.wait_for_idle()

        await asyncio.wait_for(
            await_runtime_idle(),
            timeout=float(timeout_seconds),
        )
    except asyncio.TimeoutError:
        return SpeechSettlementResult(settled=False, timed_out=True)
    except Exception as error:
        return SpeechSettlementResult(
            settled=False,
            error_type=type(error).__name__,
        )
    finally:
        for task in settlement_tasks:
            if not task.done():
                task.cancel()
        if settlement_tasks:
            await asyncio.gather(*settlement_tasks, return_exceptions=True)

    await asyncio.sleep(0)
    return SpeechSettlementResult(settled=True)
