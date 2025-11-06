"""Utility to build dynamic prompts based on room metadata"""

from typing import Dict, Any
import sys
import os

# Add parent directory to path to import prompts
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from prompts import get_prompt


def build_agent_prompt(round_type: str, config: Dict[str, Any]) -> str:
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

    # Add persona modifier if specified (backward compatibility)
    persona = config.get("persona")
    if persona:
        base_prompt += f"\n\nPersona Modifier: {persona}"

    return base_prompt
