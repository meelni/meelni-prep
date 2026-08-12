"""Provider-neutral helpers for settling in-flight LiveKit conversation work."""

import asyncio
import logging
import math
from dataclasses import dataclass
from typing import Callable, Literal


RuntimeSettlementStage = Literal[
    "packet_validation", "local_fence", "drain", "settlement_persist"
]
RuntimeSettlementSource = Literal["participant", "dispatch", "none"]
RuntimeSettlementOutcome = Literal["succeeded", "deferred", "failed"]

_RUNTIME_SETTLEMENT_STAGE_REASONS = {
    "packet_valid",
    "packet_invalid",
    "packet_rejected",
    "fence_installed",
    "fence_failed",
    "drain_settled",
    "drain_degraded",
    "drain_failed",
    "settlement_persisted",
    "settlement_failed",
}


@dataclass(frozen=True)
class SpeechSettlementResult:
    settled: bool
    timed_out: bool = False
    error_type: str | None = None


class RuntimeSettlementEvidenceGate:
    """Admit only measured canonical evidence from pre-cutoff work during End."""

    def __init__(self) -> None:
        self._state: Literal["open", "draining", "closed"] = "open"
        self._cutoff_at: float | None = None
        self._pre_drain_speech_ids: set[str] = set()

    @property
    def draining(self) -> bool:
        return self._state == "draining"

    @property
    def closed(self) -> bool:
        return self._state == "closed"

    def begin_drain(self, cutoff_at: float) -> None:
        if (
            isinstance(cutoff_at, bool)
            or not isinstance(cutoff_at, (int, float))
            or not math.isfinite(cutoff_at)
            or cutoff_at <= 0
        ):
            raise ValueError("runtime settlement evidence cutoff must be positive")
        normalized = float(cutoff_at)
        if self._state == "closed":
            raise RuntimeError("runtime settlement evidence gate is closed")
        if self._cutoff_at is not None and self._cutoff_at != normalized:
            raise ValueError("runtime settlement evidence cutoff cannot change")
        self._cutoff_at = normalized
        self._state = "draining"

    def close(self) -> None:
        self._state = "closed"
        self._pre_drain_speech_ids.clear()

    def allows_transcript(self, *, speaker: str, measured_ended_at: object) -> bool:
        if self._state == "open":
            return True
        if self._state != "draining" or speaker not in {"user", "interviewer"}:
            return False
        return self._is_at_or_before_cutoff(measured_ended_at)

    def allows_marker(self, *, occurred_at: object) -> bool:
        if self._state == "open":
            return True
        if self._state != "draining":
            return False
        return self._is_at_or_before_cutoff(occurred_at)

    def track_speech(self, speech_id: object) -> bool:
        if (
            self._state != "open"
            or not isinstance(speech_id, str)
            or not speech_id.strip()
        ):
            return False
        self._pre_drain_speech_ids.add(speech_id)
        return True

    def consume_speech_marker(self, speech_id: object) -> tuple[bool, float | None]:
        if not isinstance(speech_id, str) or speech_id not in self._pre_drain_speech_ids:
            return False, None
        self._pre_drain_speech_ids.discard(speech_id)
        if self._state == "closed":
            return False, None
        return True, self._cutoff_at if self._state == "draining" else None

    def _is_at_or_before_cutoff(self, value: object) -> bool:
        return (
            not isinstance(value, bool)
            and isinstance(value, (int, float))
            and math.isfinite(value)
            and self._cutoff_at is not None
            and value > 0
            and value <= self._cutoff_at
        )


def report_runtime_settlement_stage(
    logger: logging.Logger,
    *,
    stage: RuntimeSettlementStage,
    source: RuntimeSettlementSource,
    outcome: RuntimeSettlementOutcome,
    reason: str,
    duration_ms: float,
) -> dict[str, object] | None:
    """Emit only closed, identity-free runtime settlement telemetry."""
    if (
        stage not in {
            "packet_validation",
            "local_fence",
            "drain",
            "settlement_persist",
        }
        or source not in {"participant", "dispatch", "none"}
        or outcome not in {"succeeded", "deferred", "failed"}
        or reason not in _RUNTIME_SETTLEMENT_STAGE_REASONS
        or isinstance(duration_ms, bool)
        or not isinstance(duration_ms, (int, float))
        or not math.isfinite(duration_ms)
        or duration_ms < 0
    ):
        return None
    event: dict[str, object] = {
        "event": "meelni_runtime_settlement_stage",
        "version": 1,
        "stage": stage,
        "source": source,
        "outcome": outcome,
        "reason": reason,
        "duration_ms": round(duration_ms),
    }
    try:
        logger.info("Runtime settlement stage", extra={"runtime_settlement": event})
    except Exception:
        return None
    return event


def fence_session_for_runtime_settlement(
    session: object,
    *,
    cutoff_at: float,
    set_evidence_cutoff: Callable[[float], None],
    begin_evidence_drain: Callable[[float], None],
) -> asyncio.Future[None]:
    """Freeze evidence before stopping all input, output, and queued speech."""
    if (
        isinstance(cutoff_at, bool)
        or not isinstance(cutoff_at, (int, float))
        or cutoff_at <= 0
    ):
        raise ValueError("runtime settlement cutoff must be positive")
    if not callable(set_evidence_cutoff) or not callable(begin_evidence_drain):
        raise TypeError("runtime settlement evidence fences must be callable")
    set_evidence_cutoff(float(cutoff_at))
    begin_evidence_drain(float(cutoff_at))
    getattr(session, "input").set_audio_enabled(False)
    getattr(session, "output").set_audio_enabled(False)
    interruption = getattr(session, "interrupt")(force=True)
    if not isinstance(interruption, asyncio.Future):
        raise TypeError("runtime interruption must return an asyncio Future")
    return interruption


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
        session_output = getattr(session, "output")
        session_output.set_audio_enabled(False)

        interruption = getattr(session, "interrupt")(force=True)
        if not isinstance(interruption, asyncio.Future):
            raise TypeError("runtime interruption must return an asyncio Future")
        settlement_tasks.append(interruption)

        current_speech = getattr(session, "current_speech")
        if current_speech is not None and not current_speech.done():
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
