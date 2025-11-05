"""
MockMate Interview Agent
Handles real-time voice interviews using LiveKit Agents framework
"""

import logging
from dotenv import load_dotenv
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
    llm,
)
from livekit.plugins import openai, deepgram, cartesia
import livekit.agents as agents

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def entrypoint(ctx: JobContext):
    """
    Entrypoint for the agent - called when a new participant joins
    """
    logger.info(f"Starting agent for room: {ctx.room.name}")
    
    # Wait for the first participant to connect
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    
    # Create initial context for the interviewer
    initial_context = llm.ChatContext().append(
        role="system",
        text=(
            "You are an experienced product manager interviewer conducting a mock interview. "
            "Your goal is to help the candidate practice and improve. "
            "Ask one question at a time, listen carefully, and ask relevant follow-up questions. "
            "Be professional, supportive, and probe for details like metrics, trade-offs, and reasoning. "
            "Keep responses concise and conversational."
        ),
    )
    
    logger.info("Initializing voice assistant pipeline...")
    
    # Configure the voice pipeline
    assistant = agents.VoiceAssistant(
        vad=agents.vad.Silero(),  # Voice Activity Detection
        stt=deepgram.STT(),  # Speech-to-Text (Deepgram)
        llm=openai.LLM(model="gpt-4"),  # Language Model
        tts=cartesia.TTS(),  # Text-to-Speech (Cartesia)
        chat_ctx=initial_context,
    )
    
    # Start the assistant
    assistant.start(ctx.room)
    
    # Greet the candidate
    await assistant.say(
        "Hello! I'm your AI interview coach. I'm here to help you practice for your PM interview. Are you ready to begin?", 
        allow_interruptions=True
    )
    
    logger.info("Voice assistant started successfully")


if __name__ == "__main__":
    # Run the agent worker
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
        ),
    )
