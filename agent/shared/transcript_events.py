"""Versioned transcript payload helpers shared by LiveKit agent handlers."""

from datetime import datetime, timezone
from typing import Dict, Literal

Speaker = Literal["user", "interviewer"]
DeliveryState = Literal["delivered", "partially_delivered"]

TRANSCRIPT_DATA_TOPIC = "transcript"
TRANSCRIPT_CONTRACT_VERSION = 2


def _iso_timestamp(epoch_seconds: float) -> str:
    if epoch_seconds <= 0:
        raise ValueError("transcript timestamps must be positive")
    timestamp = datetime.fromtimestamp(epoch_seconds, timezone.utc)
    return timestamp.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def create_transcript_event(
    *,
    event_id: str,
    sequence: int,
    session_id: str,
    room_name: str,
    speaker: Speaker,
    text: str,
    started_at: float,
    ended_at: float,
    audio_duration_ms: int,
    section: str,
    delivery_state: DeliveryState = "delivered",
) -> Dict[str, object]:
    """Create one canonical finalized transcript event."""
    if not event_id.strip() or not session_id.strip() or not room_name.strip():
        raise ValueError("transcript identity and correlation are required")
    if sequence <= 0:
        raise ValueError("transcript sequence must be positive")
    if speaker not in ("user", "interviewer"):
        raise ValueError("unsupported transcript speaker")
    if not text.strip() or not section.strip():
        raise ValueError("transcript text and section are required")
    if ended_at <= started_at or audio_duration_ms <= 0:
        raise ValueError("transcript timing must have positive duration")
    measured_duration_ms = round((ended_at - started_at) * 1000)
    if abs(measured_duration_ms - audio_duration_ms) > 1:
        raise ValueError("transcript audio duration must match its timestamps")
    if delivery_state not in ("delivered", "partially_delivered"):
        raise ValueError("unsupported transcript delivery state")

    return {
        "contract_version": TRANSCRIPT_CONTRACT_VERSION,
        "event_id": event_id,
        "sequence": sequence,
        "session_id": session_id,
        "room_name": room_name,
        "speaker": speaker,
        "text": text.strip(),
        "is_final": True,
        "started_at": _iso_timestamp(started_at),
        "ended_at": _iso_timestamp(ended_at),
        "audio_duration_ms": audio_duration_ms,
        "section": section.strip(),
        "delivery_state": delivery_state,
    }
