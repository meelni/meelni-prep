"""
Meelni Demo Agent
Quick 5-minute product demo for landing page visitors
"""

import asyncio
import json
import logging
import time
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

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def build_demo_instructions(question: dict = None) -> str:
    """
    Build demo agent instructions with optional question from question bank.

    Args:
        question: Optional question dict with question_text, company, question_type

    Returns:
        Complete demo instructions string
    """
    # Base demo prompt - designed to feel spontaneous, not scripted
    base_instructions = """You're Meelni, an AI interview coach. A visitor just clicked to try a quick demo.

Your goal: Give them a 5-minute taste of what real interview practice feels like. Be direct, energetic, natural.

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
## While they answer:
- Use backchannels naturally: "mm-hmm", "got it", "interesting"
- Let them think
- If they ramble past 25 seconds: "Love it—let me jump in with some quick feedback"

## Feedback (keep it punchy):
Give 2-3 specific observations:
- One thing they nailed
- One thing to improve
- Make it real, not robotic

## Close strong:
Mention the CTA naturally: "That's what practicing with AI gets you—instant feedback, anytime. Want the full experience? Click Start Full Interview to customize your session."

## Your personality:
- Direct and confident (you're the expert)
- Warm but not overly polite
- Fast-paced, energetic
- Sound like a real coach, not a chatbot

## Important:
- NO emojis, asterisks, or markdown in speech
- Keep total time under 5 minutes (you will receive automatic time warnings)
- One question only—no follow-ups
- Don't apologize or hedge
- Handle interruptions smoothly
- When you receive a time warning, acknowledge it naturally and wrap up
- When you receive the ending message, deliver the closing remarks smoothly

## Example flow (for reference, don't copy):
"Alright, quick one. How would you improve Spotify's Discover Weekly?"

[User: 20 seconds]

"Nice. Three things: Good instinct leading with user pain. You jumped to solutions too fast though—define the problem first. And you didn't segment users, which is critical. Want more? Click Start Full Interview to get the full session."
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

                warning_msg = "We're running out of time in this demo. Let me wrap up with some quick feedback."

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

                ending_msg = "Our 5-minute demo has concluded! Ready for a full interview? Click 'Start Full Interview' to continue practicing."

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
    llm_model = "openai/gpt-4.1-mini"

    # Tessa voice (emotive, friendly)
    voice_id = "6ccbfb76-1fc6-48f7-b71d-91ac6298247b"
    tts_model = f"cartesia/sonic-3:{voice_id}"

    logger.info(f"Demo Configuration - STT: {stt_model}, LLM: {llm_model}, TTS: {tts_model}")

    # Create agent session
    session = AgentSession(
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
        room=ctx.room
    )

    logger.info("Demo agent started successfully")

    # Wait for monitoring task to complete (when session ends)
    try:
        await monitoring_task
    except asyncio.CancelledError:
        logger.info("Monitoring task cancelled")
    except Exception as e:
        logger.error(f"Monitoring task error: {e}", exc_info=True)


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name="CA_t3sKQEihMQ7x",  # Required for explicit dispatch
        ),
    )
