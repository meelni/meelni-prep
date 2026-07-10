"""
Meelni Interview Agent
Handles real-time voice interviews with LiveKit inference platform
"""

import json
import logging
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
    UserInputTranscribedEvent,
    SpeechCreatedEvent,
)
from livekit.plugins import silero, cartesia
from livekit.plugins.turn_detector.english import EnglishModel

# Add parent directory to path for shared module imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from shared.config import parse_room_metadata
from shared.runtime_config import get_model_config, get_tts_config
from shared.transcript_events import TRANSCRIPT_DATA_TOPIC, create_transcript_event
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
    @session.on("user_input_transcribed")
    def on_user_transcript(event: UserInputTranscribedEvent):
        """Capture user speech transcript and publish to frontend"""
        if event.is_final:  # Only publish final transcripts, not interim
            transcript_data = create_transcript_event(
                speaker="user",
                text=event.transcript,
                timestamp=event.created_at,
                is_final=event.is_final,
            )

            # Publish via LiveKit data track
            logger.info(f"[Transcript] User: {event.transcript[:50]}...")

            # Schedule async operation safely using ensure_future
            import asyncio
            asyncio.ensure_future(
                ctx.room.local_participant.publish_data(
                    json.dumps(transcript_data).encode("utf-8"),
                    topic=TRANSCRIPT_DATA_TOPIC
                )
            )

    @session.on("speech_created")
    def on_agent_speech(event: SpeechCreatedEvent):
        """Capture agent speech transcript when created"""
        # The speech_handle contains chat_items which have the agent's responses
        speech_handle = event.speech_handle

        # Add a callback to get the full text when speech is done
        def on_speech_done(handle):
            try:
                # Only send transcript if speech was actually delivered (not interrupted)
                # Check if the speech was cancelled/interrupted
                if hasattr(handle, 'interrupted') and handle.interrupted:
                    logger.info("[Transcript] Agent speech interrupted - not sending to transcript")
                    return

                # Additional check: verify speech_duration indicates actual delivery
                # If speech_duration is 0 or very small, it was likely interrupted
                if hasattr(handle, 'speech_duration'):
                    duration = getattr(handle, 'speech_duration', 0)
                    if duration < 0.1:  # Less than 100ms means not actually spoken
                        logger.info(f"[Transcript] Agent speech too short ({duration}s) - likely interrupted")
                        return

                # Extract text from chat items
                agent_text = ""
                for chat_item in handle.chat_items:
                    if hasattr(chat_item, 'content'):
                        # Content might be a string or a list of content items
                        content = chat_item.content
                        if isinstance(content, str):
                            agent_text += content + " "
                        elif isinstance(content, list):
                            # If it's a list, concatenate all string items
                            for item in content:
                                if isinstance(item, str):
                                    agent_text += item + " "
                                elif hasattr(item, 'text'):
                                    agent_text += item.text + " "

                if agent_text.strip():
                    transcript_data = create_transcript_event(
                        speaker="interviewer",
                        text=agent_text.strip(),
                        timestamp=event.created_at,
                    )

                    logger.info(f"[Transcript] Agent: {agent_text[:50].strip()}...")

                    # Schedule async operation safely using ensure_future
                    import asyncio
                    asyncio.ensure_future(
                        ctx.room.local_participant.publish_data(
                            json.dumps(transcript_data).encode("utf-8"),
                            topic=TRANSCRIPT_DATA_TOPIC
                        )
                    )
            except Exception as e:
                logger.error(f"Error extracting agent transcript: {e}")

        speech_handle.add_done_callback(on_speech_done)

    logger.info("Transcript event handlers registered successfully")

    # Start session and wait for it to be fully ready
    # Note: Do NOT call session.say() before session.start() completes!
    # Calling say() on an uninitialized session breaks the TTS pipeline
    await session.start(
        agent=InterviewAgent(instructions=instructions),
        room=ctx.room
    )

    logger.info(f"Voice agent started successfully - {round_type} interview with {config['difficulty']} difficulty")

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
