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
from uuid import UUID

from .transcript_events import MAX_SAFE_INTEGER, is_transcript_event
from .runtime_events import is_runtime_event

INGEST_KEY_CONTEXT = b"meelni/transcript-ingest/v1"
TRANSCRIPT_INGEST_SECRET_ENV = "MEELNI_TRANSCRIPT_INGEST_SECRET"
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
RUNTIME_WRITER_REGISTRATION_CONTRACT_VERSION = 1
RUNTIME_WRITER_REGISTRATION_EVENT_TYPE = "runtime_writer_registration"
RUNTIME_SETTLEMENT_REQUEST_CONTRACT_VERSION = 1
RUNTIME_SETTLEMENT_REQUEST_EVENT_TYPE = "runtime_settlement_request"
RUNTIME_SETTLEMENT_REQUEST_TOPIC = "meelni.transcript.settlement.request"
MAX_INGEST_RESPONSE_BYTES = 4_096
CANONICAL_TIMESTAMP = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"
)

Transport = Callable[[str, bytes, Mapping[str, str]], Awaitable["IngestResponse"]]
Publisher = Callable[[Dict[str, object]], Awaitable[None]]
Sleep = Callable[[float], Awaitable[None]]
Now = Callable[[], float]
ItemKind = Literal[
    "transcript", "interruption_marker", "runtime_settlement", "runtime_event"
]
ItemState = Literal["pending", "persisted", "complete", "permanent"]
WriterSequenceKind = Literal["transcript", "interruption_marker"]


@dataclass(frozen=True)
class IngestResponse:
    """The HTTP facts needed by the queue without binding it to an HTTP client."""

    status: int
    body: bytes | None = None

    def __post_init__(self) -> None:
        if isinstance(self.status, bool) or not isinstance(self.status, int):
            raise ValueError("ingest response status must be an integer")
        if self.status < 100 or self.status > 599:
            raise ValueError("ingest response status is outside the HTTP range")
        if self.body is not None and not isinstance(self.body, bytes):
            raise ValueError("ingest response body must be bytes when present")


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
    evidence_ended_at: datetime | None = None
    state: ItemState = "pending"
    attempts: int = 0
    last_status: int | None = None
    last_error: str | None = None
    transport_task: asyncio.Task[IngestResponse] | None = None


@dataclass(frozen=True)
class RuntimeSettlementDispatch:
    """One bounded settlement operation and whether this call started it."""

    task: asyncio.Task[object]
    started: bool


class TranscriptIngestError(ValueError):
    """Base error for invalid queue configuration or input."""


class TranscriptIngestQueueFull(TranscriptIngestError):
    """Raised when the bounded job-local identity ledger is full."""


class TranscriptIngestIdentityConflict(TranscriptIngestError):
    """Raised when one event identity is reused for different content."""


class TranscriptIngestQueueSealed(TranscriptIngestError):
    """Raised when new evidence arrives after the terminal drain boundary."""


class TranscriptIngestAfterCutoff(TranscriptIngestError):
    """Raised when evidence claims media or occurrence after the active cutoff."""


class WriterSequenceAllocator:
    """Allocate one monotonic namespace for every evidence kind from a writer.

    Event identity is retained so an in-process replay receives its original
    sequence. Reusing an identity for a different evidence kind fails closed.
    """

    def __init__(self) -> None:
        self._next_sequence = 1
        self._allocations: Dict[str, tuple[WriterSequenceKind, int]] = {}

    def allocate(self, *, event_id: str, kind: WriterSequenceKind) -> int:
        if not isinstance(event_id, str) or not event_id.strip():
            raise TranscriptIngestError("writer sequence identity is invalid")
        if kind not in ("transcript", "interruption_marker"):
            raise TranscriptIngestError("writer sequence kind is invalid")

        existing = self._allocations.get(event_id)
        if existing is not None:
            existing_kind, sequence = existing
            if existing_kind != kind:
                raise TranscriptIngestIdentityConflict(
                    "writer sequence identity was reused across evidence kinds"
                )
            return sequence

        if self._next_sequence > MAX_SAFE_INTEGER:
            raise TranscriptIngestQueueFull("writer sequence namespace is exhausted")
        sequence = self._next_sequence
        self._allocations[event_id] = (kind, sequence)
        self._next_sequence += 1
        return sequence


