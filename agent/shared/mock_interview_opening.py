"""Canonical first audible turn for authenticated mock interviews."""

from typing import Any, Awaitable, Mapping, Protocol


ROUND_DISPLAY_NAMES = {
    "behavioral": "Behavioral",
    "product_sense": "Product Sense",
    "execution": "Execution",
    "strategy": "Strategy",
}


class MockOpeningSession(Protocol):
    def say(
        self,
        text: str,
        *,
        allow_interruptions: bool = False,
        add_to_chat_ctx: bool = True,
    ) -> Awaitable[Any]: ...


def selected_question_text(question: Mapping[str, Any] | None) -> str | None:
    """Return the canonical selected-question text when one is present."""
    if not question:
        return None
    value = question.get("question_text") or question.get("text")
    return value if isinstance(value, str) and value.strip() else None


def build_mock_interview_opening(
    round_type: str, question: Mapping[str, Any] | None = None
) -> str:
    """Build the exact first turn spoken by the full-interview runtime."""
    round_name = ROUND_DISPLAY_NAMES.get(round_type, "PM")
    article = "an" if round_name[0].lower() in "aeiou" else "a"
    introduction = (
        "Hi, I'm Meelni, and I'll be your PM interviewer today. "
        f"We're doing {article} {round_name} mock interview."
    )
    question_text = selected_question_text(question)
    if question_text:
        return f"{introduction} Here is your question: {question_text}"
    return f"{introduction} Ready to begin?"


async def speak_mock_interview_opening(
    session: MockOpeningSession,
    round_type: str,
    question: Mapping[str, Any] | None = None,
) -> str:
    """Speak and retain the canonical opening in the model's chat context."""
    opening = build_mock_interview_opening(round_type, question)
    await session.say(
        opening,
        allow_interruptions=False,
        add_to_chat_ctx=True,
    )
    return opening
