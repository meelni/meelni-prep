"""
Meelni Interview Agent
Handles real-time voice interviews with LiveKit inference platform
"""

import asyncio
import logging
import os
import sys
from itertools import count
from pathlib import Path
from uuid import uuid4
from dotenv import load_dotenv
from livekit import api
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    ConversationItemAddedEvent,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
)
from livekit.agents.llm import ChatMessage
from livekit.plugins import silero, cartesia
from livekit.plugins.turn_detector.english import EnglishModel

# Add parent directory to path for shared module imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from shared.config import parse_room_metadata
from shared.runtime_config import get_model_config, get_tts_config
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
from shared.utils.prompt_builder import build_agent_prompt

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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
    """PM Interview Coach Agent with dynamic instructions"""

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
        logger.error(
            "Rejecting interview job with invalid room metadata",
            exc_info=True,
        )
        ctx.shutdown("invalid interview room metadata")
        return
    round_type = metadata["round_type"]
    config = metadata["config"]
    question = metadata.get("question")  # NEW: Extract question from metadata
    session_id = metadata["session_id"]
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

    # NEW: Log question info if provided
    if question:
        question_text = question.get("text") or question.get("question_text", "")
        company = question.get("company", "N/A")
        logger.info(f"Question from bank: '{question_text[:60]}...' (Company: {company})")
    else:
        logger.info("No specific question provided - agent will generate questions")

    # Build dynamic prompt based on round type, config, and question
    try:
        # NEW: Pass question to prompt builder
        instructions = build_agent_prompt(round_type, config, question)
        logger.info(f"Generated prompt for {round_type} interview (difficulty: {config['difficulty']})")
    except ValueError as e:
        logger.error(f"Failed to build prompt: {e}. Using fallback product_sense prompt.")
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

    # Note: Using string-based TTS model with LiveKit Inference
    # ElevenLabs is available through LiveKit Inference - NO API KEY NEEDED!
    # String format: "elevenlabs/model:voiceId"
    # Supports all default ElevenLabs voices (custom/cloned voices require ElevenLabs plugin)
    session = AgentSession(
        turn_detection=EnglishModel(),  # Context-aware turn detection
        stt=stt_model,
        llm=llm_model,
        tts=tts_model,  # String format: "elevenlabs/eleven_turbo_v2_5:56bWURjYFHyYyVf490Dp"
        vad=ctx.proc.userdata["vad"],
    )

    # Subscribe to transcript events for real-time capture
    transcript_writer_id = str(uuid4())
    transcript_sequence = count(1)

    async def publish_transcript_event_safely(transcript_data: dict[str, object]):
        try:
            await publish_transcript_event(
                ctx.room.local_participant,
                transcript_data,
            )
        except Exception as error:
            logger.error(
                "[Transcript] Failed to publish committed turn: %s",
                error,
                exc_info=True,
            )

    @session.on("conversation_item_added")
    def on_conversation_item_added(event: ConversationItemAddedEvent):
        """Publish committed voice turns with runtime-measured playout timing."""
        try:
            item = event.item
            if not isinstance(item, ChatMessage):
                return
            transcript_data = create_transcript_event_from_message(
                message=item,
                writer_id=transcript_writer_id,
                sequence=next(transcript_sequence),
                session_id=session_id,
                room_name=room_name,
                section=round_type,
            )
            if transcript_data is None:
                logger.warning(
                    "[Transcript] Dropping committed turn without canonical measured delivery"
                )
                return

            logger.info(
                f"[Transcript] {transcript_data['speaker']}: "
                f"{str(transcript_data['text'])[:50]}..."
            )

            asyncio.ensure_future(publish_transcript_event_safely(transcript_data))
        except Exception as error:
            logger.error(
                "[Transcript] Failed to normalize committed turn: %s",
                error,
                exc_info=True,
            )

    logger.info("Transcript event handlers registered successfully")

    # Start session and wait for it to be fully ready
    # Note: Do NOT call session.say() before session.start() completes!
    # Calling say() on an uninitialized session breaks the TTS pipeline
    await session.start(agent=InterviewAgent(instructions=instructions), room=ctx.room)

    logger.info(f"Voice agent started successfully - {round_type} interview with {config['difficulty']} difficulty")

    deadline_enforcer = DeadlineEnforcer()
    deadline_task: asyncio.Task[bool] | None = None

    async def terminate_room() -> None:
        await terminate_livekit_room(ctx, room_name)

    if deadline_at is not None:
        deadline_task = asyncio.create_task(
            watch_session_deadline(
                deadline_at=deadline_at,
                close_session=session.aclose,
                terminate_room=terminate_room,
                enforcer=deadline_enforcer,
            )
        )

        def on_deadline_task_done(task: asyncio.Task[bool]) -> None:
            if task.cancelled():
                return
            error = task.exception()
            if error is not None:
                logger.error(
                    "Hard-deadline enforcement failed",
                    exc_info=(type(error), error, error.__traceback__),
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

    # CRITICAL: Send initial greeting so agent speaks first
    # AgentSession doesn't auto-generate output - it waits for user input
    interview_type_display = round_type.replace("_", " ").title()
    greeting = f"Hey! Ready to jump in? We'll be doing a {interview_type_display} interview today."

    try:
        await session.say(greeting)
        logger.info(f"Initial greeting sent: {greeting[:50]}...")
    except Exception as e:
        logger.error(f"Failed to send initial greeting: {e}", exc_info=True)


if __name__ == "__main__":
    # Detect if running on LiveKit Cloud (Cloud provides LIVEKIT_URL automatically)
    is_cloud = bool(os.getenv("LIVEKIT_URL")) and not os.getenv("LOCAL_DEV")

    # Cloud doesn't support num_idle_processes or load_threshold
    if is_cloud:
        agent_name = get_required_env("LIVEKIT_INTERVIEW_AGENT_NAME")
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
                num_idle_processes=2,  # Keep 2 idle processes ready for new jobs
                load_threshold=0.9,  # Increase threshold to accept more jobs (default: 0.7)
            ),
        )
