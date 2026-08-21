"""Isolated owner-only voice runner for an admitted Preview-shadow lease.

This module deliberately has no transcript-ingest, lifecycle, controller-adapter,
tool, influence, feedback, credit, or customer-session dependency.
"""

from __future__ import annotations

import asyncio
import json
import math
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Mapping

from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    ConversationItemAddedEvent,
    JobContext,
    room_io,
)
from livekit.agents.llm import ChatMessage
from livekit.plugins.turn_detector.english import EnglishModel

from shared.candidate_presence import wait_for_candidate_before_greeting
from shared.interview_controller import (
    CandidateTurnPrepared,
    ControllerState,
    create_controller_state,
    reduce_controller,
)
from shared.mock_interview_opening import speak_mock_interview_opening
from shared.preview_shadow_control_plane_client import (
    submit_preview_shadow_terminal_evidence,
)
from shared.preview_shadow_job import (
    PreviewShadowJobAdmission,
    create_preview_shadow_director_session,
)
from shared.runtime_config import DEFAULT_INTERVIEW_RUNTIME_CONFIG, get_model_config
from shared.transcript_events import (
    create_transcript_event_from_message,
    publish_transcript_event,
)
from shared.utils.prompt_builder import build_agent_prompt

PREVIEW_SHADOW_SYNTHETIC_ROOM_VERSION = (
    "adaptive-interviewer-preview-shadow-synthetic-room.v1"
)
PREVIEW_SHADOW_SYNTHETIC_TOPOLOGY = "production_project_shadow"
PREVIEW_SHADOW_OWNER_IDENTITY = "production-project-shadow-owner"
_MAXIMUM_ROOM_METADATA_BYTES = 4 * 1024
_MAXIMUM_JSON_DEPTH = 8
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_CANONICAL_TIME = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"
)
_ROUNDS = frozenset({"behavioral", "product_sense", "execution", "strategy"})
_VOICE_CONDITIONS = frozenset(
    {
        "baseline_final_turn",
        "barge_in_interruption",
        "rapid_double_interruption",
        "long_silence_then_resume",
        "speculative_to_final_revision",
        "disconnect_reconnect_generation",
        "shutdown_with_inflight_attempt",
    }
)
_ROOM_KEYS = frozenset(
    {
        "contract_version",
        "topology",
        "session_binding_sha256",
        "round",
        "voice_condition",
        "expires_at",
    }
)


class PreviewShadowVoiceSessionError(Exception):
    pass


@dataclass(frozen=True)
class PreviewShadowSyntheticRoom:
    session_binding_sha256: str
    round: str
    voice_condition: str
    expires_at: str


def parse_preview_shadow_synthetic_room_metadata(
    contents: str,
    *,
    room_name: str,
    expected_session_binding_sha256: str,
    expected_expires_at: str,
    now: datetime,
) -> PreviewShadowSyntheticRoom:
    try:
        encoded = contents.encode("utf-8")
        if not encoded or len(encoded) > _MAXIMUM_ROOM_METADATA_BYTES:
            raise ValueError
        value = json.loads(
            contents,
            object_pairs_hook=_closed_json_object,
            parse_constant=_reject_json_constant,
        )
        _assert_depth(value)
        expires_at = value.get("expires_at") if type(value) is dict else None
        parsed_expiry = _parse_time(expires_at)
        if (
            type(value) is not dict
            or frozenset(value) != _ROOM_KEYS
            or value.get("contract_version")
            != PREVIEW_SHADOW_SYNTHETIC_ROOM_VERSION
            or value.get("topology") != PREVIEW_SHADOW_SYNTHETIC_TOPOLOGY
            or value.get("session_binding_sha256")
            != expected_session_binding_sha256
            or room_name
            != f"preview-shadow-{expected_session_binding_sha256}"
            or not _SHA256.fullmatch(expected_session_binding_sha256)
            or value.get("round") not in _ROUNDS
            or value.get("voice_condition") not in _VOICE_CONDITIONS
            or expires_at != expected_expires_at
            or parsed_expiry <= _canonical_now(now)
        ):
            raise ValueError
        return PreviewShadowSyntheticRoom(
            session_binding_sha256=expected_session_binding_sha256,
            round=str(value["round"]),
            voice_condition=str(value["voice_condition"]),
            expires_at=str(expires_at),
        )
    except (
        AttributeError,
        KeyError,
        OSError,
        OverflowError,
        RecursionError,
        TypeError,
        UnicodeError,
        ValueError,
    ):
        raise PreviewShadowVoiceSessionError("synthetic_room_invalid") from None


