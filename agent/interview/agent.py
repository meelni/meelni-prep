"""
Meelni Interview Agent
Handles real-time voice interviews with LiveKit inference platform
"""

import asyncio
import inspect
import json
import logging
import os
import sys
import time
from collections.abc import AsyncIterable, AsyncIterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import uuid4
from dotenv import load_dotenv
from livekit import api
from livekit.rtc import DataPacketKind
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    ConversationItemAddedEvent,
    ErrorEvent,
    JobContext,
    JobProcess,
    ModelSettings,
    RunContext,
    WorkerOptions,
    cli,
    function_tool,
    room_io,
    SpeechCreatedEvent,
)
from livekit.agents.llm import ChatChunk, ChatMessage
from livekit.plugins import silero, cartesia
from livekit.plugins.turn_detector.english import EnglishModel

# Add parent directory to path for shared module imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from shared.candidate_presence import wait_for_candidate_before_greeting
from shared.config import parse_room_metadata
from shared.dispatch import resolve_cli_dispatch_name
from shared.interviewer_observability import (
    InterviewerTurnLatencyTracker,
    create_interviewer_observability,
    drain_transcript_before_observability_close,
)
from shared.interview_controller_adapter import (
    InterviewControllerAdapter,
    MAX_RUNTIME_TRANSCRIPT_CORRELATIONS,
    ReplySuppressionGate,
    allow_controller_generation,
    controller_feature_enabled,
    create_interview_controller_adapter,
    measured_turn_duration_ms,
    put_bounded_correlation,
    resolve_controller_runtime_mode,
)
from shared.interviewer_tools import (
    SessionScopedInterviewerTools,
    TrustedLifecycleSnapshot,
    TrustedLifecycleSnapshotStore,
    create_session_scoped_interviewer_tools,
)
from shared.interview_director import (
    InterviewDirectorShadowSession,
    Sav469DirectorTraceSink,
    resolve_director_shadow_config,
)
from shared.interview_director_influence import DirectorInfluenceGate
from shared.mock_interview_opening import speak_mock_interview_opening
from shared.opik_tracing import (
    set_interview_contract_trace_attributes,
    setup_opik_tracing,
)
from shared.preview_shadow_entrypoint import (
    create_preview_shadow_entrypoint_runtime,
    is_preview_shadow_job_metadata,
)
from shared.preview_shadow_job import parse_preview_shadow_job_metadata
from shared.preview_shadow_voice_session import (
    parse_preview_shadow_synthetic_room_metadata,
    run_preview_shadow_voice_session,
)
from shared.runtime_config import (
    get_model_config,
    get_tts_config,
    INTERVIEW_VAD_MIN_SILENCE_SECONDS,
)
from shared.runtime_events import (
    create_runtime_event,
    provider_failure_code,
    stop_provider_runtime_then_report,
)
from shared.safe_logging import log_exception_class
from shared.session_deadline import (
    DeadlineEnforcer,
    cancel_deadline_watchdog,
    is_deadline_reached,
    parse_deadline_at,
    watch_session_deadline,
)
from shared.transcript_events import (
    create_transcript_event_from_message,
    has_runtime_measured_delivery,
    publish_transcript_event,
)
from shared.transcript_ingest import (
    TranscriptIngestAfterCutoff,
    TranscriptIngestError,
    TranscriptIngestQueue,
    TranscriptIngestQueueFull,
    TranscriptIngestQueueSealed,
    RuntimeSettlementRequestDispatcher,
    WriterSequenceAllocator,
    acknowledge_runtime_settlement_command,
    create_interruption_marker,
    create_runtime_lifecycle_read,
    create_runtime_settlement,
    create_runtime_writer_registration,
    finish_tasks_before_shutdown,
    interruption_marker_degrades_candidate_evidence,
    parse_runtime_settlement_request,
    persist_runtime_failure_event,
    post_ingest_request,
    pull_runtime_settlement_command,
    read_runtime_lifecycle_snapshot,
    register_runtime_writer,
    resolve_transcript_ingest_secret,
    should_record_unconfirmed_interruption,
)
from shared.transcript_settlement import (
    RuntimeSettlementEvidenceGate,
    fence_session_for_runtime_settlement,
    report_runtime_settlement_stage,
    settle_session_speech,
)
from shared.utils.prompt_builder import build_agent_prompt

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SERVER_SETTLEMENT_SHUTDOWN_TIMEOUT_SECONDS = 20.0
TRANSCRIPT_BACKGROUND_QUIESCE_TIMEOUT_SECONDS = 0.25
TRANSCRIPT_PROJECTION_TIMEOUT_SECONDS = 0.75
TRANSCRIPT_SETTLEMENT_FLUSH_TIMEOUT_SECONDS = 1.5
TRANSCRIPT_SETTLEMENT_PERSIST_TIMEOUT_SECONDS = 0.75
TRANSCRIPT_SPEECH_SETTLEMENT_TIMEOUT_SECONDS = 2.0
INTERVIEWER_LIFECYCLE_REFRESH_INTERVAL_SECONDS = 1.0
INTERVIEWER_LIFECYCLE_REFRESH_TIMEOUT_SECONDS = 1.0
INTERVIEWER_LIFECYCLE_LEASE_MS = 4_000


def configure_livekit_worker_env() -> None:
    """Allow local agents to reuse the browser LiveKit URL from root env files."""
    livekit_url = os.getenv("LIVEKIT_URL")
    public_livekit_url = os.getenv("NEXT_PUBLIC_LIVEKIT_URL")

    if (
        (not livekit_url or not livekit_url.strip())
        and public_livekit_url
        and public_livekit_url.strip()
    ):
        os.environ["LIVEKIT_URL"] = public_livekit_url.strip()


configure_livekit_worker_env()


def get_required_env(name: str) -> str:
    """Read required deployment config without embedding account-specific IDs."""
    value = os.getenv(name)
    if not value or not value.strip():
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value.strip()


async def terminate_livekit_room(ctx: JobContext, room_name: str) -> None:
    """Delete the room through the acknowledged API and tolerate replays."""
    try:
        await ctx.api.room.delete_room(api.DeleteRoomRequest(room=room_name))
    except Exception as error:
        message = str(error).lower()
        if "not found" in message or "does not exist" in message:
            logger.info("Interview room was already terminated at the deadline")
            return
        raise


class InterviewAgent(Agent):
    """Realistic PM interviewer with round-specific instructions."""

    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)


class ControlledInterviewAgent(InterviewAgent):
    """Inject one controller directive at the finalized user-turn boundary."""

    def __init__(
        self,
        instructions: str,
        controller_adapter: InterviewControllerAdapter,
    ) -> None:
        super().__init__(instructions=instructions)
        self._controller_adapter = controller_adapter
        self._reply_suppression_gate = ReplySuppressionGate()

    async def on_user_turn_completed(self, turn_ctx, new_message: ChatMessage) -> None:
        state = self._controller_adapter.state
        message_id = new_message.id if isinstance(new_message.id, str) else ""
        text = (
            new_message.text_content
            if isinstance(new_message.text_content, str)
            else ""
        )
        transcript_revision = (
            f"{state.writer_id}:{message_id}" if state is not None else ""
        )
        directive = self._controller_adapter.complete_user_turn(
            message_id=message_id,
            transcript_revision=transcript_revision,
            text=text,
            duration_ms=measured_turn_duration_ms(new_message.metrics),
        )
        self._apply_turn_directive(turn_ctx, message_id, directive)

    def _apply_turn_directive(self, turn_ctx, message_id, directive) -> None:
        if directive is None:
            return
        if directive.suppress_reply:
            self._reply_suppression_gate.arm(message_id)
            # Mutating the turn-local context invalidates any preemptive reply.
            turn_ctx.add_message(
                role="system",
                content="CONTROLLER_SUPPRESS_REPLY",
                id=f"controller:suppress:{message_id}",
            )
            return
        if (
            directive.instruction is not None
            and directive.generation_context_id is not None
        ):
            turn_ctx.add_message(
                role="system",
                content=directive.instruction,
                id=directive.generation_context_id,
            )

    def llm_node(self, chat_ctx, tools, model_settings):
        # Returning an empty generation keeps the public scheduled pipeline alive
        # long enough to commit and emit its finalized user item exactly once.
        provider_chat_ctx = chat_ctx.copy()
        if not allow_controller_generation(
            self._controller_adapter,
            self._reply_suppression_gate,
            provider_chat_ctx.items,
        ):
            return None
        return super().llm_node(provider_chat_ctx, tools, model_settings)


