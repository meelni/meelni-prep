"""Transcript payload helpers shared by LiveKit agent handlers."""

from time import time
from typing import Dict, Literal

Speaker = Literal["user", "interviewer"]

TRANSCRIPT_DATA_TOPIC = "transcript"


def create_transcript_event(
    *,
    speaker: Speaker,
    text: str,
    timestamp: float | None = None,
    is_final: bool = True,
) -> Dict[str, object]:
    """Create the data-track payload consumed by the Next.js LiveKit room."""
    return {
        "speaker": speaker,
        "text": text,
        "timestamp": time() if timestamp is None else timestamp,
        "is_final": is_final,
    }
