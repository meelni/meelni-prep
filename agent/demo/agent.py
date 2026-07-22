"""
Meelni Demo Agent
Two-minute voice preview for landing page visitors
"""

import asyncio
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

from demo.runtime import (
    CONTROL_PUBLISH_TIMEOUT_SECONDS,
    GREETING_TIMEOUT_SECONDS,
    LOCAL_SESSION_CLOSE_TIMEOUT_SECONDS,
    ROOM_CONNECT_TIMEOUT_SECONDS,
    ROOM_DELETE_TIMEOUT_SECONDS,
    SESSION_END_DELIVERY_GRACE_SECONDS,
    SESSION_END_PUBLISH_TIMEOUT_SECONDS,
    SESSION_START_TIMEOUT_SECONDS,
    TAKEAWAY_TIMEOUT_SECONDS,
    parse_demo_room_metadata,
    resolve_demo_deadline,
    resolve_demo_participant_identity,
    run_bounded,
    run_optional,
    stop_then_run_bounded,
)
from shared.candidate_presence import wait_for_candidate_before_greeting
from shared.dispatch import resolve_cli_dispatch_name
from shared.prompt_contracts import DEMO_PROMPT_CONTRACT, PromptContract
from shared.safe_logging import log_exception_class

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


def build_demo_instructions(
    question: dict = None,
    prompt_contract: PromptContract = DEMO_PROMPT_CONTRACT,
) -> str:
    """
    Build demo agent instructions with optional question from question bank.

    Args:
        question: Optional question dict with question_text, company, question_type

    Returns:
        Complete demo instructions string
    """
    if prompt_contract != DEMO_PROMPT_CONTRACT:
        raise ValueError("Unsupported public demo prompt contract")

    # Base demo prompt - designed to feel spontaneous, not scripted
    base_instructions = """You're Meelni, an AI interview coach conducting a two-minute product sense voice preview.

Your goal: Give them a taste of real interview practice with authentic product sense coaching.

## Opening (pick one spontaneously, don't script it):
- "Hey—got a minute? Let's try a quick question."
- "Alright, let's jump in. Ready?"
- "Quick question for you."
- "Want to try answering a PM-style practice question?"
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
        base_instructions += "\n\nIMPORTANT: Use this exact curated question after your opening."
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
## Product Sense Interviewer Lens (Lightweight for Demo)

When they answer, listen for these key elements. Use them only to choose one
grounded follow-up. Do not coach, evaluate, or give feedback yet:

**1. Clarifying Questions & Assumptions**
- Did they ask any clarifying questions?
- Did they state assumptions? (e.g., "I'll focus on [market/user type]")

**2. User Focus (Core of their answer)**
- Are they thinking about specific users/segments?
- Did they create a persona or describe a real user?

**3. Problem Before Solution**
- Did they identify a clear problem/need first?
- Or did they jump straight to features?

**4. Strategic Rationale**
- Why does this matter for [Company]?
- Did they connect to business goals?
- If missing: "Why should [Company] build this?"
- If present: "Strong - you tied it to [Company]'s strengths"

**5. Concrete Details**
- Are they giving vague generalities or specific examples?

## Required interview sequence:
- Ask the one curated or fallback practice question.
- Let the participant answer without hints, coaching, or evaluation.
- Ask exactly one realistic follow-up before the takeaway window.
- Base that follow-up only on something the participant actually said. Refer to
  their stated user, problem, assumption, tradeoff, or proposal rather than
  inventing a premise.
- Do not ask a second practice question.
- After the follow-up answer, continue listening until the system explicitly
  asks you to deliver the takeaway.

## While they answer:
- Use backchannels naturally: "mm-hmm", "got it", "interesting"
- Let them think
- If they ramble, use the one grounded follow-up to focus them on a specific
  part of what they already said
- If they go off-script or chat casually, redirect briefly to the same question
- Answer their questions briefly, then guide back if there's time

## Takeaway boundary:
- Do not give feedback, evaluation, strengths, improvements, tactical tips, or
  coaching before the system's explicit takeaway instruction.
- Only give the takeaway when the system explicitly asks for it. Follow that
  instruction as the single concise takeaway for this preview.
- Never add a second feedback segment after that takeaway.

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
- Keep total time under two minutes (you will receive an automatic wrap-up warning)
- One practice question and exactly one grounded follow-up
- Don't apologize or hedge
- Handle interruptions smoothly
- When you receive the takeaway instruction, give only the requested takeaway
- When you receive the ending message, close like a real coach
- NEVER mention clicking buttons, features, or "full interviews"
- This should feel like a real interview practice session, period

## Example flow (for reference, don't copy):
"Alright, quick one. How would you improve Spotify's Discover Weekly?"

[User starts answering - listen for framework elements]

[Grounded follow-up based on their answer]: "You focused on new listeners. What is the most important problem Discover Weekly should solve for them?"

[User answers the follow-up]

[Wait for the system's explicit takeaway instruction. Do not give early feedback.]

[Give the single system-requested takeaway, then close naturally.]

[At 2 minutes]: "Alright, that's time. Nice work today."
"""

    return base_instructions


