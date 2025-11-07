"""
MockMate Interview Agent
Handles real-time voice interviews with LiveKit inference platform
"""

import json
import logging
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
from config import parse_room_metadata
from utils.prompt_builder import build_agent_prompt

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class InterviewAgent(Agent):
    """PM Interview Coach Agent with dynamic instructions"""

    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)


def prewarm(proc: JobProcess):
    """Prewarm function to load VAD model before agent starts"""
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext):
    """Entrypoint - reads configuration and starts agent with dynamic prompts"""
    logger.info(f"Starting agent for room: {ctx.room.name}")

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Parse room metadata to get round type and config
    room_metadata = ctx.room.metadata or "{}"
    metadata = parse_room_metadata(room_metadata)
    round_type = metadata["round_type"]
    config = metadata["config"]

    logger.info(f"Room: {ctx.room.name}")
    logger.info(f"Round Type: {round_type}")
    logger.info(f"Difficulty: {config['difficulty']}")
    logger.info(f"Feedback Mode: {config['feedback_mode']}")
    logger.info(f"Duration: {config['duration']} minutes")

    # Build dynamic prompt based on round type and config
    try:
        instructions = build_agent_prompt(round_type, config)
        logger.info(f"Generated prompt for {round_type} interview (difficulty: {config['difficulty']})")
    except ValueError as e:
        logger.error(f"Failed to build prompt: {e}. Using fallback product_sense prompt.")
        instructions = build_agent_prompt("product_sense", config)

    # Extract model settings from config
    stt_model = config.get("stt_model", "deepgram/nova-3")
    llm_model = config.get("llm_model", "openai/gpt-4.1-mini")
    tts_model = config.get("tts_model", "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b")

    # Extract TTS parameters from config
    voice_id = config.get("voice", "6ccbfb76-1fc6-48f7-b71d-91ac6298247b")
    speed = config.get("speed", 1.0)
    emotion = config.get("emotion", "professional")
    volume = config.get("volume", 1.0)

    logger.info(f"STT Model: {stt_model}")
    logger.info(f"LLM Model: {llm_model}")
    logger.info(f"TTS Model: {tts_model}")
    logger.info(f"TTS Config: voice={voice_id}, speed={speed}, emotion={emotion}, volume={volume}")
    logger.info("Initializing voice agent session with LiveKit inference...")

    # Note: Using string-based TTS model with LiveKit Inference
    # cartesia.TTS() requires CARTESIA_API_KEY even with LiveKit Inference
    # String format works without API key and voice is embedded in tts_model string
    # TODO: Add CARTESIA_API_KEY to .env if we need per-user voice/speed/emotion customization
    session = AgentSession(
        stt=stt_model,
        llm=llm_model,
        tts=tts_model,  # String format: "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b"
        vad=ctx.proc.userdata["vad"],
    )

    # Subscribe to transcript events for real-time capture
    @session.on("user_input_transcribed")
    def on_user_transcript(event: UserInputTranscribedEvent):
        """Capture user speech transcript and publish to frontend"""
        if event.is_final:  # Only publish final transcripts, not interim
            transcript_data = {
                "speaker": "user",
                "text": event.transcript,
                "timestamp": event.created_at,
                "is_final": event.is_final,
            }

            # Publish via LiveKit data track
            logger.info(f"[Transcript] User: {event.transcript[:50]}...")

            # Use asyncio.create_task for async operation within sync callback
            import asyncio
            asyncio.create_task(
                ctx.room.local_participant.publish_data(
                    json.dumps(transcript_data).encode("utf-8"),
                    topic="transcript"
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
                    transcript_data = {
                        "speaker": "interviewer",  # Frontend expects "interviewer" not "agent"
                        "text": agent_text.strip(),
                        "timestamp": event.created_at,
                        "is_final": True,
                    }

                    logger.info(f"[Transcript] Agent: {agent_text[:50].strip()}...")

                    # Use asyncio.create_task for async operation within sync callback
                    import asyncio
                    asyncio.create_task(
                        ctx.room.local_participant.publish_data(
                            json.dumps(transcript_data).encode("utf-8"),
                            topic="transcript"
                        )
                    )
            except Exception as e:
                logger.error(f"Error extracting agent transcript: {e}")

        speech_handle.add_done_callback(on_speech_done)

    logger.info("Transcript event handlers registered successfully")

    await session.start(
        agent=InterviewAgent(instructions=instructions),
        room=ctx.room
    )

    logger.info(f"Voice agent started successfully - {round_type} interview with {config['difficulty']} difficulty")


if __name__ == "__main__":
    # Detect if running on LiveKit Cloud (Cloud provides LIVEKIT_URL automatically)
    import os
    is_cloud = bool(os.getenv("LIVEKIT_URL")) and not os.getenv("LOCAL_DEV")

    # Cloud doesn't support num_idle_processes or load_threshold
    if is_cloud:
        cli.run_app(
            WorkerOptions(
                entrypoint_fnc=entrypoint,
                prewarm_fnc=prewarm,
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
