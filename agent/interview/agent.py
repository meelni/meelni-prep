"""
Meelni Interview Agent
Handles real-time voice interviews with LiveKit inference platform
"""

import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from itertools import count
from pathlib import Path
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
    WorkerOptions,
    cli,
    room_io,
    SpeechCreatedEvent,
)
from livekit.agents.llm import ChatMessage
from livekit.plugins import silero, cartesia
from livekit.plugins.turn_detector.english import EnglishModel

# Add parent directory to path for shared module imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from shared.candidate_presence import wait_for_candidate_before_greeting
from shared.config import parse_room_metadata
from shared.dispatch import resolve_cli_dispatch_name
from shared.mock_interview_opening import speak_mock_interview_opening
from shared.runtime_config import get_model_config, get_tts_config
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
    publish_transcript_event,
)
from shared.transcript_ingest import (
    TranscriptIngestAfterCutoff,
    TranscriptIngestError,
    TranscriptIngestQueue,
    TranscriptIngestQueueFull,
    TranscriptIngestQueueSealed,
    RuntimeSettlementRequestDispatcher,
    create_interruption_marker,
    create_runtime_settlement,
    create_runtime_writer_registration,
    finish_tasks_before_shutdown,
    parse_runtime_settlement_request,
    post_ingest_request,
    register_runtime_writer,
)
from shared.utils.prompt_builder import build_agent_prompt

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SERVER_SETTLEMENT_SHUTDOWN_TIMEOUT_SECONDS = 20.0


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


def prewarm(proc: JobProcess):
    """Prewarm function to load VAD model before agent starts"""
    # Configure VAD with explicit thresholds to match frontend sensitivity
    proc.userdata["vad"] = silero.VAD.load(
        min_speech_duration=0.2,      # Minimum speech duration in seconds
        min_silence_duration=0.6,     # Wait 600ms of silence before end-of-speech
        padding_duration=0.1,          # Padding before/after speech
        activation_threshold=0.5,      # Voice activity threshold (0-1), balanced sensitivity
    )