class ToolControlledInterviewAgent(ControlledInterviewAgent):
    """Expose only the five controller-authorized session-local tools."""

    def __init__(
        self,
        instructions: str,
        controller_adapter: InterviewControllerAdapter,
        interviewer_tools: SessionScopedInterviewerTools,
    ) -> None:
        self._interviewer_tools = interviewer_tools
        super().__init__(instructions, controller_adapter)

    async def on_user_turn_completed(self, turn_ctx, new_message: ChatMessage) -> None:
        state = self._controller_adapter.state
        message_id = new_message.id if isinstance(new_message.id, str) else ""
        text = (
            new_message.text_content
            if isinstance(new_message.text_content, str)
            else ""
        )
        transcript_revision = (
            f"{state.writer_id}:{message_id}" if state is not None else ""
        )
        prepare = (
            self._controller_adapter.prepare_user_turn_for_tools
            if self._interviewer_tools.enabled
            else self._controller_adapter.complete_user_turn
        )
        directive = prepare(
            message_id=message_id,
            transcript_revision=transcript_revision,
            text=text,
            duration_ms=measured_turn_duration_ms(new_message.metrics),
        )
        self._apply_turn_directive(turn_ctx, message_id, directive)

    def llm_node(self, chat_ctx, tools, model_settings):
        provider_chat_ctx = chat_ctx.copy()
        if not allow_controller_generation(
            self._controller_adapter,
            self._reply_suppression_gate,
            provider_chat_ctx.items,
        ):
            return None
        fallback_instruction = (
            self._controller_adapter.current_tool_fallback_instruction()
        )
        if fallback_instruction is not None:
            provider_chat_ctx.add_message(
                role="system",
                content=fallback_instruction,
            )
        if (
            not self._interviewer_tools.enabled
            or self._controller_adapter.tools_fenced_for_current_handle()
        ):
            return InterviewAgent.llm_node(
                self,
                provider_chat_ctx,
                [],
                ModelSettings(tool_choice="none"),
            )
        provider_output = InterviewAgent.llm_node(
            self,
            provider_chat_ctx,
            tools,
            ModelSettings(tool_choice="required"),
        )
        return fence_precommit_interviewer_text(provider_output)

    @function_tool(
        name="read_interview_state",
        description=(
            "Read the current bounded interview state only when this turn "
            "needs state authority. Never request reasoning."
        ),
    )
    async def read_interview_state(
        self,
        ctx: RunContext,
        contract_version: Literal["interviewer-tools.v1"],
    ) -> str:
        outcome = await self._interviewer_tools.invoke_read(
            tool_name="read_interview_state",
            raw_call_id=ctx.function_call.call_id,
            handle_id=ctx.speech_handle.id,
            contract_version=contract_version,
        )
        return outcome.to_model_json()

    @function_tool(
        name="read_interview_clock",
        description=(
            "Read the controller-owned interview clock. Never estimate or "
            "extend the deadline."
        ),
    )
    async def read_interview_clock(
        self,
        ctx: RunContext,
        contract_version: Literal["interviewer-tools.v1"],
    ) -> str:
        outcome = await self._interviewer_tools.invoke_read(
            tool_name="read_interview_clock",
            raw_call_id=ctx.function_call.call_id,
            handle_id=ctx.speech_handle.id,
            contract_version=contract_version,
        )
        return outcome.to_model_json()

    @function_tool(
        name="get_probe_candidates",
        description=(
            "List deterministic bounded probe candidates for the active "
            "question and exact controller revisions."
        ),
    )
    async def get_probe_candidates(
        self,
        ctx: RunContext,
        contract_version: Literal["interviewer-tools.v1"],
        expected_state_revision: int,
        expected_lifecycle_version: int,
        active_question_id: str,
    ) -> str:
        outcome = await self._interviewer_tools.invoke_probe_candidates(
            raw_call_id=ctx.function_call.call_id,
            handle_id=ctx.speech_handle.id,
            contract_version=contract_version,
            expected_state_revision=expected_state_revision,
            expected_lifecycle_version=expected_lifecycle_version,
            active_question_id=active_question_id,
        )
        return outcome.to_model_json()

    @function_tool(
        name="commit_interviewer_move",
        description=(
            "Propose one controller-authorized interviewer move. The model "
            "does not stage delivery evidence or supply rationale."
        ),
    )
    async def commit_interviewer_move(
        self,
        ctx: RunContext,
        contract_version: Literal["interviewer-tools.v1"],
        expected_state_revision: int,
        expected_lifecycle_version: int,
        move_type: Literal["probe", "clarify", "challenge", "transition"],
        idempotency_key: str,
        probe_candidate_id: str | None = None,
    ) -> str:
        outcome = await self._interviewer_tools.invoke_commit(
            raw_call_id=ctx.function_call.call_id,
            handle_id=ctx.speech_handle.id,
            contract_version=contract_version,
            expected_state_revision=expected_state_revision,
            expected_lifecycle_version=expected_lifecycle_version,
            move_type=move_type,
            probe_candidate_id=probe_candidate_id,
            idempotency_key=idempotency_key,
        )
        return outcome.to_model_json()

    @function_tool(
        name="request_graceful_close",
        description=(
            "Request a controller-authorized close before the watchdog. "
            "This never mutates durable lifecycle state."
        ),
    )
    async def request_graceful_close(
        self,
        ctx: RunContext,
        contract_version: Literal["interviewer-tools.v1"],
        expected_state_revision: int,
        expected_lifecycle_version: int,
        idempotency_key: str,
        reason: Literal["deadline", "candidate_request", "controller_policy"],
    ) -> str:
        outcome = await self._interviewer_tools.invoke_close(
            raw_call_id=ctx.function_call.call_id,
            handle_id=ctx.speech_handle.id,
            contract_version=contract_version,
            expected_state_revision=expected_state_revision,
            expected_lifecycle_version=expected_lifecycle_version,
            idempotency_key=idempotency_key,
            reason=reason,
        )
        return outcome.to_model_json()


async def fence_precommit_interviewer_text(
    provider_output: object,
) -> AsyncIterator[object]:
    """Keep required-tool model text out of LiveKit's pre-tool TTS path."""
    resolved = (
        await provider_output
        if inspect.isawaitable(provider_output)
        else provider_output
    )
    if isinstance(resolved, str):
        return
    if isinstance(resolved, ChatChunk):
        resolved = (resolved,)
    if not isinstance(resolved, AsyncIterable) and not isinstance(resolved, tuple):
        return

    async def chunks():
        if isinstance(resolved, tuple):
            for chunk in resolved:
                yield chunk
            return
        async for chunk in resolved:
            yield chunk

    async for chunk in chunks():
        if isinstance(chunk, str):
            continue
        if isinstance(chunk, ChatChunk) and chunk.delta is not None:
            chunk = chunk.model_copy(
                update={
                    "delta": chunk.delta.model_copy(update={"content": None})
                }
            )
        yield chunk


def create_interview_agent(
    *,
    instructions: str,
    controller_adapter: InterviewControllerAdapter,
    interviewer_tools: SessionScopedInterviewerTools | None = None,
) -> InterviewAgent:
    if resolve_controller_runtime_mode(controller_adapter) == "controlled_interviewer":
        if interviewer_tools is not None and interviewer_tools.enabled:
            return ToolControlledInterviewAgent(
                instructions,
                controller_adapter,
                interviewer_tools,
            )
        return ControlledInterviewAgent(instructions, controller_adapter)
    return InterviewAgent(instructions)


def prewarm(proc: JobProcess):
    """Prewarm function to load VAD model before agent starts"""
    # Configure VAD with explicit thresholds to match frontend sensitivity
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.2,      # Minimum speech duration in seconds
        # Structured PM answers include short thinking pauses. Production
        # evidence showed 600ms splitting one answer into consecutive turns.
        min_silence_duration=INTERVIEW_VAD_MIN_SILENCE_SECONDS,
        padding_duration=0.1,          # Padding before/after speech
        activation_threshold=0.5,      # Voice activity threshold (0-1), balanced sensitivity
    )


