"""
Meelni Demo Agent
Quick 5-minute product demo for landing page visitors
"""

import asyncio
import json
import logging
import os
import sys
import time
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
)
from livekit.plugins import silero
from livekit.plugins.turn_detector.english import EnglishModel

# Add parent directory to path for shared module imports
sys.path.insert(0, str(Path(__file__).parent.parent))

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


def build_demo_instructions(question: dict = None) -> str:
    """
    Build demo agent instructions with optional question from question bank.

    Args:
        question: Optional question dict with question_text, company, question_type

    Returns:
        Complete demo instructions string
    """
    # Base demo prompt - designed to feel spontaneous, not scripted
    base_instructions = """You're Meelni, an AI interview coach conducting a 5-minute product sense demo.

Your goal: Give them a taste of real interview practice with authentic product sense coaching.

## Opening (pick one spontaneously, don't script it):
- "Hey—got a minute? Let's do a quick round."
- "Alright, let's jump in. Ready?"
- "Quick question for you."
- "Want to try answering a real PM question?"
- "Let's see what you've got."
"""

    # NEW: If a specific question is provided, use it. Otherwise, use fallback questions.
    if question and question.get("question_text"):
        question_text = question.get("question_text")
        company = question.get("company")

        base_instructions += "\n## Your Interview Question:"
        if company:
            base_instructions += f"\nCompany context: {company}"
        base_instructions += f'\nAsk this question: "{question_text}"'
        base_instructions += "\n\nIMPORTANT: Use this exact question after your opening. This is a real question from our question bank."
    else:
        # Fallback to default demo questions if no question provided
        base_instructions += """
## Ask ONE question (pick one):
- "How would you improve Spotify's Discover Weekly?"
- "Should Instagram add a music feature?"
- "What's the first thing you'd fix about Netflix's homepage?"
- "How would you prioritize Uber's next feature?"
"""

    # Rest of the instructions remain the same
    base_instructions += """
## Product Sense Coaching Framework (Lightweight for Demo)

When they answer, listen for these key elements and coach accordingly:

**1. Clarifying Questions & Assumptions (First 10-15 seconds)**
- Did they ask any clarifying questions? (Good!)
- Did they state assumptions? (e.g., "I'll focus on [market/user type]")
- If missing: Gently probe: "What assumptions are you making?"

**2. User Focus (Core of their answer)**
- Are they thinking about specific users/segments?
- Did they create a persona or describe a real user?
- If too generic: "Who specifically are you thinking about?"
- If specific: "Nice - tell me about their pain point"

**3. Problem Before Solution**
- Did they identify a clear problem/need first?
- Or did they jump straight to features?
- If jumped to solution: "Hold on - what's the core problem you're solving?"
- If problem-focused: "Good - you led with the pain point"

**4. Strategic Rationale**
- Why does this matter for [Company]?
- Did they connect to business goals?
- If missing: "Why should [Company] build this?"
- If present: "Strong - you tied it to [Company]'s strengths"

**5. Concrete Details**
- Are they giving vague generalities or specific examples?
- Probe for: "Give me a specific scenario"
- Celebrate: "That's the level of detail I'm looking for"

## While they answer:
- Use backchannels naturally: "mm-hmm", "got it", "interesting"
- Let them think
- Interrupt constructively to coach: "Before you go further - who's the user?"
- If they ramble past 25 seconds: "Love it—let me jump in with some quick feedback"
- If they go off-script or chat casually, engage naturally like a real coach would
- Answer their questions briefly, then guide back if there's time

## Feedback (keep it punchy, use product sense lens):
Give 2-3 specific observations tied to framework:
- One strength: "You led with the user pain" or "Great assumption setting"
- One improvement: "You jumped to solutions - define the problem first" or "Be more specific on the user segment"
- One tactical tip: "Next time, try creating a quick persona" or "Ask yourself why [Company] should build this"
- Make it real, not robotic
- If they ask follow-up questions, engage naturally

## Close naturally (when time is up):
- Wrap up like a real interview coach would: "Alright, that's time. Nice work today."
- Or: "Good stuff. That's all we have time for."
- Or: "Solid answer. We'll leave it there."
- NO sales pitch, NO mention of buttons or features
- Keep it authentic like a real coaching session ending

## Your personality:
- Direct and confident (you're the expert)
- Warm but not overly polite
- Fast-paced, energetic
- Sound like a real coach, not a chatbot
- Adaptive and conversational - if they want to chat, engage briefly

## Important:
- NO emojis, asterisks, or markdown in speech
- Keep total time under 5 minutes (you will receive automatic time warnings)
- One question only—but be flexible if they have questions for you
- Don't apologize or hedge
- Handle interruptions smoothly
- When you receive a time warning, wrap up naturally
- When you receive the ending message, close like a real coach
- NEVER mention clicking buttons, features, or "full interviews"
- This should feel like a real interview practice session, period

## Example flow (for reference, don't copy):
"Alright, quick one. How would you improve Spotify's Discover Weekly?"

[User starts answering - listen for framework elements]

[If they dive into features immediately]: "Hold on - what's the core problem you're solving here?"

[If they mention users vaguely]: "Who specifically? Give me a persona"

[User continues for ~20-30 seconds]

"Got it. Three things: You led with user pain - that's strong. But you jumped to solutions too fast. Next time, spend more time on why this problem exists. Also, ask yourself why Spotify specifically should solve this. What's their unique advantage?"

[If user asks a follow-up question, engage naturally]

[At 5 minutes]: "Alright, that's time. Nice work today."
"""

    return base_instructions


