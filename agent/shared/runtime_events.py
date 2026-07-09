"""Provider-neutral lifecycle fact contract emitted by interview runtimes."""

from datetime import datetime
from typing import Any, Dict, Optional


INTERVIEW_RUNTIME_EVENT_CONTRACT_VERSION = 1
INTERVIEW_RUNTIME_EVENT_TOPIC = "interview.lifecycle.v1"
INTERVIEW_RUNTIME_EVENT_TYPES = {
    "runtime_provisioned",
    "runtime_activated",
    "connection_lost",
    "connection_restored",
    "provider_failed",
}


def create_runtime_event(
    *,
    event_id: str,
    session_id: str,
    event_type: str,
    occurred_at: str,
    runtime_ref: Optional[Dict[str, str]] = None,
    failure: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build and validate one versioned runtime lifecycle fact."""
    if not event_id.strip() or not session_id.strip():
        raise ValueError("Runtime lifecycle events require event and session IDs")
    if event_type not in INTERVIEW_RUNTIME_EVENT_TYPES:
        raise ValueError("Unknown runtime lifecycle event type")
    _validate_iso_timestamp(occurred_at)

    if runtime_ref is not None and (
        not runtime_ref.get("provider", "").strip()
        or not runtime_ref.get("id", "").strip()
    ):
        raise ValueError("Runtime references require provider and id")

    if event_type == "provider_failed":
        if not failure or failure.get("reason") != "provider_failure":
            raise ValueError("Provider failure events require failure details")
        if not str(failure.get("code", "")).strip() or not isinstance(
            failure.get("retryable"), bool
        ):
            raise ValueError("Provider failure details are malformed")
    elif failure is not None:
        raise ValueError("Failure details are only valid for provider failures")

    event: Dict[str, Any] = {
        "contract_version": INTERVIEW_RUNTIME_EVENT_CONTRACT_VERSION,
        "event_id": event_id,
        "session_id": session_id,
        "type": event_type,
        "occurred_at": occurred_at,
    }
    if runtime_ref is not None:
        event["runtime_ref"] = runtime_ref
    if failure is not None:
        event["failure"] = failure
    return event


def _validate_iso_timestamp(value: str) -> None:
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError) as error:
        raise ValueError("Runtime lifecycle events require an ISO timestamp") from error