async def entrypoint(ctx: JobContext):
    """Entrypoint - reads configuration and starts agent with dynamic prompts"""
    logger.info(f"Starting agent for room: {ctx.room.name}")

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
    session_id = metadata["session_id"]
    candidate_identity = metadata["candidate_identity"]
    transcript_ingest_url = metadata["transcript_ingest_url"]
    deadline_at = parse_deadline_at(metadata["deadline_at"])
    room_name = ctx.room.name

    if deadline_at is not None and is_deadline_reached(deadline_at):
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
        instructions = build_agent_prompt(round_type, config, question)
        logger.info(f"Generated prompt for {round_type} interview (difficulty: {config['difficulty']})")
    except ValueError as error:
        log_exception_class(
            logger,
            logging.ERROR,
            "Interview prompt build failed; using the safe fallback",
            error,
        )
        # NEW: Pass question to fallback prompt as well
        instructions = build_agent_prompt("product_sense", config, question)

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
    try:
        transcript_writer_generation = await asyncio.wait_for(
            register_runtime_writer(
                ingest_url=transcript_ingest_url,
                livekit_api_secret=get_required_env("LIVEKIT_API_SECRET"),
                registration=writer_registration,
                transport=post_ingest_request,
            ),
            timeout=5.0,
        )
    except (asyncio.TimeoutError, TranscriptIngestError) as error:
        log_exception_class(
            logger,
            logging.ERROR,
            "Interview runtime writer registration failed",
            error,
        )
        ctx.shutdown("runtime writer registration failed")
        return

    # The runtime persists transcript evidence before publishing it to the room.
    transcript_sequence = count(1)
    interruption_sequence = count(1)
    background_transcript_tasks: set[asyncio.Task[object]] = set()
    background_transcript_flush: asyncio.Task[object] | None = None
    transcript_queue_overflowed = False
    transcript_integrity_unavailable = False
    runtime_settlement_payload: dict[str, object] | None = None
    runtime_settlement_cutoff: float | None = None
    runtime_settlement_lock = asyncio.Lock()
    runtime_settlement_requests = RuntimeSettlementRequestDispatcher()
    server_settlement_tasks: set[asyncio.Task[object]] = set()
    transcript_events_by_id: dict[str, dict[str, object]] = {}
    interruption_markers_by_id: dict[str, dict[str, object]] = {}

    async def publish_persisted_transcript(transcript_data: dict[str, object]):
        await publish_transcript_event(ctx.room.local_participant, transcript_data)

    transcript_queue = TranscriptIngestQueue(
        ingest_url=transcript_ingest_url,
        livekit_api_secret=get_required_env("LIVEKIT_API_SECRET"),
        transport=post_ingest_request,
        publisher=publish_persisted_transcript,
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
            await ctx.room.local_participant.publish_data(
                json.dumps(payload).encode("utf-8"),
                topic="transcript_status",
            )
        except Exception as error:
            logger.warning(
                "Transcript status publication failed",
                extra={"error_type": type(error).__name__},
            )

    async def flush_transcript_in_background(timeout_seconds: float) -> None:
        await publish_transcript_status(
            "retrying",
            pending=transcript_queue.pending_count,
            failed=len(transcript_queue.permanent_failures),
            overflowed=transcript_queue_overflowed,
        )
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

        task.add_done_callback(on_flush_done)

    async def drain_transcript_queue() -> None:
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
        result = await transcript_queue.flush(5.0)
        if not result.settled:
            logger.error(
                "Transcript runtime shutdown drain incomplete",
                extra={
                    "pending": result.pending,
                    "permanent": result.permanent,
                    "timed_out": result.timed_out,
                    "overflowed": transcript_queue_overflowed,
                },
            )

    ctx.add_shutdown_callback(drain_transcript_queue)

    async def persist_runtime_settlement(state: str, cutoff_at: float) -> bool:
        nonlocal runtime_settlement_payload
        if runtime_settlement_payload is None:
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
        await transcript_queue.flush(5.0)
        return transcript_queue.runtime_settlement_complete

    async def settle_current_speech(timeout_seconds: float = 5.0) -> bool:
        nonlocal transcript_integrity_unavailable
        user_was_speaking = session.user_state == "speaking"
        session.input.set_audio_enabled(False)
        current_speech = session.current_speech
        speech_wait = None
        if current_speech is not None and not current_speech.done():
            current_speech.interrupt(force=True)
            speech_wait = current_speech.wait_for_playout()
        user_commit = (
            session.commit_user_turn(
                transcript_timeout=5.0,
                stt_flush_duration=1.0,
                skip_reply=True,
            )
            if user_was_speaking
            else None
        )
        waits = []
        if speech_wait is not None:
            waits.append(speech_wait)
        if user_commit is not None:
            waits.append(user_commit)

        async def await_runtime_idle() -> None:
            if waits:
                await asyncio.gather(*waits)
            await session.wait_for_idle()

        try:
            await asyncio.wait_for(await_runtime_idle(), timeout=timeout_seconds)
        except asyncio.TimeoutError:
            transcript_integrity_unavailable = True
            logger.error("Voice runtime did not reach idle before settlement")
            return False
        except Exception as error:
            transcript_integrity_unavailable = True
            log_exception_class(
                logger,
                logging.ERROR,
                "Voice runtime settlement failed to reach idle",
                error,
            )
            return False
        await asyncio.sleep(0)
        return True

    async def settle_runtime(cutoff_at: float) -> dict[str, object]:
        nonlocal runtime_settlement_cutoff, transcript_integrity_unavailable
        async with runtime_settlement_lock:
            if runtime_settlement_cutoff is None:
                runtime_settlement_cutoff = cutoff_at
                transcript_queue.set_evidence_cutoff(cutoff_at)
            elif runtime_settlement_cutoff != cutoff_at:
                transcript_integrity_unavailable = True

            if runtime_settlement_payload is not None:
                await transcript_queue.flush(5.0)
            else:
                speech_settled = await settle_current_speech()
                try:
                    result = await transcript_queue.flush(7.0)
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
                await persist_runtime_settlement(
                    settlement_state,
                    runtime_settlement_cutoff,
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

    @ctx.room.on("data_received")
    def on_runtime_settlement_request(packet) -> None:
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
            log_exception_class(
                logger,
                logging.WARNING,
                "Rejected runtime settlement data request",
                error,
            )
            return
        if request is None:
            return
        cutoff = parse_deadline_at(request["cutoff_at"])
        if cutoff is None:
            return
        try:
            settlement_dispatch = runtime_settlement_requests.prepare(
                request,
                lambda: settle_runtime(cutoff.timestamp()),
            )
        except TranscriptIngestError as error:
            log_exception_class(
                logger,
                logging.WARNING,
                "Rejected runtime settlement request identity",
                error,
            )
            return

        session.input.set_audio_enabled(False)
        current_speech = session.current_speech
        if current_speech is not None and not current_speech.done():
            current_speech.interrupt(force=True)
        if not settlement_dispatch.started:
            return
        task = settlement_dispatch.task
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
                    "Runtime settlement data request failed",
                    error,
                )

        task.add_done_callback(on_server_settlement_done)

    def queue_integrity_marker(
        *, event_id: str, speaker: str, reason: str, occurred_at: float | None = None
    ) -> None:
        nonlocal transcript_integrity_unavailable, transcript_queue_overflowed
        transcript_integrity_unavailable = True
        try:
            marker = interruption_markers_by_id.get(event_id)
            if marker is None:
                marker = create_interruption_marker(
                    event_id=event_id,
                    writer_id=transcript_writer_id,
                    writer_generation=transcript_writer_generation,
                    sequence=next(interruption_sequence),
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
                interruption_markers_by_id[event_id] = marker
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
            message_id = item.id if isinstance(item.id, str) else ""
            transcript_event_id = f"{transcript_writer_id}:{message_id}"
            existing_event = transcript_events_by_id.get(transcript_event_id)
            transcript_data = create_transcript_event_from_message(
                message=item,
                writer_id=transcript_writer_id,
                writer_generation=transcript_writer_generation,
                sequence=(
                    int(existing_event["sequence"])
                    if existing_event is not None
                    else next(transcript_sequence)
                ),
                session_id=session_id,
                room_name=room_name,
                section=round_type,
            )
            if transcript_data is None:
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
                )
                return

            if existing_event is None:
                transcript_events_by_id[transcript_event_id] = transcript_data
            transcript_queue.enqueue_transcript(
                transcript_data,
                measured_ended_at=(
                    item.metrics.get("stopped_speaking_at")
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
            schedule_transcript_flush()
        except TranscriptIngestAfterCutoff:
            transcript_integrity_unavailable = True
            queue_integrity_marker(
                event_id=f"{transcript_writer_id}:{item.id or uuid4()}:cutoff",
                speaker="user" if item.role == "user" else "interviewer",
                reason="canonicalization_failed",
                occurred_at=runtime_settlement_cutoff,
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
                )
            logger.error(
                "Committed transcript turn normalization failed",
                extra={"error_type": type(error).__name__},
            )

    @session.on("speech_created")
    def on_speech_created(event: SpeechCreatedEvent):
        """Persist a textless marker when interrupted output had no heard prefix."""
        handle = event.speech_handle

        def on_speech_done(done_handle) -> None:
            if not done_handle.interrupted:
                return
            has_confirmed_prefix = any(
                isinstance(item, ChatMessage)
                and item.role == "assistant"
                and isinstance(item.text_content, str)
                and bool(item.text_content.strip())
                for item in done_handle.chat_items
            )
            if has_confirmed_prefix:
                return
            queue_integrity_marker(
                event_id=f"{transcript_writer_id}:{done_handle.id}:unavailable",
                speaker="interviewer",
                reason="no_provider_confirmed_prefix",
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
            agent=InterviewAgent(instructions=instructions),
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
    try:
        await speak_mock_interview_opening(session, round_type, question)
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