class SyntheticDirectorAuthority:
    """Private current-state simulator; it never admits or delivers a move."""

    def __init__(self, room: PreviewShadowSyntheticRoom, *, now: datetime) -> None:
        binding = room.session_binding_sha256[:24]
        canonical_now = _format_time(_canonical_now(now))
        self.session_id = f"shadow-session-{binding}"
        self.writer_id = f"shadow-writer-{binding}"
        self._monotonic_anchor_ms = time.monotonic_ns() // 1_000_000
        self._state = create_controller_state(
            session_id=self.session_id,
            brief_id=f"shadow-brief-{binding}",
            writer_id=self.writer_id,
            writer_generation=1,
            lifecycle_state="active",
            lifecycle_version=1,
            started_at=canonical_now,
            deadline_at=room.expires_at,
            observed_at=canonical_now,
            monotonic_anchor_ms=self._monotonic_anchor_ms,
            round_objectives=("clarify_product_goal", "identify_core_problem"),
            topic_catalog=("objective_and_scope", "problem_evidence"),
            active_question_id=f"shadow-question-{room.round}",
        )

    @property
    def state(self) -> ControllerState:
        return self._state

    def read(self) -> Mapping[str, object]:
        return self._state.to_runtime_state()

    def observe_candidate(self, event: Mapping[str, object]) -> None:
        if event.get("speaker") != "user":
            return
        duration = event.get("audio_duration_ms")
        event_id = event.get("event_id")
        text = event.get("text")
        if (
            type(duration) is not int
            or type(event_id) is not str
            or type(text) is not str
        ):
            raise PreviewShadowVoiceSessionError("synthetic_turn_invalid")
        transition = reduce_controller(
            self._state,
            CandidateTurnPrepared(
                expected_state_revision=self._state.state_revision,
                turn_id=event_id,
                transcript_revision=event_id,
                text=text,
                duration_ms=duration,
                monotonic_ms=time.monotonic_ns() // 1_000_000,
            ),
        )
        self._state = transition.state


class _SyntheticSettledSession:
    def __init__(
        self,
        director,
        session: AgentSession,
        background_tasks: set[asyncio.Task[object]],
    ) -> None:
        self._director = director
        self._session = session
        self._background_tasks = background_tasks

    def settle(self) -> None:
        self._director.settle()

    async def wait_idle(self, timeout_seconds: float) -> bool:
        return await self._director.wait_idle(timeout_seconds)

    async def shutdown(self) -> bool:
        voice_closed = False
        try:
            await self._session.aclose()
            voice_closed = True
        except BaseException:
            voice_closed = False
        current = asyncio.current_task()
        pending = tuple(
            task
            for task in self._background_tasks
            if task is not current and not task.done()
        )
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        director_closed = await self._director.shutdown()
        return voice_closed and director_closed


