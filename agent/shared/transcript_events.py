"""Versioned transcript payload helpers shared by LiveKit agent handlers."""

import json
import re
from datetime import datetime, timezone
from typing import Dict, Literal

Speaker = Literal["user", "interviewer"]
DeliveryState = Literal["delivered", "partially_delivered"]

TRANSCRIPT_DATA_TOPIC = "transcript"
TRANSCRIPT_CONTRACT_VERSION = 2
MAX_SAFE_INTEGER = 9_007_199_254_740_991
CANONICAL_TIMESTAMP = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"
)


def _iso_timestamp(epoch_seconds: float) -> str:
    if isinstance(epoch_seconds, bool) or not isinstance(epoch_seconds, (int, float)):
        raise ValueError("transcript timestamps must be numeric")
    if epoch_seconds <= 0:
        raise ValueError("transcript timestamps must be positive")
    timestamp = datetime.fromtimestamp(epoch_seconds, timezone.utc)
    return timestamp.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _parse_canonical_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not CANONICAL_TIMESTAMP.fullmatch(value):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        canonical = _iso_timestamp(parsed.timestamp())
    except ValueError:
        return None
    return parsed if canonical == value else None


def _is_safe_positive_integer(value: object) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and 0 < value <= MAX_SAFE_INTEGER
    )


def is_transcript_event(value: object) -> bool:
    if not isinstance(value, dict):
        return False

    started_at = _parse_canonical_timestamp(value.get("started_at"))
    ended_at = _parse_canonical_timestamp(value.get("ended_at"))
    audio_duration_ms = value.get("audio_duration_ms")
    if started_at is None or ended_at is None or ended_at <= started_at:
        return False
    if not _is_safe_positive_integer(audio_duration_ms):
        return False

    measured_duration_ms = round((ended_at - started_at).total_seconds() * 1000)
    return (
        value.get("contract_version") == TRANSCRIPT_CONTRACT_VERSION
        and isinstance(value.get("event_id"), str)
        and bool(value["event_id"].strip())
        and isinstance(value.get("writer_id"), str)
        and bool(value["writer_id"].strip())
        and _is_safe_positive_integer(value.get("sequence"))
        and isinstance(value.get("session_id"), str)
        and bool(value["session_id"].strip())
        and isinstance(value.get("room_name"), str)
        and bool(value["room_name"].strip())
        and value.get("speaker") in ("user", "interviewer")
        and isinstance(value.get("text"), str)
        and bool(value["text"].strip())
        and value.get("is_final") is True
        and abs(measured_duration_ms - audio_duration_ms) <= 1
        and isinstance(value.get("section"), str)
        and bool(value["section"].strip())
        and value.get("delivery_state") in ("delivered", "partially_delivered")
    )


def create_transcript_event(
    *,
    event_id: str,
    writer_id: str,
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
    event: Dict[str, object] = {
        "contract_version": TRANSCRIPT_CONTRACT_VERSION,
        "event_id": event_id,
        "writer_id": writer_id,
        "sequence": sequence,
        "session_id": session_id,
        "room_name": room_name,
        "speaker": speaker,
        "text": text.strip() if isinstance(text, str) else text,
        "is_final": True,
        "started_at": _iso_timestamp(started_at),
        "ended_at": _iso_timestamp(ended_at),
        "audio_duration_ms": audio_duration_ms,
        "section": section.strip() if isinstance(section, str) else section,
        "delivery_state": delivery_state,
    }
    if not is_transcript_event(event):
        raise ValueError("invalid transcript event")
    return event


def create_transcript_event_from_message(
    *,
    message: object,
    writer_id: str,
    sequence: int,
    session_id: str,
    room_name: str,
    section: str,
) -> Dict[str, object] | None:
    """Normalize one committed LiveKit ChatMessage without importing LiveKit."""
    role = getattr(message, "role", None)
    if role not in ("user", "assistant"):
        return None
    if role == "assistant" and getattr(message, "interrupted", False):
        return None

    metrics = getattr(message, "metrics", None)
    if not isinstance(metrics, dict):
        return None
    started_at = metrics.get("started_speaking_at")
    ended_at = metrics.get("stopped_speaking_at")
    text = getattr(message, "text_content", None)
    message_id = getattr(message, "id", None)
    if (
        not isinstance(text, str)
        or not text.strip()
        or not isinstance(message_id, str)
        or not message_id.strip()
        or isinstance(started_at, bool)
        or not isinstance(started_at, (int, float))
        or isinstance(ended_at, bool)
        or not isinstance(ended_at, (int, float))
        or ended_at <= started_at
    ):
        return None

    return create_transcript_event(
        event_id=f"{writer_id}:{message_id}",
        writer_id=writer_id,
        sequence=sequence,
        session_id=session_id,
        room_name=room_name,
        speaker="user" if role == "user" else "interviewer",
        text=text,
        started_at=started_at,
        ended_at=ended_at,
        audio_duration_ms=round((ended_at - started_at) * 1000),
        section=section,
    )


async def publish_transcript_event(local_participant: object, event: Dict[str, object]) -> None:
    """Publish one already-validated event through the LiveKit participant adapter."""
    publish_data = getattr(local_participant, "publish_data")
    await publish_data(
        json.dumps(event).encode("utf-8"),
        topic=TRANSCRIPT_DATA_TOPIC,
    )