class DemoAgent(Agent):
    """Demo agent with dynamic instructions based on question and time tracking"""

    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)
        self.warning_sent = False
        self.ending_sent = False
        self.session_ended = False


def prewarm(proc: JobProcess):
    """Prewarm function to load VAD model before agent starts"""
    proc.userdata["vad"] = silero.VAD.load()


class RoomDeletionGuard:
    """Delete a demo room at most once across deadline and final cleanup."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._deleted = False

    async def delete(self, ctx: JobContext) -> None:
        async with self._lock:
            if self._deleted:
                return
            await ctx.delete_room()
            self._deleted = True


class LocalSessionStopGuard:
    """Stop local model/audio work once, even if startup is still in flight."""

    def __init__(self) -> None:
        self._session = None
        self._stopped = False
        self._session_closed = False
        self._lock = asyncio.Lock()
        self._context_shutdown = False

    async def attach(self, session: AgentSession) -> None:
        async with self._lock:
            self._session = session
            if self._stopped:
                await self._close_session()

    async def stop(self) -> None:
        async with self._lock:
            self._stopped = True
            if self._session is not None and not self._session_closed:
                await self._close_session()

    async def _close_session(self) -> None:
        self._session.shutdown(drain=False)
        try:
            await asyncio.wait_for(
                self._session.aclose(),
                timeout=LOCAL_SESSION_CLOSE_TIMEOUT_SECONDS,
            )
            self._session_closed = True
        except asyncio.TimeoutError:
            logger.warning("Demo local session close exceeded its hard bound")
        except Exception as error:
            log_exception_class(
                logger,
                logging.WARNING,
                "Demo local session close failed",
                error,
            )

    def shutdown_context(self, ctx: JobContext, reason: str) -> None:
        if self._context_shutdown:
            return
        self._context_shutdown = True
        ctx.shutdown(reason)


async def publish_demo_control(
    ctx: JobContext,
    payload: dict,
    timeout_seconds: float = CONTROL_PUBLISH_TIMEOUT_SECONDS,
) -> None:
    await asyncio.wait_for(
        ctx.room.local_participant.publish_data(
            json.dumps(payload).encode("utf-8"),
            topic="demo_control",
        ),
        timeout=timeout_seconds,
    )


async def wait_for_speech(handle, timeout_seconds: int) -> None:
    try:
        await asyncio.wait_for(handle.wait_for_playout(), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        handle.interrupt()
        raise


async def deliver_evidence_based_takeaway(session: AgentSession) -> None:
    handle = session.generate_reply(
        instructions=(
            "Give the participant one concise takeaway now. Base every observation "
            "only on words the participant actually said in this room's conversation. "
            "Name one evidenced strength and one evidenced improvement. If there is not "
            "enough participant evidence, say that plainly and give one general next-step "
            "tip without pretending they demonstrated anything. Do not invent quotes, "
            "claims, or behavior. Finish in no more than three short sentences."
        ),
        allow_interruptions=False,
    )
    await wait_for_speech(handle, TAKEAWAY_TIMEOUT_SECONDS)


async def monitor_session_time(
    ctx: JobContext,
    demo_agent: DemoAgent,
    session: AgentSession,
    deadline,
):
    """Generate a bounded, evidence-based takeaway before the hard deadline."""
    try:
        await asyncio.sleep(max(0, deadline.warning_at - time.monotonic()))
        if demo_agent.session_ended:
            return
        demo_agent.warning_sent = True
        logger.info("Demo takeaway window started")
        try:
            await publish_demo_control(ctx, {"type": "time_warning"})
        except Exception as error:
            log_exception_class(
                logger, logging.WARNING, "Could not publish demo time warning", error
            )
        try:
            await deliver_evidence_based_takeaway(session)
        except asyncio.TimeoutError:
            logger.warning("Demo takeaway exceeded its bounded delivery window")
        except Exception as error:
            log_exception_class(
                logger, logging.ERROR, "Demo takeaway generation failed", error
            )
    except asyncio.CancelledError:
        raise


async def enforce_hard_deadline(
    ctx: JobContext,
    deadline,
    deletion_guard: RoomDeletionGuard,
    stop_guard: LocalSessionStopGuard,
) -> None:
    """Delete the room on a monotonic deadline, independent of speech work."""
    # Begin the bounded control-message attempt early enough that neither its
    # timeout nor the delivery grace can extend the provider-spend boundary.
    notify_at = deadline.session_end_notify_at(
        SESSION_END_DELIVERY_GRACE_SECONDS
        + LOCAL_SESSION_CLOSE_TIMEOUT_SECONDS
    )
    await asyncio.sleep(max(0, notify_at - time.monotonic()))
    logger.info("Demo hard-stop notification window started")
    try:
        await publish_demo_control(
            ctx,
            {"type": "session_end", "message": "That's the preview."},
            timeout_seconds=SESSION_END_PUBLISH_TIMEOUT_SECONDS,
        )
    except Exception as error:
        log_exception_class(
            logger, logging.WARNING, "Could not publish demo session end", error
        )
    finally:
        await stop_guard.stop()
        await asyncio.sleep(max(0, deadline.ends_at - time.monotonic()))
        logger.info("Deleting demo room at the hard deadline")
        try:
            await run_bounded(
                lambda: deletion_guard.delete(ctx),
                ROOM_DELETE_TIMEOUT_SECONDS,
            )
        finally:
            stop_guard.shutdown_context(
                ctx, "public voice preview hard deadline"
            )


async def entrypoint(ctx: JobContext):
    """Entrypoint for demo agent"""

    logger.info("Demo agent starting")

    deletion_guard = RoomDeletionGuard()
    stop_guard = LocalSessionStopGuard()
    background_tasks = []

    try:
        await run_bounded(
            lambda: ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY),
            ROOM_CONNECT_TIMEOUT_SECONDS,
        )
        metadata = parse_demo_room_metadata(ctx.room.metadata)
        if not metadata:
            logger.warning("Failed to parse demo metadata")

        deadline = resolve_demo_deadline(
            metadata,
            wall_now=time.time(),
            monotonic_now=time.monotonic(),
        )
        participant_identity = resolve_demo_participant_identity(metadata)
        hard_deadline_task = asyncio.create_task(
            enforce_hard_deadline(ctx, deadline, deletion_guard, stop_guard)
        )
        background_tasks.append(hard_deadline_task)

        if participant_identity is None:
            logger.warning("Demo participant identity is unavailable")
            return
        participant = await wait_for_candidate_before_greeting(
            wait_for_participant=ctx.wait_for_participant,
            candidate_identity=participant_identity,
            deadline_task=hard_deadline_task,
        )
        if participant is None:
            return

        question = metadata.get("question")
        if question:
            logger.info("Demo question context loaded")
        else:
            logger.info("No question provided - using default demo questions")

        instructions = build_demo_instructions(question)

        stt_model = "deepgram/nova-3"
        llm_model = "openai/gpt-4o"
        voice_id = "cgSgspJ2msm6clMCkdW9"
        tts_model = f"elevenlabs/eleven_turbo_v2_5:{voice_id}"
        logger.info(
            "Demo Configuration - STT: %s, LLM: %s, TTS: %s",
            stt_model,
            llm_model,
            tts_model,
        )

        session = AgentSession(
            turn_detection=EnglishModel(),
            stt=stt_model,
            llm=llm_model,
            tts=tts_model,
            vad=ctx.proc.userdata["vad"],
        )
        await stop_guard.attach(session)
        demo_agent = DemoAgent(instructions=instructions)
        monitoring_task = asyncio.create_task(
            monitor_session_time(ctx, demo_agent, session, deadline)
        )
        background_tasks.append(monitoring_task)

        await asyncio.wait_for(
            session.start(agent=demo_agent, room=ctx.room, record=False),
            timeout=SESSION_START_TIMEOUT_SECONDS,
        )
        logger.info("Demo agent started successfully")

        demo_ready_published = await run_optional(
            lambda: publish_demo_control(
                ctx,
                {
                    "type": "demo_ready",
                    "remaining_seconds": deadline.remaining_seconds(
                        time.monotonic()
                    ),
                },
            )
        )
        if not demo_ready_published:
            logger.warning("Could not publish demo ready control message")

        greeting = "Hey! Ready to try a quick PM question?"
        try:
            await wait_for_speech(
                session.say(greeting, allow_interruptions=True),
                GREETING_TIMEOUT_SECONDS,
            )
            logger.info("Demo greeting sent")
        except asyncio.TimeoutError:
            logger.warning("Demo greeting exceeded its bounded delivery window")

        await hard_deadline_task
    finally:
        for task in background_tasks:
            if not task.done():
                task.cancel()
        if background_tasks:
            await asyncio.gather(*background_tasks, return_exceptions=True)
        try:
            await stop_then_run_bounded(
                stop_guard.stop,
                lambda: deletion_guard.delete(ctx),
                ROOM_DELETE_TIMEOUT_SECONDS,
            )
        except Exception as error:
            log_exception_class(
                logger,
                logging.ERROR,
                "Failed to delete demo room during top-level cleanup",
                error,
            )
        finally:
            stop_guard.shutdown_context(ctx, "public voice preview cleanup")


if __name__ == "__main__":
    # Asset builds use a non-routable sentinel; every worker command still
    # requires its environment-owned explicit dispatch name.
    agent_name = resolve_cli_dispatch_name("LIVEKIT_DEMO_AGENT_NAME")

    options = {
        "entrypoint_fnc": entrypoint,
        "prewarm_fnc": prewarm,
        "agent_name": agent_name,
    }

    cli.run_app(WorkerOptions(**options))