def should_record_unconfirmed_interruption(
    *, scheduled: bool, interrupted: bool, has_confirmed_prefix: bool
) -> bool:
    """Record uncertainty only for speech that reached the playout schedule."""
    return scheduled and interrupted and not has_confirmed_prefix


def resolve_transcript_ingest_secret(env: Mapping[str, str]) -> str:
    """Prefer the cross-service ingest key over provider-owned credentials."""
    for name in (TRANSCRIPT_INGEST_SECRET_ENV, "LIVEKIT_API_SECRET"):
        value = env.get(name)
        if isinstance(value, str) and value.strip():
            return value.strip()
    raise TranscriptIngestError("transcript ingest signing secret is unavailable")


class RuntimeSettlementRequestLedger:
    """Bound and deduplicate metadata-only server settlement request identities."""

    def __init__(self, max_size: int = 64) -> None:
        if isinstance(max_size, bool) or not isinstance(max_size, int) or max_size <= 0:
            raise TranscriptIngestError("settlement request ledger size must be positive")
        self._max_size = max_size
        self._requests: Dict[str, bytes] = {}

    def accept(self, request: Dict[str, object]) -> bool:
        request_id = request.get("request_id") if isinstance(request, dict) else None
        if not isinstance(request_id, str) or not request_id.strip():
            raise TranscriptIngestError("invalid runtime settlement request identity")
        canonical = canonical_json_bytes(request)
        existing = self._requests.get(request_id)
        if existing is not None:
            if existing != canonical:
                raise TranscriptIngestIdentityConflict(
                    "runtime settlement request identity conflict"
                )
            return False
        if len(self._requests) >= self._max_size:
            raise TranscriptIngestQueueFull("runtime settlement request ledger is full")
        self._requests[request_id] = canonical
        return True


class RuntimeSettlementRequestDispatcher:
    """Single-flight exact settlement requests in a bounded identity ledger."""

    def __init__(self, max_size: int = 64) -> None:
        self._ledger = RuntimeSettlementRequestLedger(max_size=max_size)
        self._tasks: Dict[str, asyncio.Task[object]] = {}
        self._closed = False

    def close(self) -> None:
        """Fence new work before shutdown snapshots active tasks."""
        self._closed = True

    def prepare(
        self,
        request: Dict[str, object],
        operation: Callable[[], Awaitable[object]],
    ) -> RuntimeSettlementDispatch:
        if self._closed:
            raise TranscriptIngestQueueSealed(
                "runtime settlement request dispatcher is closed"
            )
        if not callable(operation):
            raise TranscriptIngestError("settlement replay operation must be callable")
        self._ledger.accept(request)
        request_id = str(request["request_id"])
        existing = self._tasks.get(request_id)
        if existing is not None:
            if not existing.done():
                return RuntimeSettlementDispatch(task=existing, started=False)
            if not existing.cancelled() and existing.exception() is None:
                return RuntimeSettlementDispatch(task=existing, started=False)

        async def replay() -> object:
            result = operation()
            if not hasattr(result, "__await__"):
                raise TranscriptIngestError(
                    "settlement replay operation must be awaitable"
                )
            return await result

        task = asyncio.create_task(replay())
        self._tasks[request_id] = task
        return RuntimeSettlementDispatch(task=task, started=True)


async def finish_tasks_before_shutdown(
    tasks: tuple[asyncio.Task[object], ...],
    timeout_seconds: float,
) -> int:
    """Join bounded background work, then cancel and await every straggler."""
    if (
        isinstance(timeout_seconds, bool)
        or not isinstance(timeout_seconds, (int, float))
        or timeout_seconds <= 0
    ):
        raise TranscriptIngestError("shutdown task timeout must be positive")
    active = tuple(task for task in tasks if not task.done())
    if not active:
        return 0
    _, pending = await asyncio.wait(active, timeout=float(timeout_seconds))
    for task in pending:
        task.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)
    return len(pending)


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
                response_body = response.read(MAX_INGEST_RESPONSE_BYTES + 1)
                if len(response_body) > MAX_INGEST_RESPONSE_BYTES:
                    response_body = None
                return IngestResponse(status=response.status, body=response_body)
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
    return _parse_canonical_timestamp(value) is not None


def _parse_canonical_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not CANONICAL_TIMESTAMP.fullmatch(value):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return (
        parsed
        if parsed.timestamp() > 0
        and _canonical_iso_timestamp(parsed.timestamp()) == value
        else None
    )


def is_interruption_marker(value: object) -> bool:
    """Validate the no-text marker kept outside transcript consumers."""
    if not isinstance(value, dict):
        return False
    expected_fields = {
        "contract_version",
        "event_type",
        "event_id",
        "writer_id",
        "writer_generation",
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
        and isinstance(value.get("writer_generation"), int)
        and not isinstance(value["writer_generation"], bool)
        and 0 < value["writer_generation"] <= MAX_SAFE_INTEGER
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


def interruption_marker_degrades_candidate_evidence(
    *, speaker: object, reason: object
) -> bool:
    """Keep only the exact textless interviewer interruption non-degrading."""
    return not (
        speaker == "interviewer" and reason == "no_provider_confirmed_prefix"
    )


def create_interruption_marker(
    *,
    event_id: str,
    writer_id: str,
    writer_generation: int,
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
        "writer_generation": writer_generation,
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
            "writer_generation",
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
        and isinstance(value.get("writer_generation"), int)
        and not isinstance(value["writer_generation"], bool)
        and 0 < value["writer_generation"] <= MAX_SAFE_INTEGER
        and value.get("state") in {"settled", "degraded"}
        and _is_canonical_timestamp(value.get("settled_at"))
    )


def create_runtime_settlement(
    *,
    session_id: str,
    room_name: str,
    writer_id: str,
    writer_generation: int,
    state: str,
    settled_at: float,
) -> Dict[str, object]:
    settlement: Dict[str, object] = {
        "contract_version": RUNTIME_SETTLEMENT_CONTRACT_VERSION,
        "event_type": RUNTIME_SETTLEMENT_EVENT_TYPE,
        "session_id": session_id,
        "room_name": room_name,
        "writer_id": writer_id,
        "writer_generation": writer_generation,
        "state": state,
        "settled_at": _canonical_iso_timestamp(settled_at),
    }
    if not is_runtime_settlement(settlement):
        raise TranscriptIngestError("invalid runtime settlement")
    return settlement


def is_runtime_writer_registration(value: object) -> bool:
    """Validate the metadata-only pre-output writer registration."""
    return (
        isinstance(value, dict)
        and set(value)
        == {
            "contract_version",
            "event_type",
            "session_id",
            "room_name",
            "writer_id",
            "registered_at",
        }
        and value.get("contract_version")
        == RUNTIME_WRITER_REGISTRATION_CONTRACT_VERSION
        and value.get("event_type") == RUNTIME_WRITER_REGISTRATION_EVENT_TYPE
        and isinstance(value.get("session_id"), str)
        and bool(value["session_id"].strip())
        and isinstance(value.get("room_name"), str)
        and bool(value["room_name"].strip())
        and isinstance(value.get("writer_id"), str)
        and bool(value["writer_id"].strip())
        and _is_canonical_timestamp(value.get("registered_at"))
    )


def create_runtime_writer_registration(
    *,
    session_id: str,
    room_name: str,
    writer_id: str,
    registered_at: float,
) -> Dict[str, object]:
    registration: Dict[str, object] = {
        "contract_version": RUNTIME_WRITER_REGISTRATION_CONTRACT_VERSION,
        "event_type": RUNTIME_WRITER_REGISTRATION_EVENT_TYPE,
        "session_id": session_id,
        "room_name": room_name,
        "writer_id": writer_id,
        "registered_at": _canonical_iso_timestamp(registered_at),
    }
    if not is_runtime_writer_registration(registration):
        raise TranscriptIngestError("invalid runtime writer registration")
    return registration


def parse_runtime_settlement_request(
    *,
    data: bytes,
    topic: str | None,
    sent_by_server: bool,
    reliable: bool,
    expected_session_id: str,
    expected_room_name: str,
    expected_writer_generation: int,
    hard_deadline_at: datetime | None,
) -> Dict[str, object] | None:
    """Authenticate and normalize a server-SDK settlement data packet."""
    if topic != RUNTIME_SETTLEMENT_REQUEST_TOPIC:
        return None
    if not sent_by_server or not reliable:
        raise TranscriptIngestError("untrusted runtime settlement request")
    if not isinstance(data, bytes) or not data or len(data) > MAX_INGEST_RESPONSE_BYTES:
        raise TranscriptIngestError("invalid runtime settlement request")
    try:
        value = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise TranscriptIngestError("invalid runtime settlement request") from error
    expected_fields = {
        "contract_version",
        "event_type",
        "session_id",
        "room_name",
        "writer_generation",
        "request_id",
        "cutoff_at",
    }
    if not isinstance(value, dict) or set(value) != expected_fields:
        raise TranscriptIngestError("invalid runtime settlement request")
    generation = value.get("writer_generation")
    cutoff = _parse_canonical_timestamp(value.get("cutoff_at"))
    if (
        value.get("contract_version") != RUNTIME_SETTLEMENT_REQUEST_CONTRACT_VERSION
        or value.get("event_type") != RUNTIME_SETTLEMENT_REQUEST_EVENT_TYPE
        or value.get("session_id") != expected_session_id
        or value.get("room_name") != expected_room_name
        or not isinstance(value.get("request_id"), str)
        or not value["request_id"].strip()
        or isinstance(generation, bool)
        or generation != expected_writer_generation
        or cutoff is None
        or (
            hard_deadline_at is not None
            and cutoff > hard_deadline_at.astimezone(timezone.utc)
        )
    ):
        raise TranscriptIngestError("invalid runtime settlement request")
    return value


def is_retryable_status(status: int) -> bool:
    return status in {408, 425, 429} or 500 <= status <= 599


def parse_persisted_transcript_row_id(data: bytes | None) -> str | None:
    """Read the durable row identity from a successful turn acknowledgement."""
    if not data or len(data) > MAX_INGEST_RESPONSE_BYTES:
        return None
    try:
        value = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if (
        not isinstance(value, dict)
        or value.get("success") is not True
        or value.get("kind") != "turn"
        or not isinstance(value.get("row_id"), str)
    ):
        return None
    try:
        return str(UUID(value["row_id"]))
    except ValueError:
        return None


async def register_runtime_writer(
    *,
    ingest_url: str,
    livekit_api_secret: str | bytes,
    registration: Dict[str, object],
    transport: Transport,
    attempts: int = 5,
    retry_delay_seconds: float = 0.25,
    sleep: Sleep = asyncio.sleep,
    now: Now = time.time,
) -> int:
    """Register a stable writer identity before output and return its generation."""
    if not is_runtime_writer_registration(registration):
        raise TranscriptIngestError("invalid runtime writer registration")
    if isinstance(attempts, bool) or not isinstance(attempts, int) or attempts <= 0:
        raise TranscriptIngestError("registration attempts must be positive")
    if (
        isinstance(retry_delay_seconds, bool)
        or not isinstance(retry_delay_seconds, (int, float))
        or retry_delay_seconds < 0
    ):
        raise TranscriptIngestError("registration retry delay must be non-negative")
    if not callable(transport) or not callable(sleep) or not callable(now):
        raise TranscriptIngestError("registration adapters must be callable")

    validated_url = validate_internal_ingest_url(ingest_url)
    signing_key = derive_ingest_signing_key(livekit_api_secret)
    session_id = str(registration["session_id"])
    body = canonical_json_bytes(
        {"sessionId": session_id, "writerRegistration": registration}
    )

    for attempt in range(attempts):
        timestamp = int(now())
        if timestamp <= 0:
            raise TranscriptIngestError("request clock returned an invalid timestamp")
        headers = {
            "content-type": "application/json",
            TIMESTAMP_HEADER: str(timestamp),
            SIGNATURE_HEADER: sign_ingest_body(signing_key, timestamp, body),
        }
        try:
            response = await transport(validated_url, body, headers)
        except Exception as error:
            if attempt + 1 >= attempts:
                raise TranscriptIngestError(
                    "runtime writer registration unavailable"
                ) from error
            await sleep(float(retry_delay_seconds))
            continue
        if not isinstance(response, IngestResponse):
            raise TranscriptIngestError("transport returned an invalid response")
        if is_retryable_status(response.status):
            if attempt + 1 >= attempts:
                raise TranscriptIngestError("runtime writer registration unavailable")
            await sleep(float(retry_delay_seconds))
            continue
        if not 200 <= response.status <= 299 or response.body is None:
            raise TranscriptIngestError("runtime writer registration rejected")
        try:
            response_value = json.loads(response.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise TranscriptIngestError(
                "runtime writer registration response was invalid"
            ) from error
        generation = (
            response_value.get("writer_generation")
            if isinstance(response_value, dict)
            else None
        )
        if (
            not isinstance(response_value, dict)
            or response_value.get("success") is not True
            or response_value.get("kind") != "writer_registration"
            or response_value.get("disposition") not in {"created", "existing"}
            or isinstance(generation, bool)
            or not isinstance(generation, int)
            or generation <= 0
            or generation > MAX_SAFE_INTEGER
        ):
            raise TranscriptIngestError(
                "runtime writer registration response was invalid"
            )
        return generation

    raise TranscriptIngestError("runtime writer registration unavailable")


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
        hard_evidence_cutoff: float | None = None,
        retry_delay_seconds: float = 0.25,
        sleep: Sleep = asyncio.sleep,
        now: Now = time.time,
    ) -> None:
        if isinstance(max_size, bool) or not isinstance(max_size, int) or max_size < 2:
            raise TranscriptIngestError(
                "transcript queue max_size must reserve evidence and control capacity"
            )
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
        self._data_capacity = max_size - 1
        self._retry_delay_seconds = float(retry_delay_seconds)
        self._sleep = sleep
        self._now = now
        self._items: Dict[str, _QueueItem] = {}
        self._flush_lock = asyncio.Lock()
        self._sealed = False
        self._evidence_cutoff: datetime | None = None
        self._hard_evidence_cutoff = (
            _parse_canonical_timestamp(_canonical_iso_timestamp(hard_evidence_cutoff))
            if hard_evidence_cutoff is not None
            else None
        )
        self._post_cutoff_evidence = False

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

    @property
    def post_cutoff_evidence(self) -> bool:
        return self._post_cutoff_evidence

    def set_evidence_cutoff(self, cutoff_at: float) -> None:
        """Freeze admissible evidence at the first semantic settlement cutoff."""
        parsed = _parse_canonical_timestamp(_canonical_iso_timestamp(cutoff_at))
        if parsed is None:
            raise TranscriptIngestError("invalid evidence cutoff")
        if self._evidence_cutoff is None:
            self._evidence_cutoff = parsed
        elif self._evidence_cutoff != parsed:
            raise TranscriptIngestIdentityConflict(
                "runtime settlement cutoff cannot change"
            )
        effective_cutoff = self._effective_evidence_cutoff()
        for item in self._items.values():
            if (
                item.evidence_ended_at is None
                or effective_cutoff is None
                or item.evidence_ended_at <= effective_cutoff
            ):
                continue
            self._post_cutoff_evidence = True
            if item.state in {"pending", "persisted"}:
                item.state = "permanent"
                item.last_error = "evidence_after_cutoff"

    def _effective_evidence_cutoff(self) -> datetime | None:
        cutoffs = tuple(
            cutoff
            for cutoff in (self._evidence_cutoff, self._hard_evidence_cutoff)
            if cutoff is not None
        )
        return min(cutoffs) if cutoffs else None

    def enqueue_transcript(
        self,
        event: Dict[str, object],
        *,
        measured_ended_at: float | None = None,
    ) -> bool:
        self._require_open()
        if not is_transcript_event(event):
            raise TranscriptIngestError("invalid canonical transcript event")
        evidence_ended_at = _parse_canonical_timestamp(event["ended_at"])
        if measured_ended_at is not None:
            if (
                isinstance(measured_ended_at, bool)
                or not isinstance(measured_ended_at, (int, float))
                or measured_ended_at <= 0
            ):
                raise TranscriptIngestError("invalid measured evidence timestamp")
            try:
                evidence_ended_at = datetime.fromtimestamp(
                    measured_ended_at, timezone.utc
                )
            except (OverflowError, OSError, ValueError) as error:
                raise TranscriptIngestError(
                    "invalid measured evidence timestamp"
                ) from error
        session_id = str(event["session_id"])
        envelope: Dict[str, object] = {"sessionId": session_id, "event": event}
        return self._enqueue(
            event_id=str(event["event_id"]),
            kind="transcript",
            envelope=envelope,
            evidence_ended_at=evidence_ended_at,
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
            evidence_ended_at=_parse_canonical_timestamp(marker["occurred_at"]),
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
            evidence_ended_at=None,
        )

    def enqueue_runtime_event(self, event: Dict[str, object]) -> bool:
        if not is_runtime_event(event) or event.get("type") != "provider_failed":
            raise TranscriptIngestError("invalid runtime lifecycle event")
        session_id = str(event["session_id"])
        return self._enqueue(
            event_id=str(event["event_id"]),
            kind="runtime_event",
            envelope={"sessionId": session_id, "runtimeEvent": event},
            evidence_ended_at=None,
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
        evidence_ended_at: datetime | None,
    ) -> bool:
        canonical_payload = canonical_json_bytes(envelope)
        existing = self._items.get(event_id)
        if existing is not None:
            if existing.kind != kind or existing.canonical_payload != canonical_payload:
                raise TranscriptIngestIdentityConflict(
                    "transcript ingest identity was reused for different content"
                )
            return False
        effective_cutoff = self._effective_evidence_cutoff()
        if (
            evidence_ended_at is not None
            and effective_cutoff is not None
            and evidence_ended_at > effective_cutoff
        ):
            self._post_cutoff_evidence = True
            raise TranscriptIngestAfterCutoff(
                "transcript evidence occurred after the settlement cutoff"
            )
        data_items = sum(
            item.kind != "runtime_settlement" for item in self._items.values()
        )
        if kind != "runtime_settlement" and data_items >= self._data_capacity:
            raise TranscriptIngestQueueFull("transcript ingest queue is full")
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
            evidence_ended_at=evidence_ended_at,
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
                # A degraded settlement is the control-plane acknowledgement that
                # lets the web tier stop waiting when evidence transport is hung.
                pending.sort(key=lambda item: item.kind != "runtime_settlement")
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

        transport_task = item.transport_task
        if transport_task is None or transport_task.cancelled():
            timestamp = int(self._now())
            if timestamp <= 0:
                raise TranscriptIngestError(
                    "request clock returned an invalid timestamp"
                )
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
            transport_task = asyncio.create_task(
                self._transport(
                    self.ingest_url,
                    item.canonical_payload,
                    headers,
                )
            )
            transport_task.add_done_callback(_observe_task_exception)
            item.transport_task = transport_task

        try:
            response = await asyncio.shield(transport_task)
        except asyncio.CancelledError:
            if transport_task.cancelled():
                if item.transport_task is transport_task:
                    item.transport_task = None
                item.last_status = None
                item.last_error = "CancelledError"
                return True
            raise
        except Exception as error:
            if item.transport_task is transport_task:
                item.transport_task = None
            item.last_status = None
            item.last_error = type(error).__name__
            return True
        if item.transport_task is transport_task:
            item.transport_task = None

        if not isinstance(response, IngestResponse):
            raise TranscriptIngestError("transport returned an invalid response")
        item.last_status = response.status
        if 200 <= response.status <= 299:
            item.last_error = None
            if item.kind != "transcript":
                item.state = "complete"
                return False
            row_id = parse_persisted_transcript_row_id(response.body)
            if row_id is not None and item.transcript_event is not None:
                item.transcript_event = {
                    **item.transcript_event,
                    "row_id": row_id,
                }
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


def _observe_task_exception(task: asyncio.Task[object]) -> None:
    """Retrieve detached transport failures until a later flush handles them."""
    if not task.cancelled():
        task.exception()
