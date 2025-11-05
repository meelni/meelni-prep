"""
MockMate Interview Agent
Handles real-time voice interviews with LiveKit inference platform
"""

import logging
import json
from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
)
from livekit.plugins import silero
from prompts import get_prompt

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


def get_config_from_metadata(metadata: str) -> dict:
    """Parse configuration from room metadata"""
    default_config = {
        "role": "interviewee",
        "mode": "mock_interview",
        "interview_type": "product_sense",
        "voice": "79a125e8-cd45-4c13-8a67-188112f4dd22",  # Default Cartesia voice
        "skill_level": "mid",
        "stt_model": "deepgram",
        "llm_model": "openai/gpt-4o-mini",
    }

    try:
        if metadata:
            config = json.loads(metadata)
            return {**default_config, **config}
    except json.JSONDecodeError:
        logger.warning(f"Failed to parse metadata: {metadata}. Using defaults.")
    except Exception as e:
        logger.warning(f"Error parsing metadata: {e}. Using defaults.")

    return default_config


async def entrypoint(ctx: JobContext):
    """Entrypoint - reads configuration and starts agent"""
    logger.info(f"Starting agent for room: {ctx.room.name}")

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    config = get_config_from_metadata(ctx.room.metadata)

    logger.info(f"Configuration: {config}")

    # Generate prompt
    instructions = get_prompt(
        role=config["role"],
        mode=config["mode"],
        interview_type=config["interview_type"],
        skill_level=config["skill_level"]
    )

    logger.info(f"Using role: {config['role']}, mode: {config['mode']}, type: {config['interview_type']}")

    # Get models from config
    stt_model = config.get("stt_model", "deepgram")
    llm_model = config.get("llm_model", "openai/gpt-4o-mini")
    
    # For LiveKit inference, TTS is just "cartesia" (provider name only)
    # Voice ID is passed separately in the format "cartesia:{voice_id}"
    voice_id = config.get("voice", "79a125e8-cd45-4c13-8a67-188112f4dd22")
    tts_model = f"cartesia:{voice_id}"

    logger.info(f"STT Model: {stt_model}")
    logger.info(f"LLM Model: {llm_model}")
    logger.info(f"TTS Model: {tts_model}")
    logger.info("Initializing voice agent session with LiveKit inference...")

    # Create agent session with string-based model configuration
    # LiveKit inference handles all the API routing
    session = AgentSession(
        stt=stt_model,
        llm=llm_model,
        tts=tts_model,
        vad=ctx.proc.userdata["vad"],
    )

    await session.start(
        agent=InterviewAgent(instructions=instructions),
        room=ctx.room
    )

    logger.info("Voice agent started successfully with LiveKit inference")


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        ),
    )
