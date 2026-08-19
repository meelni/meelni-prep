"""Utility to build dynamic prompts based on room metadata"""

import logging
import sys
from pathlib import Path
from typing import Dict, Any

# Add parent directory to path to import shared modules
shared_dir = Path(__file__).parent.parent
sys.path.insert(0, str(shared_dir))

from prompts import get_prompt
from shared.interviewer_contracts import is_interview_brief_v2
from shared.mock_interview_opening import (
    build_mock_interview_opening,
    selected_question_text,
)
from shared.prompt_contracts import (
    FULL_INTERVIEW_PROMPT_CONTRACT,
    PromptContract,
)

logger = logging.getLogger("prompt-builder")


def build_agent_prompt(
    round_type: str,
    config: Dict[str, Any],
    question: Dict[str, Any] = None,
    prompt_contract: PromptContract = FULL_INTERVIEW_PROMPT_CONTRACT,
    interview_brief: Dict[str, Any] = None,
) -> str:
    """
    Build agent system prompt based on round type and configuration.

    Args:
        round_type: One of "behavioral", "product_sense", "execution", "strategy"
        config: Interview configuration dict with:
            - role: "interviewee" | "interviewer"
            - mode: Interview mode (mock_interview, practice, learning, etc.)
            - skill_level: For candidate persona - "junior" | "mid" | "senior"
            - duration: Interview duration in minutes (optional)
        question: Optional question dict from question bank with:
            - question_text: The interview question to ask
            - company: Company context (e.g., "Dropbox", "Meta")
            - question_type: Type of question (e.g., "Product design/strategy")
        interview_brief: Optional brief already validated against room metadata.

    Returns:
        Complete system prompt string

    Raises:
        ValueError: If round_type is not recognized
    """
    if prompt_contract != FULL_INTERVIEW_PROMPT_CONTRACT:
        raise ValueError("Unsupported full interview prompt contract")

    # Map old round_type names to new interview_type names
    interview_type_map = {
        "behavioral": "leadership_drive",
        "product_sense": "product_sense",
        "execution": "analytical_thinking",
        "strategy": "strategy",
    }

    interview_type = interview_type_map.get(round_type)
    if not interview_type:
        raise ValueError(f"Unknown round type: {round_type}")

    role = config.get("role", "interviewee")
    mode = config.get("mode", "mock_interview")
    if mode not in {
        "mock_interview",
        "practice",
        "learning",
        "feedback",
        "demonstration",
        "interactive_coaching",
        "strategy",
    }:
        mode = "mock_interview"
    skill_level = config.get("skill_level", "mid")
    duration = config.get("duration", 30)

    # Extract difficulty from config
    # Frontend uses: "beginner", "intermediate", "advanced"
    # Agent expects: "junior", "intermediate", "senior"
    # Map frontend values to agent values
    difficulty_map = {
        "beginner": "junior",
        "intermediate": "intermediate",
        "advanced": "senior",
    }
    frontend_difficulty = config.get("difficulty", "intermediate")
    difficulty = difficulty_map.get(frontend_difficulty, "intermediate")

    # Get base prompt from new prompts.py system
    base_prompt = get_prompt(
        role=role,
        mode=mode,
        interview_type=interview_type,
        skill_level=skill_level,
        difficulty=difficulty
    )

    # IMPORTANT: Add specific question FIRST (before greeting) so LLM sees it early
    question_text = selected_question_text(question)
    if question:
        # Handle both field name formats (question_text/text, question_type/type)
        company = question.get("company")
        question_type = question.get("question_type") or question.get("type")

        if question_text:
            base_prompt = "\n\n" + "=" * 80 + "\n" + base_prompt  # Move base prompt DOWN

            # Put question at ABSOLUTE TOP - first thing LLM sees
            question_header = "=" * 80
            question_header += "\n🚨 CRITICAL SYSTEM CONSTRAINT - READ FIRST 🚨"
            question_header += "\n" + "=" * 80
            question_header += "\n\nYou are LOCKED to this specific primary interview question. Do not replace it with another primary question."
            question_header += "\n\nTHE PRIMARY INTERVIEW QUESTION:"
            question_header += f"\n\n    \"{question_text}\""

            # Add company context if available
            if company:
                question_header += f"\n\nCompany Context: Candidate is interviewing at {company}."

            # Add question type context
            if question_type:
                question_header += f"\nQuestion Type: {question_type}"

            question_header += "\n\n" + "=" * 80
            question_header += "\n🚨 CONSTRAINT ENFORCEMENT:"
            question_header += "\n• The runtime has used this exact text verbatim as the primary interview question"
            question_header += "\n• You MAY ask adaptive follow-up questions grounded in what the candidate says"
            question_header += "\n• Follow-ups must stay within the scope of the primary question and must not supply an answer"
            question_header += "\n• If the candidate asks for a repeat, repeat the selected question text verbatim"
            question_header += "\n• FORBIDDEN: Changing, correcting, rephrasing, or adding/removing concepts from the selected question"
            question_header += "\n• Keep all company names, product names, and key terms exactly as written"
            question_header += "\n" + "=" * 80

            base_prompt = question_header + "\n" + base_prompt

    # Describe the deterministic opening that the runtime adds to chat context.
    # Explicit teaching/practice modes retain their separate coaching behavior.
    mode_name = mode.replace("_", " ").title()
    interview_type_name = interview_type.replace("_", " ").title()

    if mode == "mock_interview":
        opening = build_mock_interview_opening(round_type, question)
        if question_text:
            greeting_instruction = f"""

## RUNTIME-PROVIDED OPENING:

Before your first model-generated turn, the voice runtime has already spoken
this exact opening and added it to the conversation context:

"{opening}"

The selected primary question has therefore already been presented. Do not
greet again, replace it, or repeat it unless the candidate explicitly asks.
Treat a substantive candidate response as their answer to that question, then
ask one adaptive follow-up grounded in what they said. If they ask for time or
a repeat, respond neutrally without teaching, hinting, or evaluating.
"""
        else:
            greeting_instruction = f"""

## RUNTIME-PROVIDED OPENING:

Before your first model-generated turn, the voice runtime has already spoken
this exact opening and added it to the conversation context:

"{opening}"

Do not greet again. After the candidate confirms they are ready, ask one
primary {interview_type_name} question. Keep it realistic and do not teach,
hint, or evaluate.
"""
    else:
        greeting_instruction = f"""

## CRITICAL - OPENING GREETING:

When the interview session starts, YOU MUST SPEAK FIRST within 2 seconds.

Greet the candidate warmly and set the stage. Keep it brief and natural.

Example opening (adapt to your personality):
"Hey! I'm Meelni, your AI interview coach. Today we're doing a {interview_type_name} interview in {mode_name} mode. I'll ask questions and give you feedback as we go. Sound good? Ready to start?"
"""

    if mode != "mock_interview":
        greeting_instruction += """
Requirements for your greeting:
- Mention you're Meelni, the AI interview coach
- State the interview type: """ + interview_type_name + """
- State the mode: """ + mode_name + """
- Set expectations briefly
- Ask if they're ready
- Be warm but direct (no corporate fluff)
- Keep it under 15 seconds

DO NOT wait for them to speak first. YOU initiate the conversation.
"""

    base_prompt += greeting_instruction

    if interview_brief is not None and is_interview_brief_v2(interview_brief):
        base_prompt += _build_interview_brief_context(interview_brief)

    # Add duration context
    base_prompt += f"\n\nInterview Duration: {duration} minutes - pace yourself accordingly."

    logger.info(
        "Built interview prompt",
        extra={
            "round_type": round_type,
            "difficulty": difficulty,
            "has_question": bool(question_text),
            "prompt_contract_version": prompt_contract.version,
        },
    )
    return base_prompt


def _build_interview_brief_context(brief: Dict[str, Any]) -> str:
    """Project a validated brief into bounded interviewer-only constraints."""
    round_pack = brief["round_pack"]
    policy = brief["policy"]
    objectives = ", ".join(round_pack["objectives"])
    probe_families = ", ".join(round_pack["probe_families"])
    transitions = "\n".join(
        f"- {guidance}" for guidance in round_pack["transition_guidance"]
    )
    close = "\n".join(
        f"- {guidance}" for guidance in round_pack["close_guidance"]
    )
    return f"""

## PRECOMPILED INTERVIEW CONSTRAINTS ({brief['contract_version']}):

Use this round pack as a bounded objective and probe-family catalog. It is not
a script, answer key, rubric, or evaluator. Select follow-ups adaptively from
the candidate's answer; do not try to exhaust the catalog.

Objectives: {objectives}
Probe families: {probe_families}

Transition constraints:
{transitions}

Close constraints:
{close}

Authoritative policy ({policy['contract_version']}): coaching and hints are
forbidden, evaluation occurs only after the interview, and each turn asks at
most one substantive question.
"""
