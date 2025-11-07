"""Utility to build dynamic prompts based on room metadata"""

from typing import Dict, Any
import sys
import os

# Add parent directory to path to import prompts
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from prompts import get_prompt


def build_agent_prompt(round_type: str, config: Dict[str, Any], question: Dict[str, Any] = None) -> str:
    """
    Build agent system prompt based on round type and configuration.

    Args:
        round_type: One of "behavioral", "product_sense", "execution", "strategy"
        config: Interview configuration dict with:
            - role: "interviewee" | "interviewer"
            - mode: Interview mode (mock_interview, practice, learning, etc.)
            - skill_level: For candidate persona - "junior" | "mid" | "senior"
            - persona: Optional custom persona modifier
            - duration: Interview duration in minutes (optional)
        question: Optional question dict from question bank with:
            - question_text: The interview question to ask
            - company: Company context (e.g., "Dropbox", "Meta")
            - question_type: Type of question (e.g., "Product design/strategy")

    Returns:
        Complete system prompt string

    Raises:
        ValueError: If round_type is not recognized
    """
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
    skill_level = config.get("skill_level", "mid")
    duration = config.get("duration", 30)

    # Get base prompt from new prompts.py system
    base_prompt = get_prompt(
        role=role,
        mode=mode,
        interview_type=interview_type,
        skill_level=skill_level
    )

    # Add duration context
    base_prompt += f"\n\nInterview Duration: {duration} minutes - pace yourself accordingly."

    # NEW: Add specific question from question bank if provided
    if question:
        question_text = question.get("question_text")
        company = question.get("company")
        question_type = question.get("question_type")

        base_prompt += "\n\n## INTERVIEW QUESTION FROM QUESTION BANK:"

        # Add company context if available
        if company:
            base_prompt += f"\n\nCompany Context: Imagine the candidate is interviewing at {company}."

        # Add question type context
        if question_type:
            base_prompt += f"\nQuestion Type: {question_type}"

        # Add the actual question - this is the PRIMARY question you must ask
        if question_text:
            base_prompt += f"\n\nYour PRIMARY interview question:\n\"{question_text}\""
            base_prompt += "\n\nIMPORTANT: Use this exact question as the main question in your interview. After your opening, ask this question and guide the candidate through their response using the framework appropriate to this interview type."

    # Add persona modifier if specified (backward compatibility)
    persona = config.get("persona")
    if persona:
        base_prompt += f"\n\nPersona Modifier: {persona}"

    return base_prompt