class DemoAgent(Agent):
    """Demo agent with dynamic instructions based on question and time tracking"""

    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)
        self.start_time = None
        self.warning_sent = False
        self.ending_sent = False
        self.session_ended = False


def prewarm(proc: JobProcess):
    """Prewarm function to load VAD model before agent starts"""
    proc.userdata["vad"] = silero.VAD.load()


async def monitor_session_time(ctx: JobContext, demo_agent: DemoAgent, session: AgentSession):
    """
    Background task to monitor session duration and inject time warnings.

    Args:
        ctx: Job context for room access
        demo_agent: DemoAgent instance with time tracking state
        session: AgentSession for sending messages
    """
    WARNING_TIME = 285  # 4 minutes 45 seconds
    END_TIME = 300      # 5 minutes
    CHECK_INTERVAL = 5  # Check every 5 seconds

    logger.info("Time monitoring started for demo session")

    try:
        while not demo_agent.session_ended:
            await asyncio.sleep(CHECK_INTERVAL)

            if demo_agent.start_time is None:
                continue

            elapsed = time.time() - demo_agent.start_time

            # Send warning at 4:45 mark
            if elapsed >= WARNING_TIME and not demo_agent.warning_sent:
                demo_agent.warning_sent = True
                logger.info(f"Demo session at {elapsed:.1f}s - sending warning message")

                warning_msg = "We're running short on time. Let me give you some quick feedback."

                # Send message via data channel to notify agent
                await ctx.room.local_participant.publish_data(
                    json.dumps({
                        "type": "time_warning",
                        "message": warning_msg,
                        "elapsed": elapsed
                    }).encode("utf-8"),
                    topic="demo_control"
                )

            # End session at 5:00 mark
            elif elapsed >= END_TIME and not demo_agent.ending_sent:
                demo_agent.ending_sent = True
                demo_agent.session_ended = True
                logger.info(f"Demo session at {elapsed:.1f}s - sending ending message and terminating")

                ending_msg = "Alright, that's time. Nice work today!"

                # Send ending message via data channel
                await ctx.room.local_participant.publish_data(
                    json.dumps({
                        "type": "session_end",
                        "message": ending_msg,
                        "elapsed": elapsed
                    }).encode("utf-8"),
                    topic="demo_control"
                )

                # Give a moment for the message to be delivered
                await asyncio.sleep(2)

                # Gracefully disconnect from the room
                logger.info("Demo agent disconnecting from room")
                await ctx.room.disconnect()
                break

    except asyncio.CancelledError:
        logger.info("Time monitoring task cancelled")
        raise
    except Exception as e:
        logger.error(f"Error in time monitoring: {e}", exc_info=True)


