"""Utility to build dynamic prompts based on room metadata"""

from typing import Dict, Any
import sys
import os

# Add parent directory to path to import prompts
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from prompts import behavioral, product_sense, execution, strategy


def build_agent_prompt(round_type: str, config: Dict[str, Any]) -> str:
    """
    Build agent system prompt based on round type and configuration.

    Args:
        round_type: One of "behavioral", "product_sense", "execution", "strategy"
        config: Interview configuration dict with:
            - difficulty: "beginner" | "intermediate" | "advanced"
            - persona: Optional custom persona modifier
            - feedback_mode: "real_time" | "end_only" | "silent"
            - duration: Interview duration in minutes (optional)

    Returns:
        Complete system prompt string

    Raises:
        ValueError: If round_type is not recognized
    """
    difficulty = config.get("difficulty", "intermediate")
    persona = config.get("persona")
    feedback_mode = config.get("feedback_mode", "end_only")
    duration = config.get("duration", 30)

    # Get base prompt for round type
    if round_type == "behavioral":
        base_prompt = behavioral.get_behavioral_prompt(difficulty)
    elif round_type == "product_sense":
        base_prompt = product_sense.get_product_sense_prompt(difficulty)
    elif round_type == "execution":
        base_prompt = execution.get_execution_prompt(difficulty)
    elif round_type == "strategy":
        base_prompt = strategy.get_strategy_prompt(difficulty)
    else:
        raise ValueError(f"Unknown round type: {round_type}")

    # Add duration context
    base_prompt += f"\n\nInterview Duration: {duration} minutes - pace yourself accordingly."

    # Add persona modifier if specified
    if persona:
        base_prompt += f"\n\nPersona Modifier: {persona}"

    # Add feedback mode instructions
    if feedback_mode == "real_time":
        base_prompt += """

Feedback Mode: REAL-TIME
- Provide brief, constructive feedback after each major response
- Keep feedback concise (1-2 sentences)
- Balance positive and constructive
- Example: "Good use of the STAR method there. For the Result section, try to include more specific metrics."
"""
    elif feedback_mode == "silent":
        base_prompt += """

Feedback Mode: SILENT
- Do NOT provide any feedback during the interview
- Stay in character as a professional interviewer
- Save all feedback for the post-interview evaluation
- Focus on asking good follow-up questions
"""
    else:  # end_only (default)
        base_prompt += """

Feedback Mode: END ONLY
- Do NOT provide feedback during the interview
- At the end, you may provide a brief 2-3 sentence summary if asked
- Keep it high-level: "You did well on X, work on Y"
- Save detailed feedback for the post-interview evaluation
"""

    return base_prompt


def get_sample_question(round_type: str) -> str:
    """
    Get a sample question for the given round type.

    Args:
        round_type: One of "behavioral", "product_sense", "execution", "strategy"

    Returns:
        A sample question string

    Raises:
        ValueError: If round_type is not recognized
    """
    if round_type == "behavioral":
        return behavioral.get_sample_questions(count=1)[0]
    elif round_type == "product_sense":
        return product_sense.get_sample_question()
    elif round_type == "execution":
        return execution.get_sample_question()
    elif round_type == "strategy":
        return strategy.get_sample_question()
    else:
        raise ValueError(f"Unknown round type: {round_type}")
