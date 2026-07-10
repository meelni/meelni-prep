"""Signed, in-memory transcript ingest for the LiveKit interview runtime."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Awaitable, Callable, Dict, Literal, Mapping
from urllib.parse import urlsplit
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from .transcript_events import MAX_SAFE_INTEGER, is_transcript_event

INGEST_KEY_CONTEXT = b"meelni/transcript-ingest/v1"
TIMESTAMP_HEADER = "x-meelni-timestamp"
SIGNATURE_HEADER = "x-meelni-signature"
INTERRUPTION_MARKER_CONTRACT_VERSION = 1
INTERRUPTION_MARKER_EVENT_TYPE = "integrity_unavailable"
INTERRUPTION_MARKER_REASONS = {
    "no_provider_confirmed_prefix",
    "canonicalization_failed",
}
RUNTIME_SETTLEMENT_CONTRACT_VERSION = 1
RUNTIME_SETTLEMENT_EVENT_TYPE = "runtime_settlement"
CANONICAL_TIMESTAMP = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"
)

Transport = Callable[[str, bytes, Mapping[str, str]], Awaitable["IngestResponse"]]
Publisher = Callable[[Dict[str, object]], Awaitable[None]]
Sleep = Callable[[float], Awaitable[None]]
Now = Callable[[], float]
ItemKind = Literal["transcript", "interruption_marker", "runtime_settlement"]
ItemState = Literal["pending", "persisted", "complete", "permanent"]


@dataclass(frozen=True)
class IngestResponse:
    """The HTTP facts needed by the queue without binding it to an HTTP client."""

    status: int

    def __post_init__(self) -> None:
        if isinstance(self.status, bool) or not isinstance(self.status, int):
            raise ValueError("ingest response status must be an integer")
        if self.status < 100 or self.status > 599:
            raise ValueError("ingest response status is outside the HTTP range")


@dataclass(frozen=True)
class PermanentFailure:
    event_id: str
    kind: ItemKind
    attempts: int
    status: int | None
    reason: str


@dataclass(frozen=True)
class FlushResult:
    complete: int
    pending: int
    permanent: int
    timed_out: bool

    @property
    def settled(self) -> bool:
        return self.pending == 0 and self.permanent == 0


@dataclass
class _QueueItem:
    event_id: str
    kind: ItemKind
    canonical_payload: bytes
    transcript_event: Dict[str, object] | None
    state: ItemState = "pending"
    attempts: int = 0
    last_status: int | None = None
    last_error: str | None = None


class TranscriptIngestError(ValueError):
    """Base error for invalid queue configuration or input."""


class TranscriptIngestQueueFull(TranscriptIngestError):
    """Raised when the bounded job-local identity ledger is full."""


class TranscriptIngestIdentityConflict(TranscriptIngestError):
    """Raised when one event identity is reused for different content."""


class TranscriptIngestQueueSealed(TranscriptIngestError):
    """Raised when new evidence arrives after the terminal drain boundary."""


async def post_ingest_request(
    url: str,
    body: bytes,
    headers: Mapping[str, str],
) -> IngestResponse:
    """POST an already-signed body without reserializing it."""

    def _post() -> IngestResponse:
        request = Request(url, data=body, headers=dict(headers), method="POST")
        try:
            with urlopen(request, timeout=10) as response:
                return IngestResponse(status=response.status)
        except HTTPError as error:
            return IngestResponse(status=error.code)

    return await asyncio.to_thread(_post)


def canonical_json_bytes(value: object) -> bytes:
    """Serialize a stable compact JSON body for signing and comparison."""
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise TranscriptIngestError("ingest payload is not canonical JSON") from error


def derive_ingest_signing_key(livekit_api_secret: str | bytes) -> bytes:
    """Derive a domain-separated request key from the LiveKit API secret."""
    if isinstance(livekit_api_secret, str):
        secret = livekit_api_secret.encode("utf-8")
    elif isinstance(livekit_api_secret, bytes):
        secret = livekit_api_secret
    else:
        raise TranscriptIngestError("LIVEKIT_API_SECRET must be text or bytes")
    if not secret:
        raise TranscriptIngestError("LIVEKIT_API_SECRET must not be empty")
    return hmac.new(secret, INGEST_KEY_CONTEXT, hashlib.sha256).digest()


def sign_ingest_body(signing_key: bytes, timestamp: int, body: bytes) -> str:
    """Sign ``<epoch-seconds>.<raw-body>`` with HMAC-SHA256."""
    if not isinstance(signing_key, bytes) or not signing_key:
        raise TranscriptIngestError("signing key must be non-empty bytes")
    if isinstance(timestamp, bool) or not isinstance(timestamp, int) or timestamp <= 0:
        raise TranscriptIngestError("ingest timestamp must be a positive integer")
    if not isinstance(body, bytes):
        raise TranscriptIngestError("ingest body must be bytes")
    message = str(timestamp).encode("ascii") + b"." + body
    return hmac.new(signing_key, message, hashlib.sha256).hexdigest()


def validate_internal_ingest_url(value: str) -> str:
    """Require HTTPS, except plain HTTP on loopback for local development."""
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        raise TranscriptIngestError("transcript ingest URL must be non-empty")
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        _ = parsed.port
    except ValueError as error:
        raise TranscriptIngestError("transcript ingest URL is invalid") from error

    if (
        not hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path != "/api/internal/transcript"
    ):
        raise TranscriptIngestError("transcript ingest URL is invalid")

    loopback = hostname.lower() in {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme != "https" and not (parsed.scheme == "http" and loopback):
        raise TranscriptIngestError(
            "transcript ingest URL must use HTTPS outside local development"
        )
    return value


def _canonical_iso_timestamp(epoch_seconds: float) -> str:
    if isinstance(epoch_seconds, bool) or not isinstance(epoch_seconds, (int, float)):
        raise TranscriptIngestError("marker timestamp must be numeric")
    if epoch_seconds <= 0:
        raise TranscriptIngestError("marker timestamp must be positive")
    try:
        parsed = datetime.fromtimestamp(epoch_seconds, timezone.utc)
    except (OverflowError, OSError, ValueError) as error:
        raise TranscriptIngestError("marker timestamp is invalid") from error
    return parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _is_canonical_timestamp(value: object) -> bool:
    if not isinstance(value, str) or not CANONICAL_TIMESTAMP.fullmatch(value):
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return parsed.timestamp() > 0 and _canonical_iso_timestamp(parsed.timestamp()) == value


def is_interruption_marker(value: object) -> bool:
    """Validate the no-text marker kept outside transcript consumers."""
    if not isinstance(value, dict):
        return False
    expected_fields = {
        "contract_version",
        "event_type",
        "event_id",
        "writer_id",
        "sequence",
        "session_id",
        "room_name",
        "speaker",
        "occurred_at",
        "reason",
    }
    sequence = value.get("sequence")
    return (
        set(value) == expected_fields
        and value.get("contract_version") == INTERRUPTION_MARKER_CONTRACT_VERSION
        and value.get("event_type") == INTERRUPTION_MARKER_EVENT_TYPE
        and isinstance(value.get("event_id"), str)
        and bool(value["event_id"].strip())
        and isinstance(value.get("writer_id"), str)
        and bool(value["writer_id"].strip())
        and isinstance(sequence, int)
        and not isinstance(sequence, bool)
        and 0 < sequence <= MAX_SAFE_INTEGER
        and isinstance(value.get("session_id"), str)
        and bool(value["session_id"].strip())
        and isinstance(value.get("room_name"), str)
        and bool(value["room_name"].strip())
        and value.get("speaker") in {"user", "interviewer"}
        and _is_canonical_timestamp(value.get("occurred_at"))
        and value.get("reason") in INTERRUPTION_MARKER_REASONS
    )


def create_interruption_marker(
    *,
    event_id: str,
    writer_id: str,
    sequence: int,
    session_id: str,
    room_name: str,
    speaker: str = "interviewer",
    reason: str = "no_provider_confirmed_prefix",
    occurred_at: float,
) -> Dict[str, object]:
    """Create a textless marker for unavailable transcript integrity."""
    marker: Dict[str, object] = {
        "contract_version": INTERRUPTION_MARKER_CONTRACT_VERSION,
        "event_type": INTERRUPTION_MARKER_EVENT_TYPE,
        "event_id": event_id,
        "writer_id": writer_id,
        "sequence": sequence,
        "session_id": session_id,
        "room_name": room_name,
        "speaker": speaker,
        "occurred_at": _canonical_iso_timestamp(occurred_at),
        "reason": reason,
    }
    if not is_interruption_marker(marker):
        raise TranscriptIngestError("invalid interruption marker")
    return marker


def is_runtime_settlement(value: object) -> bool:
    """Validate metadata-only proof that the runtime reached a drain boundary."""
    if not isinstance(value, dict):
        return False
    return (
        set(value)
        == {
            "contract_version",
            "event_type",
            "session_id",
            "room_name",
            "writer_id",
            "state",
            "settled_at",
        }
        and value.get("contract_version") == RUNTIME_SETTLEMENT_CONTRACT_VERSION
        and value.get("event_type") == RUNTIME_SETTLEMENT_EVENT_TYPE
        and isinstance(value.get("session_id"), str)
        and bool(value["session_id"].strip())
        and isinstance(value.get("room_name"), str)
        and bool(value["room_name"].strip())
        and isinstance(value.get("writer_id"), str)
        and bool(value["writer_id"].strip())
        and value.get("state") in {"settled", "degraded"}
        and _is_canonical_timestamp(value.get("settled_at"))
    )


def create_runtime_settlement(
    *,
    session_id: str,
    room_name: str,
    writer_id: str,
    state: str,
    settled_at: float,
) -> Dict[str, object]:
    settlement: Dict[str, object] = {
        "contract_version": RUNTIME_SETTLEMENT_CONTRACT_VERSION,
        "event_type": RUNTIME_SETTLEMENT_EVENT_TYPE,
        "session_id": session_id,
        "room_name": room_name,
        "writer_id": writer_id,
        "state": state,
        "settled_at": _canonical_iso_timestamp(settled_at),
    }
    if not is_runtime_settlement(settlement):
        raise TranscriptIngestError("invalid runtime settlement")
    return settlement


def is_retryable_status(status: int) -> bool:
    return status in {408, 425, 429} or 500 <= status <= 599


class TranscriptIngestQueue:
    """Bounded job-local queue that persists before publishing transcripts."""

    def __init__(
        self,
        *,
        ingest_url: str,
        livekit_api_secret: str | bytes,
        transport: Transport,
        publisher: Publisher,
        max_size: int = 1_000,
        retry_delay_seconds: float = 0.25,
        sleep: Sleep = asyncio.sleep,
        now: Now = time.time,
    ) -> None:
        if isinstance(max_size, bool) or not isinstance(max_size, int) or max_size <= 0:
            raise TranscriptIngestError("transcript queue max_size must be positive")
        if (
            isinstance(retry_delay_seconds, bool)
            or not isinstance(retry_delay_seconds, (int, float))
            or retry_delay_seconds < 0
        ):
            raise TranscriptIngestError("retry delay must be non-negative")
        if not callable(transport) or not callable(publisher) or not callable(sleep):
            raise TranscriptIngestError("queue adapters must be callable")

        self.ingest_url = validate_internal_ingest_url(ingest_url)
        self._signing_key = derive_ingest_signing_key(livekit_api_secret)
        self._transport = transport
        self._publisher = publisher
        self._max_size = max_size
        self._retry_delay_seconds = float(retry_delay_seconds)
        self._sleep = sleep
        self._now = now
        self._items: Dict[str, _QueueItem] = {}
        self._flush_lock = asyncio.Lock()
        self._sealed = False

    @property
    def size(self) -> int:
        return len(self._items)

    @property
    def pending_count(self) -> int:
        return sum(item.state in {"pending", "persisted"} for item in self._items.values())

    @property
    def permanent_failures(self) -> tuple[PermanentFailure, ...]:
        return tuple(
            PermanentFailure(
                event_id=item.event_id,
                kind=item.kind,
                attempts=item.attempts,
                status=item.last_status,
                reason=item.last_error or "permanent_ingest_failure",
            )
            for item in self._items.values()
            if item.state == "permanent"
        )

    @property
    def runtime_settlement_complete(self) -> bool:
        return any(
            item.kind == "runtime_settlement" and item.state == "complete"
            for item in self._items.values()
        )

    def enqueue_transcript(self, event: Dict[str, object]) -> bool:
        self._require_open()
        if not is_transcript_event(event):
            raise TranscriptIngestError("invalid canonical transcript event")
        session_id = str(event["session_id"])
        envelope: Dict[str, object] = {"sessionId": session_id, "event": event}
        return self._enqueue(
            event_id=str(event["event_id"]),
            kind="transcript",
            envelope=envelope,
        )

    def enqueue_interruption_marker(self, marker: Dict[str, object]) -> bool:
        self._require_open()
        if not is_interruption_marker(marker):
            raise TranscriptIngestError("invalid interruption marker")
        session_id = str(marker["session_id"])
        envelope: Dict[str, object] = {
            "sessionId": session_id,
            "interruptionMarker": marker,
        }
        return self._enqueue(
            event_id=str(marker["event_id"]),
            kind="interruption_marker",
            envelope=envelope,
        )

    def seal_and_enqueue_runtime_settlement(
        self, settlement: Dict[str, object]
    ) -> bool:
        if not is_runtime_settlement(settlement):
            raise TranscriptIngestError("invalid runtime settlement")
        self._sealed = True
        session_id = str(settlement["session_id"])
        return self._enqueue(
            event_id=f"runtime-settlement:{session_id}",
            kind="runtime_settlement",
            envelope={"sessionId": session_id, "settlement": settlement},
        )

    def _require_open(self) -> None:
        if self._sealed:
            raise TranscriptIngestQueueSealed(
                "transcript ingest queue is sealed at runtime settlement"
            )

    def _enqueue(
        self,
        *,
        event_id: str,
        kind: ItemKind,
        envelope: Dict[str, object],
    ) -> bool:
        canonical_payload = canonical_json_bytes(envelope)
        existing = self._items.get(event_id)
        if existing is not None:
            if existing.kind != kind or existing.canonical_payload != canonical_payload:
                raise TranscriptIngestIdentityConflict(
                    "transcript ingest identity was reused for different content"
                )
            return False
        if len(self._items) >= self._max_size:
            raise TranscriptIngestQueueFull("transcript ingest queue is full")
        frozen_envelope = json.loads(canonical_payload.decode("utf-8"))
        frozen_transcript = (
            frozen_envelope["event"] if kind == "transcript" else None
        )
        self._items[event_id] = _QueueItem(
            event_id=event_id,
            kind=kind,
            canonical_payload=canonical_payload,
            transcript_event=frozen_transcript,
        )
        return True

    async def flush(self, timeout_seconds: float) -> FlushResult:
        """Retry pending work until it settles or the bounded wait expires."""
        if (
            isinstance(timeout_seconds, bool)
            or not isinstance(timeout_seconds, (int, float))
            or timeout_seconds <= 0
        ):
            raise TranscriptIngestError("flush timeout must be positive")

        timed_out = False
        try:
            await asyncio.wait_for(self._flush_pending(), timeout=float(timeout_seconds))
        except asyncio.TimeoutError:
            timed_out = True
        return self._flush_result(timed_out=timed_out)

    async def _flush_pending(self) -> None:
        async with self._flush_lock:
            while True:
                pending = [
                    item
                    for item in self._items.values()
                    if item.state in {"pending", "persisted"}
                ]
                if not pending:
                    return
                retry = False
                for item in pending:
                    retry = await self._deliver(item) or retry
                if retry and any(
                    item.state in {"pending", "persisted"}
                    for item in self._items.values()
                ):
                    await self._sleep(self._retry_delay_seconds)

    async def _deliver(self, item: _QueueItem) -> bool:
        if item.state == "persisted":
            return await self._publish_persisted(item)

        timestamp = int(self._now())
        if timestamp <= 0:
            raise TranscriptIngestError("request clock returned an invalid timestamp")
        headers = {
            "content-type": "application/json",
            TIMESTAMP_HEADER: str(timestamp),
            SIGNATURE_HEADER: sign_ingest_body(
                self._signing_key,
                timestamp,
                item.canonical_payload,
            ),
        }
        item.attempts += 1
        try:
            response = await self._transport(
                self.ingest_url,
                item.canonical_payload,
                headers,
            )
        except Exception as error:
            item.last_status = None
            item.last_error = type(error).__name__
            return True

        if not isinstance(response, IngestResponse):
            raise TranscriptIngestError("transport returned an invalid response")
        item.last_status = response.status
        if 200 <= response.status <= 299:
            item.last_error = None
            if item.kind != "transcript":
                item.state = "complete"
                return False
            item.state = "persisted"
            return await self._publish_persisted(item)

        if is_retryable_status(response.status):
            item.last_error = f"retryable_http_{response.status}"
            return True

        item.state = "permanent"
        item.last_error = f"permanent_http_{response.status}"
        return False

    async def _publish_persisted(self, item: _QueueItem) -> bool:
        if item.transcript_event is None:
            raise TranscriptIngestError("persisted transcript item has no event")
        try:
            await self._publisher(item.transcript_event)
        except Exception as error:
            item.last_error = f"publish_{type(error).__name__}"
            return True
        item.last_error = None
        item.state = "complete"
        return False

    def _flush_result(self, *, timed_out: bool) -> FlushResult:
        states = [item.state for item in self._items.values()]
        return FlushResult(
            complete=states.count("complete"),
            pending=states.count("pending") + states.count("persisted"),
            permanent=states.count("permanent"),
            timed_out=timed_out,
        )