async def entrypoint(ctx: JobContext):
    """Entrypoint for demo agent"""

    logger.info(f"Demo agent starting for room: {ctx.room.name}")

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # NEW: Extract question from room metadata if provided
    question = None
    try:
        room_metadata = ctx.room.metadata or "{}"
        if room_metadata and room_metadata != "{}":
            metadata = json.loads(room_metadata)
            question = metadata.get("question")

            if question:
                question_text = question.get("question_text", "")
                company = question.get("company", "N/A")
                logger.info(f"Demo using question: '{question_text[:60]}...' (Company: {company})")
            else:
                logger.info("No question provided - using default demo questions")
        else:
            logger.info("No metadata - using default demo questions")
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse demo metadata: {e}. Using default questions.")
    except Exception as e:
        logger.error(f"Error extracting question from metadata: {e}. Using default questions.")

    # NEW: Build instructions with question
    instructions = build_demo_instructions(question)

    # Fixed configuration optimized for demos
    stt_model = "deepgram/nova-3"
    llm_model = "openai/gpt-4o"

    # ElevenLabs voice via LiveKit Inference (no API key needed)
    # Voice ID: cgSgspJ2msm6clMCkdW9
    # Format: elevenlabs/model:voiceId
    voice_id = "cgSgspJ2msm6clMCkdW9"
    tts_model = f"elevenlabs/eleven_turbo_v2_5:{voice_id}"

    logger.info(f"Demo Configuration - STT: {stt_model}, LLM: {llm_model}, TTS: {tts_model}")

    # Create agent session with turn detection
    session = AgentSession(
        turn_detection=EnglishModel(),  # Context-aware turn detection
        stt=stt_model,
        llm=llm_model,
        tts=tts_model,
        vad=ctx.proc.userdata["vad"],
    )

    # NEW: Create DemoAgent instance with time tracking
    demo_agent = DemoAgent(instructions=instructions)

    # Initialize start time when agent is ready
    demo_agent.start_time = time.time()
    logger.info(f"Demo session timer started at {demo_agent.start_time}")

    # Start background time monitoring task
    monitoring_task = asyncio.create_task(
        monitor_session_time(ctx, demo_agent, session)
    )

    # NEW: Pass demo_agent instance to session
    await session.start(
        agent=demo_agent,
        room=ctx.room,
        record=False,
    )

    logger.info("Demo agent started successfully")

    # CRITICAL: Send initial greeting for demo
    greeting = "Hey! Ready to try a quick PM question?"

    try:
        await session.say(greeting)
        logger.info(f"Demo greeting sent: {greeting}")
    except Exception as e:
        logger.error(f"Failed to send demo greeting: {e}", exc_info=True)

    # Wait for monitoring task to complete (when session ends)
    try:
        await monitoring_task
    except asyncio.CancelledError:
        logger.info("Monitoring task cancelled")
    except Exception as e:
        logger.error(f"Monitoring task error: {e}", exc_info=True)


if __name__ == "__main__":
    is_cloud = bool(os.getenv("LIVEKIT_URL")) and not os.getenv("LOCAL_DEV")
    agent_name = get_required_env("LIVEKIT_DEMO_AGENT_NAME") if is_cloud else None

    options = {
        "entrypoint_fnc": entrypoint,
        "prewarm_fnc": prewarm,
    }
    if agent_name:
        options["agent_name"] = agent_name

    cli.run_app(WorkerOptions(**options))