async def entrypoint(ctx: JobContext):
    """Entrypoint - reads configuration and starts agent with dynamic prompts"""
    logger.info(f"Starting agent for room: {ctx.room.name}")

    job_metadata = getattr(getattr(ctx, "job", None), "metadata", "") or ""
    if is_preview_shadow_job_metadata(job_metadata):
        now = datetime.now(timezone.utc)
        try:
            preview_shadow_job = parse_preview_shadow_job_metadata(job_metadata)
            preview_shadow_lease = preview_shadow_job["lease"]
            if type(preview_shadow_lease) is not dict:
                raise ValueError("lease")
            preview_shadow_room = parse_preview_shadow_synthetic_room_metadata(
                ctx.room.metadata or "",
                room_name=ctx.room.name,
                expected_session_binding_sha256=str(
                    preview_shadow_lease["session_binding_sha256"]
                ),
                expected_expires_at=str(preview_shadow_lease["expires_at"]),
                now=now,
            )
        except Exception:
            logger.error("Preview-shadow room rejected before provider construction")
            ctx.shutdown("invalid preview shadow room")
            return
        preview_shadow_construction = create_preview_shadow_entrypoint_runtime(
            job_metadata=job_metadata,
            room_name=ctx.room.name,
            env=os.environ,
            now=now,
        )
        if preview_shadow_construction.admission is None:
            logger.error(
                "Preview-shadow job rejected before room connection",
                extra={"reason": preview_shadow_construction.reason},
            )
            ctx.shutdown("preview shadow unavailable")
            return
        await run_preview_shadow_voice_session(
            ctx=ctx,
            room=preview_shadow_room,
            admission=preview_shadow_construction.admission,
            control_plane_endpoint=os.environ[
                "MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_URL"
            ],
            protection_bypass_secret=os.environ[
                "MEELNI_PREVIEW_SHADOW_VERCEL_BYPASS_SECRET"
            ],
        )
        return

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Parse room metadata to get round type, question, and config
    room_metadata = ctx.room.metadata or "{}"
    try:
        metadata = parse_room_metadata(room_metadata)
    except ValueError:
        logger.error("Rejecting interview job with invalid room metadata")
        ctx.shutdown("invalid interview room metadata")
        return
    round_type = metadata["round_type"]
    config = metadata["config"]
    question = metadata.get("question")  # NEW: Extract question from metadata
    interview_brief = metadata.get("interview_brief")
    set_interview_contract_trace_attributes(metadata)
    session_id = metadata["session_id"]
    candidate_identity = metadata["candidate_identity"]
    transcript_ingest_url = metadata["transcript_ingest_url"]
    deadline_at = parse_deadline_at(metadata["deadline_at"])
    room_name = ctx.room.name

    semantic_observability = create_interviewer_observability(os.environ)
    turn_observability = InterviewerTurnLatencyTracker(semantic_observability)
    runtime_close_reason = "runtime_closed"

    def close_interviewer_observability() -> None:
        turn_observability.mark_unrecovered()
        semantic_observability.record_phase("closed")
        semantic_observability.record_close(
            reason=runtime_close_reason,
            outcome="observed",
            completion_status="unknown",
            authority="runtime_observed",
        )
        semantic_observability.close()

    async def no_transcript_shutdown_drain() -> None:
        return None

    transcript_shutdown_drain = no_transcript_shutdown_drain
    director_shutdown_drain = no_transcript_shutdown_drain
    director_influence_gate: DirectorInfluenceGate | None = None

    async def shutdown_interview_runtime() -> None:
        async def drain_runtime_observers() -> None:
            await transcript_shutdown_drain()
            await director_shutdown_drain()
            if director_influence_gate is not None:
                director_influence_gate.close()

        await drain_transcript_before_observability_close(
            drain=drain_runtime_observers,
            close=close_interviewer_observability,
        )

    ctx.add_shutdown_callback(shutdown_interview_runtime)

    if deadline_at is not None and is_deadline_reached(deadline_at):
        runtime_close_reason = "time_limit"
        logger.warning(
            "Rejecting interview runtime because its hard deadline has already passed"
        )
        try:
            await terminate_livekit_room(ctx, room_name)
        finally:
            ctx.shutdown("interview deadline already reached")
        return

    logger.info(f"Room: {ctx.room.name}")
    logger.info(f"Round Type: {round_type}")
    logger.info(f"Difficulty: {config['difficulty']}")
    logger.info(f"Feedback Mode: {config['feedback_mode']}")
    logger.info(f"Duration: {config['duration']} minutes")

    if question:
        logger.info("Interview metadata includes a selected question")
    else:
        logger.info("No specific question provided - agent will generate questions")

    # Build dynamic prompt based on round type, config, and question
    try:
        # NEW: Pass question to prompt builder
        instructions = build_agent_prompt(
            round_type,
            config,
            question,
            interview_brief=interview_brief,
        )
        logger.info(f"Generated prompt for {round_type} interview (difficulty: {config['difficulty']})")
    except ValueError as error:
        semantic_observability.record_fallback(
            "prompt_build_failure", source="runtime"
        )
        log_exception_class(
            logger,
            logging.ERROR,
            "Interview prompt build failed; using the safe fallback",
            error,
        )
        # NEW: Pass question to fallback prompt as well
        instructions = build_agent_prompt(
            "product_sense",
            config,
            question,
            interview_brief=None,
        )

    model_config = get_model_config(config)
    tts_config = get_tts_config(config)
    stt_model = model_config["stt_model"]
    llm_model = model_config["llm_model"]
    tts_model = model_config["tts_model"]

    logger.info(f"STT Model: {stt_model}")
    logger.info(f"LLM Model: {llm_model}")
    logger.info(f"TTS Model: {tts_model}")
    logger.info(
        "TTS Config: voice=%s, speed=%s, emotion=%s, volume=%s",
        tts_config["voice"],
        tts_config["speed"],
        tts_config["emotion"],
        tts_config["volume"],
    )
    logger.info("Initializing voice agent session with LiveKit inference...")

    # Establish the signed provider-neutral failure path before constructing
    # provider-backed voice components.
    # The runtime must register durably before it can produce audible output.
    transcript_writer_id = str(uuid4())
    writer_registration = create_runtime_writer_registration(
        session_id=session_id,
        room_name=room_name,
        writer_id=transcript_writer_id,
        registered_at=time.time(),
    )
    transcript_ingest_secret: str | None = None
    try:
        transcript_ingest_secret = resolve_transcript_ingest_secret(os.environ)
        writer_registration_receipt = await asyncio.wait_for(
            register_runtime_writer(
                ingest_url=transcript_ingest_url,
                livekit_api_secret=transcript_ingest_secret,
                registration=writer_registration,
                transport=post_ingest_request,
            ),
            timeout=5.0,
        )
        transcript_writer_generation = (
            writer_registration_receipt.writer_generation
        )
    except (asyncio.TimeoutError, TranscriptIngestError) as error:
        runtime_close_reason = "provider_failure"
        semantic_observability.record_fallback(
            "provider_failure", source="runtime"
        )
        log_exception_class(
            logger,
            logging.ERROR,
            "Interview runtime writer registration failed",
            error,
        )

        failure_event = create_runtime_event(
            event_id=(
                f"provider-failure:{session_id}:runtime-writer-registration"
            ),
            session_id=session_id,
            event_type="provider_failed",
            occurred_at=datetime.now(timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            runtime_ref={"provider": "livekit", "id": room_name},
            failure={
                "reason": "provider_failure",
                "code": "runtime_writer_registration_failed",
                "retryable": True,
            },
        )

        async def no_op_async() -> None:
            return None

        async def report_registration_failure() -> bool:
            if transcript_ingest_secret is None:
                return False
            return await persist_runtime_failure_event(
                ingest_url=transcript_ingest_url,
                livekit_api_secret=transcript_ingest_secret,
                event=failure_event,
                transport=post_ingest_request,
            )

        try:
            persisted = await stop_provider_runtime_then_report(
                disable_input=lambda: None,
                close_session=no_op_async,
                terminate_room=lambda: terminate_livekit_room(ctx, room_name),
                shutdown=lambda: ctx.shutdown(
                    "runtime writer registration failed"
                ),
                report_failure=report_registration_failure,
            )
            if not persisted:
                logger.error(
                    "Writer registration failure report did not settle before shutdown"
                )
        except BaseException as cleanup_error:
            logger.error(
                "Writer registration failure cleanup did not complete",
                extra={"error_type": type(cleanup_error).__name__},
            )
        return

    # The runtime persists transcript evidence before publishing it to the room.
    writer_sequence = WriterSequenceAllocator()
    background_transcript_tasks: set[asyncio.Task[object]] = set()
    background_transcript_projection_tasks: set[asyncio.Task[object]] = set()
    background_transcript_flush: asyncio.Task[object] | None = None
    foreground_transcript_flush_active = False
    transcript_queue_overflowed = False
    transcript_integrity_unavailable = False
    runtime_settlement_payload: dict[str, object] | None = None
    runtime_settlement_cutoff: float | None = None
    runtime_settlement_evidence_gate = RuntimeSettlementEvidenceGate()
    runtime_settlement_session_fenced = False
    runtime_settlement_lock = asyncio.Lock()
    runtime_settlement_requests = RuntimeSettlementRequestDispatcher()
    server_settlement_tasks: set[asyncio.Task[object]] = set()
    transcript_events_by_id: dict[str, dict[str, object]] = {}
    interruption_markers_by_id: dict[str, dict[str, object]] = {}
    transcript_message_ids_by_event_id: dict[str, str] = {}

    lifecycle_read = create_runtime_lifecycle_read(
        session_id=session_id,
        room_name=room_name,
        writer_id=transcript_writer_id,
        writer_generation=transcript_writer_generation,
    )
    initial_lifecycle = None
    if controller_feature_enabled(os.environ):
        try:
            initial_lifecycle = await asyncio.wait_for(
                read_runtime_lifecycle_snapshot(
                    ingest_url=transcript_ingest_url,
                    livekit_api_secret=transcript_ingest_secret,
                    request=lifecycle_read,
                    transport=post_ingest_request,
                ),
                timeout=INTERVIEWER_LIFECYCLE_REFRESH_TIMEOUT_SECONDS,
            )
            registered_lifecycle = (
                writer_registration_receipt.lifecycle_snapshot
            )
            if (
                initial_lifecycle.version < registered_lifecycle.version
                or (
                    initial_lifecycle.version == registered_lifecycle.version
                    and initial_lifecycle.state != registered_lifecycle.state
                )
            ):
                raise TranscriptIngestError(
                    "initial runtime lifecycle read regressed"
                )
        except (asyncio.TimeoutError, TranscriptIngestError) as error:
            logger.warning(
                "Initial interviewer lifecycle authority is unavailable",
                extra={"error_type": type(error).__name__},
            )
    lifecycle_observed_ms = time.monotonic_ns() // 1_000_000
    lifecycle_store = (
        TrustedLifecycleSnapshotStore(
            TrustedLifecycleSnapshot(
                contract_version=initial_lifecycle.contract_version,
                session_id=initial_lifecycle.session_id,
                writer_id=initial_lifecycle.writer_id,
                writer_generation=initial_lifecycle.writer_generation,
                state=initial_lifecycle.state,
                version=initial_lifecycle.version,
                observed_monotonic_ms=lifecycle_observed_ms,
                valid_until_monotonic_ms=(
                    lifecycle_observed_ms + INTERVIEWER_LIFECYCLE_LEASE_MS
                ),
            ),
            monotonic_ms=lifecycle_observed_ms,
        )
        if initial_lifecycle is not None
        else None
    )
    controller_adapter = create_interview_controller_adapter(
        env=os.environ,
        session_id=session_id,
        deadline_at=metadata["deadline_at"],
        writer_id=transcript_writer_id,
        writer_generation=transcript_writer_generation,
        interview_brief=interview_brief,
        lifecycle_state=(initial_lifecycle.state if initial_lifecycle else None),
        lifecycle_version=(
            initial_lifecycle.version if initial_lifecycle else None
        ),
        observed_at=datetime.now(timezone.utc),
        monotonic_ms=lifecycle_observed_ms,
    )

    def read_director_authority() -> dict[str, object] | None:
        controller_state = controller_adapter.state
        return (
            controller_state.to_runtime_state()
            if controller_state is not None
            else None
        )

    def read_director_delivery_topic(move_id: str) -> str | None:
        controller_state = controller_adapter.state
        if controller_state is None:
            return None
        return next(
            (
                move.topic
                for move in controller_state.move_ledger
                if move.move_id == move_id
            ),
            None,
        )

    # Ordinary interviews retain the literal no-adapter boundary.
    director_shadow = InterviewDirectorShadowSession(
        config=resolve_director_shadow_config(os.environ),
        session_id=session_id,
        adapter=None,
        state_provider=read_director_authority,
        delivery_topic_provider=read_director_delivery_topic,
        trace_sink=Sav469DirectorTraceSink(semantic_observability.record),
    )
    director_shadow.start()
    director_shutdown_drain = director_shadow.shutdown
    director_influence_gate = DirectorInfluenceGate(
        env=os.environ,
        session_id=session_id,
        recommendation_store=director_shadow.store,
        observability=semantic_observability,
    )

    def observe_director_influence_state() -> None:
        try:
            director_influence_gate.observe_controller_state(
                controller_adapter.state,
                now=datetime.now(timezone.utc),
            )
        except Exception:
            return

    interviewer_tools = create_session_scoped_interviewer_tools(
        env=os.environ,
        controller=controller_adapter,
        lifecycle_store=lifecycle_store,
        observability=semantic_observability,
        director_influence=director_influence_gate,
    )
    logger.info(
        "Deterministic interview controller resolved",
        extra={
            "controller_enabled": controller_adapter.enabled,
            "controller_status": controller_adapter.status.failure_reason or "enabled",
            "interviewer_tools_enabled": interviewer_tools.enabled,
            "interviewer_tools_status": (
                interviewer_tools.status.failure_reason or "enabled"
            ),
        },
    )
    logger.info(
        "Read-only Interview Director shadow resolved",
        extra={
            "director_enabled": director_shadow.enabled,
            "director_status": director_shadow.failure_reason or "enabled",
            "director_influence_enabled": director_influence_gate.enabled,
        },
    )

    lifecycle_refresh_task: asyncio.Task[None] | None = None
    if controller_adapter.enabled:
        async def refresh_interviewer_lifecycle() -> None:
            while controller_adapter.enabled:
                await asyncio.sleep(
                    INTERVIEWER_LIFECYCLE_REFRESH_INTERVAL_SECONDS
                )
                try:
                    refreshed = await asyncio.wait_for(
                        read_runtime_lifecycle_snapshot(
                            ingest_url=transcript_ingest_url,
                            livekit_api_secret=transcript_ingest_secret,
                            request=lifecycle_read,
                            transport=post_ingest_request,
                        ),
                        timeout=INTERVIEWER_LIFECYCLE_REFRESH_TIMEOUT_SECONDS,
                    )
                    observed_ms = time.monotonic_ns() // 1_000_000
                    interviewer_tools.accept_lifecycle_refresh(
                        TrustedLifecycleSnapshot(
                            contract_version=refreshed.contract_version,
                            session_id=refreshed.session_id,
                            writer_id=refreshed.writer_id,
                            writer_generation=refreshed.writer_generation,
                            state=refreshed.state,
                            version=refreshed.version,
                            observed_monotonic_ms=observed_ms,
                            valid_until_monotonic_ms=(
                                observed_ms + INTERVIEWER_LIFECYCLE_LEASE_MS
                            ),
                        ),
                        monotonic_ms=observed_ms,
                    )
                    if refreshed.state != "active":
                        return
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    interviewer_tools.mark_lifecycle_refresh_unavailable()
                    logger.warning(
                        "Interviewer lifecycle authority became unavailable",
                        extra={"error_type": type(error).__name__},
                    )
                    return

        lifecycle_refresh_task = asyncio.create_task(
            refresh_interviewer_lifecycle()
        )

        async def stop_interviewer_lifecycle_refresh() -> None:
            if lifecycle_refresh_task is None:
                return
            lifecycle_refresh_task.cancel()
            await asyncio.gather(lifecycle_refresh_task, return_exceptions=True)

        ctx.add_shutdown_callback(stop_interviewer_lifecycle_refresh)

    async def publish_persisted_transcript(transcript_data: dict[str, object]):
        event_id = transcript_data.get("event_id")
        source_message_id = (
            transcript_message_ids_by_event_id.pop(event_id, None)
            if isinstance(event_id, str)
            else None
        )
        controller_adapter.persisted_transcript(
            transcript_data,
            source_message_id=source_message_id,
        )
        observe_director_influence_state()
        # Post-persistence, one-way observation only. Its bounded status result
        # is deliberately ignored and cannot affect projection or live control.
        director_shadow.observe_persisted_transcript(
            transcript_data,
            source_turn_id=source_message_id,
        )

        async def project_to_room() -> None:
            try:
                await asyncio.wait_for(
                    publish_transcript_event(
                        ctx.room.local_participant,
                        transcript_data,
                    ),
                    timeout=TRANSCRIPT_PROJECTION_TIMEOUT_SECONDS,
                )
            except Exception as error:
                # Room data is an ephemeral projection. Durable ingest already
                # succeeded, so a disconnected client must not block settlement.
                logger.warning(
                    "Persisted transcript projection failed",
                    extra={"error_type": type(error).__name__},
                )

        task = asyncio.create_task(project_to_room())
        background_transcript_projection_tasks.add(task)
        task.add_done_callback(background_transcript_projection_tasks.discard)

    async def observe_persisted_interruption(
        marker: dict[str, object],
    ) -> None:
        controller_adapter.persisted_interruption_marker(marker)
        observe_director_influence_state()

    transcript_queue = TranscriptIngestQueue(
        ingest_url=transcript_ingest_url,
        livekit_api_secret=transcript_ingest_secret,
        transport=post_ingest_request,
        publisher=publish_persisted_transcript,
        persisted_interruption_observer=observe_persisted_interruption,
        hard_evidence_cutoff=(
            deadline_at.timestamp() if deadline_at is not None else None
        ),
    )

    async def report_provider_failure(code: str, *, retryable: bool) -> bool:
        event = create_runtime_event(
            event_id=f"provider-failure:{session_id}:{code}",
            session_id=session_id,
            event_type="provider_failed",
            occurred_at=datetime.now(timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            runtime_ref={"provider": "livekit", "id": room_name},
            failure={
                "reason": "provider_failure",
                "code": code,
                "retryable": retryable,
            },
        )
        transcript_queue.enqueue_runtime_event(event)
        return (await transcript_queue.flush(5.0)).settled

    async def no_op_async() -> None:
        return None

    async def stop_runtime_and_report(
        code: str,
        *,
        retryable: bool,
        active_session: AgentSession | None,
        shutdown_reason: str,
    ) -> bool:
        nonlocal runtime_close_reason
        runtime_close_reason = "provider_failure"
        semantic_observability.record_fallback(
            "provider_failure", source="runtime"
        )
        try:
            persisted = await stop_provider_runtime_then_report(
                disable_input=(
                    lambda: active_session.input.set_audio_enabled(False)
                    if active_session is not None
                    else None
                ),
                close_session=(
                    active_session.aclose
                    if active_session is not None
                    else no_op_async
                ),
                terminate_room=lambda: terminate_livekit_room(ctx, room_name),
                shutdown=lambda: ctx.shutdown(shutdown_reason),
                report_failure=lambda: report_provider_failure(
                    code,
                    retryable=retryable,
                ),
            )
            if not persisted:
                logger.error(
                    "Provider failure report did not settle before shutdown",
                    extra={"failure_code": code},
                )
            return persisted
        except BaseException as error:
            logger.error(
                "Provider runtime stop or failure report failed",
                extra={
                    "failure_code": code,
                    "error_type": type(error).__name__,
                },
            )
            return False

    provider_failure_report_scheduled = False

    def schedule_provider_failure_report(code: str, *, retryable: bool) -> None:
        """Persist the first fatal provider fact before ending the local job."""
        nonlocal provider_failure_report_scheduled
        if provider_failure_report_scheduled:
            return
        provider_failure_report_scheduled = True

        async def report_and_shutdown() -> None:
            await stop_runtime_and_report(
                code,
                retryable=retryable,
                active_session=session,
                shutdown_reason="voice runtime provider failure",
            )

        task = asyncio.create_task(report_and_shutdown())
        background_transcript_tasks.add(task)

        def on_report_done(done: asyncio.Task[object]) -> None:
            background_transcript_tasks.discard(done)
            if done.cancelled():
                return
            error = done.exception()
            if error is not None:
                logger.error(
                    "Provider failure reporting task failed",
                    extra={"error_type": type(error).__name__},
                )

        task.add_done_callback(on_report_done)

    # Note: Using string-based TTS model with LiveKit Inference
    # ElevenLabs is available through LiveKit Inference - NO API KEY NEEDED!
    # String format: "elevenlabs/model:voiceId"
    # Supports all default ElevenLabs voices (custom/cloned voices require ElevenLabs plugin)
    try:
        session = AgentSession(
            max_tool_steps=3,
            turn_detection=EnglishModel(),  # Context-aware turn detection
            stt=stt_model,
            llm=llm_model,
            tts=tts_model,
            vad=ctx.proc.userdata["vad"],
        )
    except Exception as error:
        log_exception_class(
            logger,
            logging.ERROR,
            "Voice session construction failed",
            error,
        )
        await stop_runtime_and_report(
            "voice_session_construction_failed",
            retryable=True,
            active_session=None,
            shutdown_reason="voice session construction failed",
        )
        return

    async def publish_transcript_status(
        state: str,
        *,
        pending: int,
        failed: int,
        overflowed: bool,
    ) -> None:
        payload = {
            "contract_version": 1,
            "session_id": session_id,
            "room_name": room_name,
            "state": state,
            "pending": pending,
            "failed": failed,
            "overflowed": overflowed,
        }
        try:
            await asyncio.wait_for(
                ctx.room.local_participant.publish_data(
                    json.dumps(payload).encode("utf-8"),
                    topic="transcript_status",
                ),
                timeout=TRANSCRIPT_PROJECTION_TIMEOUT_SECONDS,
            )
        except Exception as error:
            logger.warning(
                "Transcript status publication failed",
                extra={"error_type": type(error).__name__},
            )

    async def flush_transcript_in_background(timeout_seconds: float) -> None:
        result = await transcript_queue.flush(timeout_seconds)
        status = (
            "healthy"
            if result.settled
            and not transcript_queue_overflowed
            and not transcript_integrity_unavailable
            else (
                "degraded"
                if result.permanent > 0
                or transcript_queue_overflowed
                or transcript_integrity_unavailable
                else "retrying"
            )
        )
        await publish_transcript_status(
            status,
            pending=result.pending,
            failed=result.permanent,
            overflowed=transcript_queue_overflowed,
        )

    def schedule_transcript_flush(timeout_seconds: float = 2.0) -> None:
        nonlocal background_transcript_flush
        if foreground_transcript_flush_active:
            return
        if (
            background_transcript_flush is not None
            and not background_transcript_flush.done()
        ):
            return

        task = asyncio.create_task(flush_transcript_in_background(timeout_seconds))
        background_transcript_flush = task
        background_transcript_tasks.add(task)

        def on_flush_done(done: asyncio.Task[object]) -> None:
            nonlocal background_transcript_flush
            background_transcript_tasks.discard(done)
            if background_transcript_flush is done:
                background_transcript_flush = None
            if done.cancelled():
                return
            error = done.exception()
            if error is not None:
                logger.error(
                    "Transcript runtime flush failed",
                    extra={"error_type": type(error).__name__},
                )
            if (
                transcript_queue.pending_count > 0
                and not foreground_transcript_flush_active
            ):
                schedule_transcript_flush(timeout_seconds)

        task.add_done_callback(on_flush_done)

    async def quiesce_background_transcript_flush() -> None:
        """Bound and release the live flush before a foreground settlement."""
        task = background_transcript_flush
        if task is None or task.done():
            return
        await finish_tasks_before_shutdown(
            (task,),
            TRANSCRIPT_BACKGROUND_QUIESCE_TIMEOUT_SECONDS,
        )

    async def drain_transcript_queue() -> None:
        nonlocal foreground_transcript_flush_active
        try:
            await asyncio.wait_for(
                settle_discovered_runtime_command(),
                timeout=SERVER_SETTLEMENT_SHUTDOWN_TIMEOUT_SECONDS,
            )
        except (asyncio.TimeoutError, TranscriptIngestError) as error:
            log_exception_class(
                logger,
                logging.WARNING,
                "Runtime settlement shutdown discovery did not complete",
                error,
            )
        runtime_settlement_requests.close()
        active_settlements = tuple(
            task for task in server_settlement_tasks if not task.done()
        )
        if active_settlements:
            cancelled = await finish_tasks_before_shutdown(
                active_settlements,
                SERVER_SETTLEMENT_SHUTDOWN_TIMEOUT_SECONDS,
            )
            if cancelled:
                logger.error(
                    "Runtime settlement tasks did not finish during shutdown",
                    extra={"pending": cancelled},
                )
        async with runtime_settlement_lock:
            foreground_transcript_flush_active = True
            try:
                await quiesce_background_transcript_flush()
                result = await transcript_queue.flush(5.0)
            finally:
                foreground_transcript_flush_active = False
        if not result.settled:
            logger.error(
                "Transcript runtime shutdown drain incomplete",
                extra={
                    "pending": result.pending,
                    "permanent": result.permanent,
                    "timed_out": result.timed_out,
                    "overflowed": transcript_queue_overflowed,
                    "failure_reasons": sorted(
                        {
                            failure.reason
                            for failure in transcript_queue.permanent_failures
                        }
                    ),
                },
            )

    transcript_shutdown_drain = drain_transcript_queue

    async def persist_runtime_settlement(
        state: str,
        cutoff_at: float,
        *,
        timeout_seconds: float = 5.0,
    ) -> bool:
        nonlocal runtime_settlement_payload
        persist_started_at = time.monotonic()
        try:
            if runtime_settlement_payload is None:
                runtime_settlement_evidence_gate.close()
                runtime_settlement_payload = create_runtime_settlement(
                    session_id=session_id,
                    room_name=room_name,
                    writer_id=transcript_writer_id,
                    writer_generation=transcript_writer_generation,
                    state=state,
                    settled_at=cutoff_at,
                )
                transcript_queue.seal_and_enqueue_runtime_settlement(
                    runtime_settlement_payload
                )
            await transcript_queue.flush(timeout_seconds)
            persisted = transcript_queue.runtime_settlement_complete
            report_runtime_settlement_stage(
                logger,
                stage="settlement_persist",
                source="none",
                outcome="succeeded" if persisted else "deferred",
                reason="settlement_persisted" if persisted else "settlement_failed",
                duration_ms=(time.monotonic() - persist_started_at) * 1000,
            )
            return persisted
        except Exception:
            report_runtime_settlement_stage(
                logger,
                stage="settlement_persist",
                source="none",
                outcome="failed",
                reason="settlement_failed",
                duration_ms=(time.monotonic() - persist_started_at) * 1000,
            )
            raise

    async def settle_current_speech(timeout_seconds: float = 5.0) -> bool:
        nonlocal transcript_integrity_unavailable
        result = await settle_session_speech(
            session,
            timeout_seconds=timeout_seconds,
        )
        if result.settled:
            return True

        transcript_integrity_unavailable = True
        if result.timed_out:
            logger.error("Voice runtime did not reach idle before settlement")
        else:
            logger.error(
                "Voice runtime settlement failed to reach idle",
                extra={"error_type": result.error_type or "UnknownError"},
            )
        return False

    async def settle_runtime(cutoff_at: float) -> dict[str, object]:
        nonlocal foreground_transcript_flush_active
        nonlocal runtime_settlement_cutoff, transcript_integrity_unavailable
        director_shadow.settle()
        director_influence_gate.close()
        async with runtime_settlement_lock:
            if runtime_settlement_cutoff is None:
                runtime_settlement_cutoff = cutoff_at
                transcript_queue.set_evidence_cutoff(cutoff_at)
            elif runtime_settlement_cutoff != cutoff_at:
                transcript_integrity_unavailable = True
            if not runtime_settlement_evidence_gate.closed:
                runtime_settlement_evidence_gate.begin_drain(cutoff_at)

            foreground_transcript_flush_active = True
            drain_reported = False
            drain_started_at = time.monotonic()
            try:
                await quiesce_background_transcript_flush()
                if runtime_settlement_payload is not None:
                    result = await transcript_queue.flush(5.0)
                    report_runtime_settlement_stage(
                        logger,
                        stage="drain",
                        source="none",
                        outcome="succeeded" if result.settled else "deferred",
                        reason=(
                            "drain_settled" if result.settled else "drain_degraded"
                        ),
                        duration_ms=(time.monotonic() - drain_started_at) * 1000,
                    )
                    drain_reported = True
                else:
                    speech_settled = await settle_current_speech(
                        TRANSCRIPT_SPEECH_SETTLEMENT_TIMEOUT_SECONDS
                    )
                    try:
                        result = await transcript_queue.flush(
                            TRANSCRIPT_SETTLEMENT_FLUSH_TIMEOUT_SECONDS
                        )
                        evidence_settled = result.settled
                    except Exception as error:
                        transcript_integrity_unavailable = True
                        evidence_settled = False
                        log_exception_class(
                            logger,
                            logging.ERROR,
                            "Transcript evidence pre-settlement flush failed",
                            error,
                        )
                    settlement_state = (
                        "degraded"
                        if not speech_settled
                        or not evidence_settled
                        or transcript_queue_overflowed
                        or transcript_integrity_unavailable
                        or transcript_queue.post_cutoff_evidence
                        else "settled"
                    )
                    report_runtime_settlement_stage(
                        logger,
                        stage="drain",
                        source="none",
                        outcome=(
                            "succeeded"
                            if settlement_state == "settled"
                            else "deferred"
                        ),
                        reason=(
                            "drain_settled"
                            if settlement_state == "settled"
                            else "drain_degraded"
                        ),
                        duration_ms=(time.monotonic() - drain_started_at) * 1000,
                    )
                    drain_reported = True
                    await persist_runtime_settlement(
                        settlement_state,
                        runtime_settlement_cutoff,
                        timeout_seconds=TRANSCRIPT_SETTLEMENT_PERSIST_TIMEOUT_SECONDS,
                    )

                return {
                    "settled": transcript_queue.runtime_settlement_complete,
                    "pending": transcript_queue.pending_count,
                    "failed": len(transcript_queue.permanent_failures)
                    + (1 if transcript_queue_overflowed else 0),
                    "overflowed": transcript_queue_overflowed,
                    "integrityUnavailable": (
                        transcript_integrity_unavailable
                        or transcript_queue.post_cutoff_evidence
                    ),
                }
            except Exception:
                if not drain_reported:
                    report_runtime_settlement_stage(
                        logger,
                        stage="drain",
                        source="none",
                        outcome="failed",
                        reason="drain_failed",
                        duration_ms=(time.monotonic() - drain_started_at) * 1000,
                    )
                raise
            finally:
                foreground_transcript_flush_active = False

    async def flush_transcript_rpc(invocation) -> str:
        try:
            payload = json.loads(invocation.payload)
        except (json.JSONDecodeError, TypeError):
            payload = None
        if not isinstance(payload, dict) or payload.get("sessionId") != session_id:
            return json.dumps(
                {"settled": False, "pending": 0, "failed": 1, "overflowed": False}
            )
        cutoff_at = min(
            time.time(),
            deadline_at.timestamp() if deadline_at is not None else float("inf"),
        )
        return json.dumps(await settle_runtime(cutoff_at))

    ctx.room.local_participant.register_rpc_method(
        "meelni.transcript.flush", flush_transcript_rpc
    )

    async def settle_discovered_runtime_command(
        *,
        fallback_request: dict[str, object] | None = None,
    ) -> None:
        nonlocal runtime_settlement_session_fenced
        nonlocal runtime_settlement_cutoff, transcript_integrity_unavailable
        command: dict[str, object] | None = None
        try:
            command = await pull_runtime_settlement_command(
                ingest_url=transcript_ingest_url,
                livekit_api_secret=transcript_ingest_secret,
                session_id=session_id,
                room_name=room_name,
                writer_id=transcript_writer_id,
                writer_generation=transcript_writer_generation,
                transport=post_ingest_request,
            )
        except TranscriptIngestError as error:
            log_exception_class(
                logger,
                logging.WARNING,
                "Durable runtime settlement command discovery failed",
                error,
            )
            return
        if command is None and fallback_request is None:
            return

        request = (
            {
                "contract_version": 1,
                "event_type": "runtime_settlement_request",
                "request_id": command["command_id"],
                "session_id": command["session_id"],
                "room_name": command["room_name"],
                "writer_generation": command["writer_generation"],
                "cutoff_at": command["cutoff_at"],
            }
            if command is not None
            else fallback_request
        )
        if request is None:
            return
        cutoff = parse_deadline_at(request["cutoff_at"])
        if cutoff is None:
            return
        cutoff_timestamp = cutoff.timestamp()
        if (
            runtime_settlement_cutoff is not None
            and runtime_settlement_cutoff != cutoff_timestamp
        ):
            transcript_integrity_unavailable = True
            report_runtime_settlement_stage(
                logger,
                stage="packet_validation",
                source="none",
                outcome="failed",
                reason="packet_rejected",
                duration_ms=0,
            )
            logger.warning("Rejected conflicting runtime settlement cutoff")
            return

        def apply_evidence_cutoff(value: float) -> None:
            nonlocal runtime_settlement_cutoff
            transcript_queue.set_evidence_cutoff(value)
            runtime_settlement_cutoff = value

        def begin_evidence_drain(value: float) -> None:
            runtime_settlement_evidence_gate.begin_drain(value)

        fence_attempted = False

        def install_local_fence() -> None:
            nonlocal fence_attempted
            nonlocal runtime_settlement_session_fenced
            fence_attempted = True
            fence_started_at = time.monotonic()
            if runtime_settlement_session_fenced:
                apply_evidence_cutoff(cutoff_timestamp)
            else:
                fence_session_for_runtime_settlement(
                    session,
                    cutoff_at=cutoff_timestamp,
                    set_evidence_cutoff=apply_evidence_cutoff,
                    begin_evidence_drain=begin_evidence_drain,
                )
                runtime_settlement_session_fenced = True
            report_runtime_settlement_stage(
                logger,
                stage="local_fence",
                source="none",
                outcome="succeeded",
                reason="fence_installed",
                duration_ms=(time.monotonic() - fence_started_at) * 1000,
            )

        async def settle_and_acknowledge() -> dict[str, object]:
            result = await settle_runtime(cutoff_timestamp)
            if command is None or not result.get("settled"):
                return result
            outcome = (
                runtime_settlement_payload.get("state")
                if runtime_settlement_payload is not None
                else None
            )
            if outcome not in {"settled", "degraded"}:
                return result
            acknowledged = await acknowledge_runtime_settlement_command(
                ingest_url=transcript_ingest_url,
                livekit_api_secret=transcript_ingest_secret,
                command=command,
                outcome=str(outcome),
                transport=post_ingest_request,
            )
            if not acknowledged:
                logger.warning("Runtime settlement command acknowledgement was fenced")
            return result

        try:
            settlement_dispatch = runtime_settlement_requests.prepare(
                request,
                settle_and_acknowledge,
                before_start=install_local_fence,
            )
        except Exception:
            if fence_attempted and not runtime_settlement_evidence_gate.draining:
                try:
                    runtime_settlement_evidence_gate.begin_drain(cutoff_timestamp)
                except Exception:
                    runtime_settlement_evidence_gate.close()
            transcript_integrity_unavailable = True
            if fence_attempted:
                report_runtime_settlement_stage(
                    logger,
                    stage="local_fence",
                    source="none",
                    outcome="failed",
                    reason="fence_failed",
                    duration_ms=0,
                )
                logger.error("Runtime settlement input/output fence failed")
            else:
                report_runtime_settlement_stage(
                    logger,
                    stage="packet_validation",
                    source="none",
                    outcome="failed",
                    reason="packet_rejected",
                    duration_ms=0,
                )
                logger.warning("Rejected runtime settlement request identity")
            return
        await settlement_dispatch.task

    def schedule_runtime_settlement_discovery(
        *, fallback_request: dict[str, object] | None = None
    ) -> None:
        task = asyncio.create_task(
            settle_discovered_runtime_command(fallback_request=fallback_request)
        )
        server_settlement_tasks.add(task)

        def on_server_settlement_done(done: asyncio.Task[object]) -> None:
            server_settlement_tasks.discard(done)
            if done.cancelled():
                return
            error = done.exception()
            if error is not None:
                log_exception_class(
                    logger,
                    logging.ERROR,
                    "Runtime settlement command failed",
                    error,
                )

        task.add_done_callback(on_server_settlement_done)

    @ctx.room.on("data_received")
    def on_runtime_settlement_request(packet) -> None:
        validation_started_at = time.monotonic()
        try:
            request = parse_runtime_settlement_request(
                data=packet.data,
                topic=packet.topic,
                sent_by_server=packet.participant is None,
                reliable=packet.kind == DataPacketKind.KIND_RELIABLE,
                expected_session_id=session_id,
                expected_room_name=room_name,
                expected_writer_generation=transcript_writer_generation,
                hard_deadline_at=deadline_at,
            )
        except TranscriptIngestError as error:
            report_runtime_settlement_stage(
                logger,
                stage="packet_validation",
                source="none",
                outcome="failed",
                reason="packet_invalid",
                duration_ms=(time.monotonic() - validation_started_at) * 1000,
            )
            log_exception_class(
                logger,
                logging.WARNING,
                "Rejected runtime settlement data request",
                error,
            )
            return
        if request is None:
            return
        report_runtime_settlement_stage(
            logger,
            stage="packet_validation",
            source="none",
            outcome="succeeded",
            reason="packet_valid",
            duration_ms=(time.monotonic() - validation_started_at) * 1000,
        )
        # The packet carries no authority. It only wakes a signed database pull;
        # the fallback preserves compatibility for commands accepted pre-rollout.
        schedule_runtime_settlement_discovery(fallback_request=request)

    @ctx.room.on("participant_disconnected")
    def on_candidate_disconnected(participant) -> None:
        nonlocal runtime_close_reason
        if candidate_identity is None or participant.identity != candidate_identity:
            return
        runtime_close_reason = "disconnect"
        schedule_runtime_settlement_discovery()

    def queue_integrity_marker(
        *, event_id: str, speaker: str, reason: str, occurred_at: float | None = None
    ) -> None:
        nonlocal transcript_integrity_unavailable, transcript_queue_overflowed
        if not runtime_settlement_evidence_gate.allows_marker(
            occurred_at=occurred_at
        ):
            return
        if interruption_marker_degrades_candidate_evidence(
            speaker=speaker, reason=reason
        ):
            transcript_integrity_unavailable = True
        try:
            marker = interruption_markers_by_id.get(event_id)
            if marker is None:
                marker = create_interruption_marker(
                    event_id=event_id,
                    writer_id=transcript_writer_id,
                    writer_generation=transcript_writer_generation,
                    # Validate the marker before consuming the writer namespace.
                    sequence=1,
                    session_id=session_id,
                    room_name=room_name,
                    speaker=speaker,
                    reason=reason,
                    occurred_at=(
                        occurred_at
                        if occurred_at is not None
                        else min(
                            time.time(),
                            runtime_settlement_cutoff
                            if runtime_settlement_cutoff is not None
                            else (
                                deadline_at.timestamp()
                                if deadline_at is not None
                                else float("inf")
                            ),
                        )
                    ),
                )
                marker["sequence"] = writer_sequence.allocate(
                    event_id=event_id, kind="interruption_marker"
                )
                put_bounded_correlation(
                    interruption_markers_by_id,
                    event_id,
                    marker,
                    limit=MAX_RUNTIME_TRANSCRIPT_CORRELATIONS,
                )
            elif marker["speaker"] != speaker or marker["reason"] != reason:
                raise TranscriptIngestError(
                    "interruption marker identity was reused for different evidence"
                )
            transcript_queue.enqueue_interruption_marker(marker)
            schedule_transcript_flush()
        except TranscriptIngestQueueFull:
            transcript_queue_overflowed = True
            logger.error("Transcript integrity marker queue overflowed")
        except TranscriptIngestQueueSealed:
            logger.error("Transcript integrity marker arrived after settlement")
        except Exception as error:
            transcript_queue_overflowed = True
            logger.error(
                "Transcript integrity marker failed",
                extra={"error_type": type(error).__name__},
            )

    @session.on("conversation_item_added")
    def on_conversation_item_added(event: ConversationItemAddedEvent):
        """Publish committed voice turns with runtime-measured playout timing."""
        nonlocal transcript_integrity_unavailable, transcript_queue_overflowed
        item = event.item
        try:
            if not isinstance(item, ChatMessage):
                return
            measured_ended_at = (
                item.metrics.get("stopped_speaking_at")
                if isinstance(item.metrics, dict)
                else None
            )
            message_id = item.id if isinstance(item.id, str) else ""
            transcript_event_id = f"{transcript_writer_id}:{message_id}"
            existing_event = transcript_events_by_id.get(transcript_event_id)
            transcript_data = create_transcript_event_from_message(
                message=item,
                writer_id=transcript_writer_id,
                writer_generation=transcript_writer_generation,
                # Validate a new event before consuming the writer namespace.
                sequence=int(existing_event["sequence"]) if existing_event else 1,
                session_id=session_id,
                room_name=room_name,
                section=round_type,
            )
            if transcript_data is None:
                if item.role == "user" and not has_runtime_measured_delivery(item):
                    logger.debug("Ignoring unmeasured user transcript hypothesis")
                    return
                logger.warning(
                    "Committed turn lacked canonical measured delivery",
                    extra={"speaker": item.role},
                )
                queue_integrity_marker(
                    event_id=(
                        f"{transcript_writer_id}:{item.id or uuid4()}:unavailable"
                    ),
                    speaker="user" if item.role == "user" else "interviewer",
                    reason="canonicalization_failed",
                    occurred_at=(
                        measured_ended_at
                        if has_runtime_measured_delivery(item)
                        else None
                    ),
                )
                return
            if not runtime_settlement_evidence_gate.allows_transcript(
                speaker=str(transcript_data["speaker"]),
                measured_ended_at=measured_ended_at,
            ):
                return

            if existing_event is None:
                transcript_data["sequence"] = writer_sequence.allocate(
                    event_id=transcript_event_id, kind="transcript"
                )
                evicted_event_ids = put_bounded_correlation(
                    transcript_events_by_id,
                    transcript_event_id,
                    transcript_data,
                    limit=MAX_RUNTIME_TRANSCRIPT_CORRELATIONS,
                )
                for evicted_event_id in evicted_event_ids:
                    transcript_message_ids_by_event_id.pop(
                        evicted_event_id,
                        None,
                    )
                put_bounded_correlation(
                    transcript_message_ids_by_event_id,
                    transcript_event_id,
                    message_id,
                    limit=MAX_RUNTIME_TRANSCRIPT_CORRELATIONS,
                )
            transcript_queue.enqueue_transcript(
                transcript_data,
                measured_ended_at=measured_ended_at,
            )
            schedule_transcript_flush()
            if item.role == "user":
                turn_observability.observe_user_speech_end(
                    message_id,
                    measured_ended_at,
                )
            elif item.role == "assistant" and message_id:
                turn_observability.observe_interviewer_audio(
                    message_id,
                    (
                        item.metrics.get("started_speaking_at")
                        if isinstance(item.metrics, dict)
                        else None
                    ),
                )
            logger.info(
                "Transcript turn queued",
                extra={
                    "event_id": transcript_data["event_id"],
                    "speaker": transcript_data["speaker"],
                    "delivery_state": transcript_data["delivery_state"],
                },
            )
        except TranscriptIngestAfterCutoff:
            transcript_integrity_unavailable = True
            logger.warning(
                "Transcript turn rejected at the runtime settlement cutoff",
                extra={
                    "speaker": (
                        "user" if item.role == "user" else "interviewer"
                    )
                },
            )
        except TranscriptIngestQueueFull:
            transcript_queue_overflowed = True
            logger.error("Transcript runtime queue overflowed")
        except TranscriptIngestQueueSealed:
            logger.error("Transcript turn arrived after runtime settlement")
        except Exception as error:
            transcript_integrity_unavailable = True
            if (
                isinstance(item, ChatMessage)
                and item.role in {"user", "assistant"}
            ):
                queue_integrity_marker(
                    event_id=(
                        f"{transcript_writer_id}:{item.id or uuid4()}:unavailable"
                    ),
                    speaker="user" if item.role == "user" else "interviewer",
                    reason="canonicalization_failed",
                    occurred_at=(
                        measured_ended_at
                        if has_runtime_measured_delivery(item)
                        else None
                    ),
                )
            logger.error(
                "Committed transcript turn normalization failed",
                extra={"error_type": type(error).__name__},
            )

    @session.on("speech_created")
    def on_speech_created(event: SpeechCreatedEvent):
        """Persist a textless marker when interrupted output had no heard prefix."""
        handle = event.speech_handle
        runtime_settlement_evidence_gate.track_speech(handle.id)
        controller_completion_acceptance = controller_adapter.speech_created(
            handle_id=handle.id,
            source=event.source,
        )

        def on_speech_done(done_handle) -> None:
            interruption_observed_at = time.time()
            marker_allowed, marker_occurred_at = (
                runtime_settlement_evidence_gate.consume_speech_marker(
                    done_handle.id
                )
            )
            has_confirmed_prefix = any(
                isinstance(item, ChatMessage)
                and item.role == "assistant"
                and isinstance(item.text_content, str)
                and bool(item.text_content.strip())
                for item in done_handle.chat_items
            )
            should_record_marker = should_record_unconfirmed_interruption(
                scheduled=done_handle.scheduled,
                interrupted=done_handle.interrupted,
                has_confirmed_prefix=has_confirmed_prefix,
            )
            assistant_message_ids = tuple(
                item.id
                for item in done_handle.chat_items
                if isinstance(item, ChatMessage)
                and item.role == "assistant"
                and isinstance(item.id, str)
            )
            controller_adapter.speech_finished(
                handle_id=done_handle.id,
                completion_acceptance=controller_completion_acceptance,
                scheduled=done_handle.scheduled,
                interrupted=done_handle.interrupted,
                has_confirmed_prefix=has_confirmed_prefix,
                assistant_message_ids=assistant_message_ids,
            )
            observe_director_influence_state()
            if should_record_marker and marker_allowed:
                queue_integrity_marker(
                    event_id=(
                        f"{transcript_writer_id}:{done_handle.id}:unavailable"
                    ),
                    speaker="interviewer",
                    reason="no_provider_confirmed_prefix",
                    occurred_at=marker_occurred_at,
                )
            if done_handle.scheduled and done_handle.interrupted:
                turn_observability.observe_interruption(
                    occurred_at=interruption_observed_at,
                    confirmed_message_ids=assistant_message_ids,
                    has_confirmed_prefix=has_confirmed_prefix,
                )

        handle.add_done_callback(on_speech_done)

    @session.on("error")
    def on_session_error(event: ErrorEvent) -> None:
        """Convert fatal STT/LLM/TTS failures into provider-neutral facts."""
        if bool(getattr(event.error, "recoverable", False)):
            return
        schedule_provider_failure_report(
            provider_failure_code(getattr(event.error, "type", None)),
            retryable=False,
        )

    logger.info("Transcript event handlers registered successfully")

    if deadline_at is not None and is_deadline_reached(deadline_at):
        runtime_close_reason = "time_limit"
        transcript_queue.set_evidence_cutoff(deadline_at.timestamp())
        try:
            try:
                await persist_runtime_settlement("settled", deadline_at.timestamp())
            except Exception as error:
                log_exception_class(
                    logger,
                    logging.ERROR,
                    "Pre-output deadline settlement persistence failed",
                    error,
                )
            await terminate_livekit_room(ctx, room_name)
        finally:
            ctx.shutdown("interview deadline reached before runtime start")
        return

    # Start session and wait for it to be fully ready
    # Note: Do NOT call session.say() before session.start() completes!
    # Calling say() on an uninitialized session breaks the TTS pipeline
    try:
        await session.start(
            agent=create_interview_agent(
                instructions=instructions,
                controller_adapter=controller_adapter,
                interviewer_tools=interviewer_tools,
            ),
            room=ctx.room,
            room_options=room_io.RoomOptions(close_on_disconnect=False),
            record=False,
        )
    except Exception as error:
        log_exception_class(
            logger,
            logging.ERROR,
            "Voice session start failed",
            error,
        )
        await stop_runtime_and_report(
            "voice_session_start_failed",
            retryable=True,
            active_session=session,
            shutdown_reason="voice session start failed",
        )
        return

    logger.info(f"Voice agent started successfully - {round_type} interview with {config['difficulty']} difficulty")

    deadline_enforcer = DeadlineEnforcer()
    deadline_task: asyncio.Task[bool] | None = None

    async def terminate_room() -> None:
        await terminate_livekit_room(ctx, room_name)

    async def close_session_at_deadline() -> None:
        nonlocal runtime_close_reason
        runtime_close_reason = "time_limit"
        result = await settle_runtime(deadline_at.timestamp())
        if not result["settled"]:
            logger.error("Runtime transcript settlement could not be persisted")
        await session.aclose()

    if deadline_at is not None:
        deadline_task = asyncio.create_task(
            watch_session_deadline(
                deadline_at=deadline_at,
                close_session=close_session_at_deadline,
                terminate_room=terminate_room,
                enforcer=deadline_enforcer,
            )
        )

        def on_deadline_task_done(task: asyncio.Task[bool]) -> None:
            if task.cancelled():
                return
            error = task.exception()
            if error is not None:
                log_exception_class(
                    logger,
                    logging.ERROR,
                    "Hard-deadline enforcement failed",
                    error,
                )
                schedule_provider_failure_report(
                    "deadline_enforcement_failed",
                    retryable=True,
                )

        deadline_task.add_done_callback(on_deadline_task_done)

        @session.on("close")
        def on_session_close(_event) -> None:
            cancel_deadline_watchdog(deadline_task, deadline_enforcer)

        logger.info("Hard deadline armed for %s", metadata["deadline_at"])

        # Give an already-expired watchdog one event-loop turn to close the
        # runtime before it can produce a greeting beyond the deadline.
        await asyncio.sleep(0)
        if deadline_enforcer.enforcement_started:
            await deadline_task
            return
    else:
        logger.warning(
            "Interview metadata has no hard deadline; accepting legacy rollout payload"
        )

    candidate = await wait_for_candidate_before_greeting(
        wait_for_participant=ctx.wait_for_participant,
        candidate_identity=candidate_identity,
        deadline_task=deadline_task,
    )
    if candidate is None:
        runtime_close_reason = "disconnect"
        return
    if deadline_enforcer.enforcement_started:
        if deadline_task is not None:
            await deadline_task
        return
    logger.info(
        "Expected interview candidate is present"
        if candidate_identity is not None
        else "Legacy interview candidate is present"
    )

    # AgentSession waits for user input, so the runtime owns one deterministic
    # first turn and adds it to chat context before model-generated follow-ups.
    semantic_observability.record_phase("opening")
    try:
        await speak_mock_interview_opening(session, round_type, question)
        semantic_observability.record_phase("primary_question")
        logger.info("Initial mock interview opening sent")
    except Exception as error:
        log_exception_class(
            logger,
            logging.ERROR,
            "Initial greeting delivery failed",
            error,
        )
        await stop_runtime_and_report(
            "initial_greeting_failed",
            retryable=True,
            active_session=session,
            shutdown_reason="initial greeting failed",
        )
        return


if __name__ == "__main__":
    # Asset builds use a non-routable sentinel; every worker command still
    # requires its environment-owned explicit dispatch name.
    agent_name = resolve_cli_dispatch_name("LIVEKIT_INTERVIEW_AGENT_NAME")
    setup_opik_tracing("meelni-interview-agent")
    is_cloud = bool(os.getenv("LIVEKIT_URL")) and not os.getenv("LOCAL_DEV")

    # Cloud doesn't support num_idle_processes or load_threshold
    if is_cloud:
        cli.run_app(
            WorkerOptions(
                entrypoint_fnc=entrypoint,
                prewarm_fnc=prewarm,
                agent_name=agent_name,
            ),
        )
    else:
        cli.run_app(
            WorkerOptions(
                entrypoint_fnc=entrypoint,
                prewarm_fnc=prewarm,
                agent_name=agent_name,
                num_idle_processes=2,  # Keep 2 idle processes ready for new jobs
                load_threshold=0.9,  # Increase threshold to accept more jobs (default: 0.7)
            ),
        )