async def run_preview_shadow_voice_session(
    *,
    ctx: JobContext,
    room: PreviewShadowSyntheticRoom,
    admission: PreviewShadowJobAdmission,
    control_plane_endpoint: str,
    protection_bypass_secret: str,
) -> None:
    """Run one admitted synthetic Shadow cell with no customer-runtime seam."""
    authority = SyntheticDirectorAuthority(room, now=datetime.now(timezone.utc))
    director = create_preview_shadow_director_session(
        admission,
        session_id=authority.session_id,
        state_provider=authority.read,
    )
    if not director.enabled:
        ctx.shutdown("preview shadow authority unavailable")
        return

    model_config = get_model_config(dict(DEFAULT_INTERVIEW_RUNTIME_CONFIG))
    try:
        session = AgentSession(
            turn_detection=EnglishModel(),
            stt=model_config["stt_model"],
            llm=model_config["llm_model"],
            tts=model_config["tts_model"],
            vad=ctx.proc.userdata["vad"],
        )
    except Exception:
        await _settle_without_voice(
            director=director,
            admission=admission,
            endpoint=control_plane_endpoint,
            bypass=protection_bypass_secret,
        )
        ctx.shutdown("preview shadow voice unavailable")
        return

    background_tasks: set[asyncio.Task[object]] = set()
    settled = _SyntheticSettledSession(director, session, background_tasks)
    settle_lock = asyncio.Lock()
    settlement_task: asyncio.Task[None] | None = None

    async def settle_once() -> None:
        nonlocal settlement_task
        async with settle_lock:
            if settlement_task is None:
                settlement_task = asyncio.create_task(
                    _settle_and_reconcile(
                        settled=settled,
                        admission=admission,
                        endpoint=control_plane_endpoint,
                        bypass=protection_bypass_secret,
                    )
                )
            task = settlement_task
        await asyncio.shield(task)

    ctx.add_shutdown_callback(settle_once)
    sequence = 0
    seen_event_ids: set[str] = set()

    @session.on("conversation_item_added")
    def on_conversation_item_added(event: ConversationItemAddedEvent) -> None:
        nonlocal sequence
        item = event.item
        if not isinstance(item, ChatMessage):
            return
        transcript = create_transcript_event_from_message(
            message=item,
            writer_id=authority.writer_id,
            writer_generation=1,
            sequence=sequence + 1,
            session_id=authority.session_id,
            room_name=ctx.room.name,
            section=room.round,
        )
        if transcript is None:
            return
        event_id = str(transcript["event_id"])
        if event_id in seen_event_ids:
            return
        if len(seen_event_ids) >= 256:
            ctx.shutdown("preview shadow transcript capacity reached")
            return
        seen_event_ids.add(event_id)
        sequence += 1
        authority.observe_candidate(transcript)
        director.observe_synthetic_transcript(
            transcript,
            source_turn_id=event_id,
        )
        task = asyncio.create_task(
            publish_transcript_event(ctx.room.local_participant, transcript)
        )
        background_tasks.add(task)
        task.add_done_callback(
            lambda done: _discard_background_task(background_tasks, done)
        )

    @session.on("close")
    def on_session_close(_event: object) -> None:
        ctx.shutdown("preview shadow voice closed")

    try:
        await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
        director.start()
        instructions = build_agent_prompt(
            room.round,
            dict(DEFAULT_INTERVIEW_RUNTIME_CONFIG),
            None,
            interview_brief=None,
        )
        await session.start(
            agent=Agent(instructions=instructions),
            room=ctx.room,
            room_options=room_io.RoomOptions(close_on_disconnect=True),
            record=False,
        )
        expiry_task = asyncio.create_task(
            _expire_at_lease(
                expires_at=room.expires_at,
                session=session,
                shutdown=ctx.shutdown,
            )
        )
        background_tasks.add(expiry_task)
        expiry_task.add_done_callback(
            lambda done: _discard_background_task(background_tasks, done)
        )
        candidate = await wait_for_candidate_before_greeting(
            wait_for_participant=ctx.wait_for_participant,
            candidate_identity=PREVIEW_SHADOW_OWNER_IDENTITY,
            deadline_task=expiry_task,  # type: ignore[arg-type]
        )
        if candidate is None:
            ctx.shutdown("preview shadow owner unavailable")
            return
        await speak_mock_interview_opening(session, room.round, None)
    except asyncio.CancelledError:
        try:
            await settle_once()
        finally:
            ctx.shutdown("preview shadow runtime cancelled")
        raise
    except Exception:
        try:
            await settle_once()
        finally:
            ctx.shutdown("preview shadow runtime unavailable")


async def _settle_without_voice(
    *,
    director,
    admission: PreviewShadowJobAdmission,
    endpoint: str,
    bypass: str,
) -> None:
    class _DirectorOnly:
        def settle(self) -> None:
            director.settle()

        async def wait_idle(self, timeout_seconds: float) -> bool:
            return await director.wait_idle(timeout_seconds)

        async def shutdown(self) -> bool:
            return await director.shutdown()

    await _settle_and_reconcile(
        settled=_DirectorOnly(),
        admission=admission,
        endpoint=endpoint,
        bypass=bypass,
    )


async def _settle_and_reconcile(
    *,
    settled,
    admission: PreviewShadowJobAdmission,
    endpoint: str,
    bypass: str,
) -> None:
    await admission.runtime.settle_shadow(settled)
    await submit_preview_shadow_terminal_evidence(
        endpoint=endpoint,
        submission=admission.create_terminal_submission(),
        protection_bypass_secret=bypass,
    )


async def _expire_at_lease(*, expires_at: str, session: AgentSession, shutdown) -> None:
    remaining = (_parse_time(expires_at) - datetime.now(timezone.utc)).total_seconds()
    if remaining > 0:
        await asyncio.sleep(remaining)
    await session.aclose()
    shutdown("preview shadow lease expired")


def _discard_background_task(
    tasks: set[asyncio.Task[object]], task: asyncio.Task[object]
) -> None:
    tasks.discard(task)
    if not task.cancelled():
        task.exception()


def _closed_json_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    value: dict[str, object] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError
        value[key] = item
    return value


def _reject_json_constant(_value: str) -> None:
    raise ValueError


def _assert_depth(value: object, depth: int = 0) -> None:
    if depth > _MAXIMUM_JSON_DEPTH:
        raise ValueError
    if type(value) is dict:
        for item in value.values():
            _assert_depth(item, depth + 1)
    elif type(value) is list:
        for item in value:
            _assert_depth(item, depth + 1)


def _parse_time(value: object) -> datetime:
    if type(value) is not str or _CANONICAL_TIME.fullmatch(value) is None:
        raise ValueError
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if _format_time(parsed) != value:
        raise ValueError
    return parsed


def _canonical_now(value: datetime) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ValueError
    timestamp = value.astimezone(timezone.utc)
    if not math.isfinite(timestamp.timestamp()):
        raise ValueError
    return timestamp


def _format_time(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )
