"""Versioned prompt contracts for the Python voice runtimes."""

from dataclasses import dataclass


@dataclass(frozen=True)
class PromptContract:
    """Stable behavior identity for a voice prompt builder."""

    version: str
    mode: str
    round_family: str
    question_policy: str
    follow_up_policy: str
    feedback_timing: str


FULL_INTERVIEW_PROMPT_CONTRACT = PromptContract(
    version="full_interview_prompt_v1",
    mode="mock_interview",
    round_family="pm_interview",
    question_policy="selected_question_or_runtime_generated_primary",
    follow_up_policy="adaptive_grounded_follow_ups",
    feedback_timing="post_interview_only",
)

DEMO_PROMPT_CONTRACT = PromptContract(
    version="public_demo_prompt_v1",
    mode="public_demo",
    round_family="product_sense_preview",
    question_policy="one_curated_or_fallback_question",
    follow_up_policy="exactly_one_grounded_follow_up",
    feedback_timing="explicit_takeaway_only",
)


__all__ = [
    "DEMO_PROMPT_CONTRACT",
    "FULL_INTERVIEW_PROMPT_CONTRACT",
    "PromptContract",
]
