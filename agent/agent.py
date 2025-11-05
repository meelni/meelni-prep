"""
MockMate Interview Agent
Handles real-time voice interviews using LiveKit Agents framework
"""

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
)
from livekit.plugins import silero

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class InterviewAgent(Agent):
    """PM Interview Coach Agent"""
    
    def __init__(self) -> None:
        super().__init__(
            instructions="You are an experienced PM interviewer. Conduct a realistic, time-boxed mock interview. "
            "Ask one question at a time, use brief backchannels, probe for metrics, constraints, trade-offs, and risks. "
            "Keep tone professional but supportive. Speak naturally without using emojis, asterisks, or markdown."
        )


def prewarm(proc: JobProcess):
    """Prewarm function to load VAD model before agent starts"""
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext):
    """
    Entrypoint for the agent - called when a new participant joins
    """
    logger.info(f"Starting agent for room: {ctx.room.name}")

    # Wait for the first participant to connect
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    logger.info("Initializing voice agent session...")

    # Create agent session with model specifications
    session = AgentSession(
        stt="deepgram",  # Speech-to-Text
        llm="openai/gpt-4o-mini",  # Language Model (using gpt-4o-mini which is available)
        tts="cartesia",  # Text-to-Speech
        vad=ctx.proc.userdata["vad"],  # Voice Activity Detection
    )

    # Start the session
    await session.start(agent=InterviewAgent(), room=ctx.room)

    logger.info("Voice agent started successfully")


if __name__ == "__main__":
    # Run the agent worker
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        ),
    )
