"""Lease-bounded, provider-free construction seam for Preview Director shadow.

This module does not implement durable control-plane activation, session-lease
allocation, global spend aggregation, credentials, or application wiring.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Literal, Mapping, Protocol

from shared.interview_director import (
    DirectorAdapterResult,
    DirectorContext,
    DirectorError,
    DirectorLimits,
)
from shared.openai_responses_director_adapter import (
    OPENAI_RESPONSES_DIRECTOR_ADAPTER_VERSION,
    OpenAIResponsesDirectorAdapter,
    OpenAIResponsesTransport,
)

PREVIEW_SHADOW_RUNTIME_CONFIG_VERSION = (
    "adaptive-interviewer-preview-shadow-runtime-config.v1"
)
PREVIEW_SHADOW_AUTHORIZATION_DIGEST_VERSION = (
    "adaptive-interviewer-preview-shadow-authorization-digest.v1"
)
PREVIEW_SHADOW_CONFIGURATION_SHA256 = (
    "c6db8b06428fde9a7ffb13d78641e66efc584203c7862db93de42a9d9d64d89c"
)
PREVIEW_SHADOW_SESSION_LEASE_VERSION = (
    "adaptive-interviewer-preview-shadow-session-lease.v1"
)
PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION = (
    "adaptive-interviewer-preview-shadow-session-lease-digest.v1"
)
PREVIEW_SHADOW_SESSION_RECEIPT_VERSION = (
    "adaptive-interviewer-preview-shadow-session-receipt.v1"
)
PREVIEW_SHADOW_SESSION_RECEIPT_DIGEST_VERSION = (
    "adaptive-interviewer-preview-shadow-session-receipt-digest.v1"
)
PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_VERSION = (
    "adaptive-interviewer-preview-shadow-stop-incomplete-incident.v1"
)
PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_DIGEST_VERSION = (
    "adaptive-interviewer-preview-shadow-stop-incomplete-incident-digest.v1"
)
PREVIEW_SHADOW_DURABLE_ADMISSION_VERIFIER_VERSION = (
    "adaptive-interviewer-preview-shadow-durable-admission-verifier.v1"
)
PREVIEW_SHADOW_LOCAL_SPEND_LEDGER_VERSION = (
    "adaptive-interviewer-preview-shadow-local-spend-ledger.v1"
)
PREVIEW_SHADOW_EVIDENCE_VERSION = "adaptive-interviewer-preview-shadow-evidence.v1"
PREVIEW_SHADOW_ATTEMPT_RECEIPTS_DIGEST_VERSION = (
    "adaptive-interviewer-preview-shadow-attempt-receipts.v1"
)

_SESSION_BUDGET_NANO_USD = 1_000_000_000
_MAXIMUM_ATTEMPTS = 10
_ATTEMPT_RESERVATION_NANO_USD = 100_000_000
_MAXIMUM_SETTLE_SHUTDOWN_SECONDS = 0.250
_SHUTDOWN_RESERVE_SECONDS = 0.100
_CANCELLATION_GRACE_SECONDS = 0.025
_MAXIMUM_LEASE_TTL_SECONDS = 60 * 60
_MAX_SAFE_INTEGER = 9_007_199_254_740_991

_LEASE_KEYS = frozenset(
    {
        "contract_version",
        "run_id",
        "authorization_id",
        "candidate_git_sha",
        "preview_shadow_configuration_sha256",
        "adapter_id",
        "adapter_version",
        "provider",
        "model",
        "target_stage",
        "target_environment",
        "target_cohort",
        "exposure",
        "session_ordinal",
        "session_binding_sha256",
        "session_budget_nano_usd",
        "maximum_attempts",
        "attempt_reservation_nano_usd",
        "issued_at",
        "expires_at",
        "allocation_ledger_revision",
        "lease_id",
        "integrity_sha256",
    }
)
_ATTEMPT_OUTCOMES = frozenset(
    {
        "succeeded",
        "failed",
        "timeout",
        "cancelled",
        "invalid_response",
        "ambiguous",
    }
)
_EVIDENCE_STATES = frozenset(
    {"planned", "admitted", "attempt", "reserved", "reconciled", "stopped", "settled"}
)
_EVIDENCE_REASONS = frozenset(
    {
        "runtime_planned",
        "lease_admitted",
        "attempt_started",
        "attempt_reserved",
        "attempt_succeeded",
        "attempt_failed",
        "attempt_timeout",
        "attempt_cancelled",
        "attempt_invalid_response",
        "attempt_ambiguous",
        "session_budget_exhausted",
        "attempt_limit_reached",
        "kill_switch_closed",
        "settle_started",
        "settle_completed",
        "settle_timeout",
    }
)


class PreviewShadowRuntimeError(Exception):
    _CODES = frozenset(
        {
            "invalid_config",
            "invalid_lease",
            "control_plane_required",
            "lease_not_admitted",
            "kill_switch_closed",
            "session_budget_exhausted",
            "attempt_limit_reached",
            "attempt_invalid",
            "settle_timeout",
            "closed",
        }
    )

    def __init__(self, code: str):
        self.code = code if code in self._CODES else "invalid_config"
        super().__init__(f"Preview shadow runtime rejected input: {self.code}")


@dataclass(frozen=True)
class PreviewShadowSessionLease:
    contract_version: str
    run_id: str
    authorization_id: str
    candidate_git_sha: str
    preview_shadow_configuration_sha256: str
    adapter_id: str
    adapter_version: str
    provider: str
    model: str
    target_stage: str
    target_environment: str
    target_cohort: str
    exposure: str
    session_ordinal: int
    session_binding_sha256: str
    session_budget_nano_usd: int
    maximum_attempts: int
    attempt_reservation_nano_usd: int
    issued_at: str
    expires_at: str
    allocation_ledger_revision: int
    lease_id: str
    integrity_sha256: str

    def payload(self) -> dict[str, object]:
        return {
            "contract_version": self.contract_version,
            "run_id": self.run_id,
            "authorization_id": self.authorization_id,
            "candidate_git_sha": self.candidate_git_sha,
            "preview_shadow_configuration_sha256": self.preview_shadow_configuration_sha256,
            "adapter_id": self.adapter_id,
            "adapter_version": self.adapter_version,
            "provider": self.provider,
            "model": self.model,
            "target_stage": self.target_stage,
            "target_environment": self.target_environment,
            "target_cohort": self.target_cohort,
            "exposure": self.exposure,
            "session_ordinal": self.session_ordinal,
            "session_binding_sha256": self.session_binding_sha256,
            "session_budget_nano_usd": self.session_budget_nano_usd,
            "maximum_attempts": self.maximum_attempts,
            "attempt_reservation_nano_usd": self.attempt_reservation_nano_usd,
            "issued_at": self.issued_at,
            "expires_at": self.expires_at,
            "allocation_ledger_revision": self.allocation_ledger_revision,
        }


class DurableControlPlaneAdmissionVerifier(Protocol):
    """No concrete live implementation ships in this repository slice."""

    contract_version: str

    def verify_admitted_session_lease(self, lease: PreviewShadowSessionLease) -> bool: ...


class PreviewShadowSettledSession(Protocol):
    """The narrow SAV-474 shadow lifecycle surface; no voice APIs are present."""

    def settle(self) -> None: ...

    async def wait_idle(self, timeout_seconds: float) -> bool: ...

    async def shutdown(self) -> bool: ...


@dataclass(frozen=True)
class PreviewShadowEvidenceEvent:
    contract_version: str
    state: str
    stage: Literal["preview_shadow"]
    configuration_sha256: str
    adapter_version: str
    session_ordinal: int
    attempt_ordinal: int | None
    reserved_nano_usd: int
    reconciled_nano_usd: int
    reason: str
    occurred_at: str

    def to_wire(self) -> dict[str, object]:
        return {
            "contract_version": self.contract_version,
            "state": self.state,
            "stage": self.stage,
            "configuration_sha256": self.configuration_sha256,
            "adapter_version": self.adapter_version,
            "session_ordinal": self.session_ordinal,
            "attempt_ordinal": self.attempt_ordinal,
            "reserved_nano_usd": self.reserved_nano_usd,
            "reconciled_nano_usd": self.reconciled_nano_usd,
            "reason": self.reason,
            "occurred_at": self.occurred_at,
        }


class PreviewShadowEvidenceRecorder:
    def __init__(self, *, session_ordinal: int) -> None:
        if type(session_ordinal) is not int or session_ordinal <= 0:
            raise PreviewShadowRuntimeError("invalid_config")
        self._session_ordinal = session_ordinal
        self._events: list[PreviewShadowEvidenceEvent] = []

    @property
    def events(self) -> tuple[PreviewShadowEvidenceEvent, ...]:
        return tuple(self._events)

    def record(
        self,
        state: str,
        reason: str,
        *,
        attempt_ordinal: int | None,
        reserved_nano_usd: int,
        reconciled_nano_usd: int,
        occurred_at: datetime | None = None,
    ) -> None:
        event = self._prepare(
            state,
            reason,
            attempt_ordinal=attempt_ordinal,
            reserved_nano_usd=reserved_nano_usd,
            reconciled_nano_usd=reconciled_nano_usd,
            occurred_at=occurred_at,
        )
        self._append_prepared((event,))

    def _prepare(
        self,
        state: str,
        reason: str,
        *,
        attempt_ordinal: int | None,
        reserved_nano_usd: int,
        reconciled_nano_usd: int,
        occurred_at: datetime | None = None,
    ) -> PreviewShadowEvidenceEvent:
        if (
            type(state) is not str
            or state not in _EVIDENCE_STATES
            or type(reason) is not str
            or reason not in _EVIDENCE_REASONS
            or attempt_ordinal is not None
            and not _positive_integer(attempt_ordinal)
            or not _safe_nonnegative_integer(reserved_nano_usd)
            or not _safe_nonnegative_integer(reconciled_nano_usd)
        ):
            raise PreviewShadowRuntimeError("invalid_config")
        timestamp = occurred_at or datetime.now(timezone.utc)
        if timestamp.tzinfo is None or timestamp.utcoffset() is None:
            raise PreviewShadowRuntimeError("invalid_config")
        return PreviewShadowEvidenceEvent(
            contract_version=PREVIEW_SHADOW_EVIDENCE_VERSION,
            state=state,
            stage="preview_shadow",
            configuration_sha256=PREVIEW_SHADOW_CONFIGURATION_SHA256,
            adapter_version=OPENAI_RESPONSES_DIRECTOR_ADAPTER_VERSION,
            session_ordinal=self._session_ordinal,
            attempt_ordinal=attempt_ordinal,
            reserved_nano_usd=reserved_nano_usd,
            reconciled_nano_usd=reconciled_nano_usd,
            reason=reason,
            occurred_at=_whole_second_iso(timestamp),
        )

    def _append_prepared(
        self, events: tuple[PreviewShadowEvidenceEvent, ...]
    ) -> None:
        self._events.extend(events)


@dataclass(frozen=True)
class PreviewShadowAttemptReceipt:
    attempt_ordinal: int
    outcome: str
    reserved_nano_usd: int
    reconciled_nano_usd: int

    def to_wire(self) -> dict[str, object]:
        return {
            "attempt_ordinal": self.attempt_ordinal,
            "outcome": self.outcome,
            "reserved_nano_usd": self.reserved_nano_usd,
            "reconciled_nano_usd": self.reconciled_nano_usd,
        }


@dataclass(frozen=True)
class PreviewShadowSessionReceipt:
    contract_version: str
    run_id: str
    lease_id: str
    session_ordinal: int
    allocation_ledger_revision: int
    preview_shadow_configuration_sha256: str
    outcome: Literal["settled", "stopped"]
    attempt_count: int
    reconciled_spend_nano_usd: int
    outstanding_attempt_reservations_nano_usd: Literal[0]
    attempt_receipts_sha256: str
    settled_at: str
    receipt_id: str
    integrity_sha256: str

    def payload(self) -> dict[str, object]:
        return {
            "contract_version": self.contract_version,
            "run_id": self.run_id,
            "lease_id": self.lease_id,
            "session_ordinal": self.session_ordinal,
            "allocation_ledger_revision": self.allocation_ledger_revision,
            "preview_shadow_configuration_sha256": (
                self.preview_shadow_configuration_sha256
            ),
            "outcome": self.outcome,
            "attempt_count": self.attempt_count,
            "reconciled_spend_nano_usd": self.reconciled_spend_nano_usd,
            "outstanding_attempt_reservations_nano_usd": (
                self.outstanding_attempt_reservations_nano_usd
            ),
            "attempt_receipts_sha256": self.attempt_receipts_sha256,
            "settled_at": self.settled_at,
        }

    def to_wire(self) -> dict[str, object]:
        return {
            **self.payload(),
            "receipt_id": self.receipt_id,
            "integrity_sha256": self.integrity_sha256,
        }


@dataclass(frozen=True)
class PreviewShadowStopIncompleteIncident:
    contract_version: str
    run_id: str
    lease_id: str
    session_ordinal: int
    allocation_ledger_revision: int
    preview_shadow_configuration_sha256: str
    reason: Literal["cleanup_unconfirmed"]
    attempt_count: int
    reconciled_spend_nano_usd: int
    retained_session_reservation_nano_usd: Literal[1000000000]
    attempt_receipts_sha256: str
    observed_at: str
    requires_allocation_stop: Literal[True]
    termination_acknowledgement_required: Literal[True]
    incident_id: str
    integrity_sha256: str

    def payload(self) -> dict[str, object]:
        return {
            "contract_version": self.contract_version,
            "run_id": self.run_id,
            "lease_id": self.lease_id,
            "session_ordinal": self.session_ordinal,
            "allocation_ledger_revision": self.allocation_ledger_revision,
            "preview_shadow_configuration_sha256": (
                self.preview_shadow_configuration_sha256
            ),
            "reason": self.reason,
            "attempt_count": self.attempt_count,
            "reconciled_spend_nano_usd": self.reconciled_spend_nano_usd,
            "retained_session_reservation_nano_usd": (
                self.retained_session_reservation_nano_usd
            ),
            "attempt_receipts_sha256": self.attempt_receipts_sha256,
            "observed_at": self.observed_at,
            "requires_allocation_stop": self.requires_allocation_stop,
            "termination_acknowledgement_required": (
                self.termination_acknowledgement_required
            ),
        }

    def to_wire(self) -> dict[str, object]:
        return {
            **self.payload(),
            "incident_id": self.incident_id,
            "integrity_sha256": self.integrity_sha256,
        }


class PreviewShadowLocalSpendLedger:
    """One admitted session lease only; this is never a global cohort ledger."""

    contract_version = PREVIEW_SHADOW_LOCAL_SPEND_LEDGER_VERSION

    def __init__(
        self,
        lease: PreviewShadowSessionLease,
        evidence: PreviewShadowEvidenceRecorder,
    ) -> None:
        self.lease = lease
        self._evidence = evidence
        self._next_attempt_ordinal = 1
        self._open: dict[int, int] = {}
        self._receipts: list[PreviewShadowAttemptReceipt] = []
        self._reconciled_nano_usd = 0
        self._admission_open = True
        self._closed = False
        self._settle_completed: bool | None = None
        self._cleanup_completed: bool | None = None

    @property
    def reconciled_nano_usd(self) -> int:
        return self._reconciled_nano_usd

    @property
    def outstanding_reserved_nano_usd(self) -> int:
        return sum(self._open.values())

    @property
    def attempt_count(self) -> int:
        return len(self._receipts) + len(self._open)

    @property
    def receipts(self) -> tuple[PreviewShadowAttemptReceipt, ...]:
        return tuple(self._receipts)

    @property
    def admission_open(self) -> bool:
        return self._admission_open and not self._closed

    @property
    def closed(self) -> bool:
        return self._closed

    @property
    def settle_completed(self) -> bool | None:
        return self._settle_completed

    @property
    def cleanup_completed(self) -> bool | None:
        return self._cleanup_completed

    def reserve_attempt(self) -> int:
        if self._closed:
            raise PreviewShadowRuntimeError("closed")
        if not self._admission_open:
            raise PreviewShadowRuntimeError("session_budget_exhausted")
        if self.attempt_count >= self.lease.maximum_attempts:
            self.stop("attempt_limit_reached")
            raise PreviewShadowRuntimeError("attempt_limit_reached")
        reservation = self.lease.attempt_reservation_nano_usd
        if (
            self._reconciled_nano_usd
            + self.outstanding_reserved_nano_usd
            + reservation
            > self.lease.session_budget_nano_usd
        ):
            self.stop("session_budget_exhausted")
            raise PreviewShadowRuntimeError("session_budget_exhausted")
        ordinal = self._next_attempt_ordinal
        outstanding_before = self.outstanding_reserved_nano_usd
        attempt_event = self._evidence._prepare(
            "attempt",
            "attempt_started",
            attempt_ordinal=ordinal,
            reserved_nano_usd=outstanding_before,
            reconciled_nano_usd=self._reconciled_nano_usd,
        )
        reserved_event = self._evidence._prepare(
            "reserved",
            "attempt_reserved",
            attempt_ordinal=ordinal,
            reserved_nano_usd=outstanding_before + reservation,
            reconciled_nano_usd=self._reconciled_nano_usd,
        )
        self._next_attempt_ordinal += 1
        self._open[ordinal] = reservation
        self._evidence._append_prepared((attempt_event, reserved_event))
        return ordinal

    def reconcile_attempt(
        self,
        ordinal: int,
        outcome: str,
        *,
        normalized_cost_evidence_nano_usd: int | None = None,
    ) -> PreviewShadowAttemptReceipt:
        if not _positive_integer(ordinal) or type(outcome) is not str:
            raise PreviewShadowRuntimeError("attempt_invalid")
        reservation = self._open.get(ordinal)
        if reservation is None or outcome not in _ATTEMPT_OUTCOMES:
            raise PreviewShadowRuntimeError("attempt_invalid")
        if outcome == "succeeded":
            if not _safe_nonnegative_integer(normalized_cost_evidence_nano_usd):
                raise PreviewShadowRuntimeError("attempt_invalid")
            # Normalized response usage is useful evidence, not provider billing
            # truth. Retain the conservative reservation unless evidence is higher.
            reconciled = max(reservation, normalized_cost_evidence_nano_usd)
        else:
            if normalized_cost_evidence_nano_usd is not None:
                raise PreviewShadowRuntimeError("attempt_invalid")
            reconciled = reservation
        total = self._reconciled_nano_usd + reconciled
        if not _safe_nonnegative_integer(total):
            raise PreviewShadowRuntimeError("session_budget_exhausted")
        receipt = PreviewShadowAttemptReceipt(
            attempt_ordinal=ordinal,
            outcome=outcome,
            reserved_nano_usd=reservation,
            reconciled_nano_usd=reconciled,
        )
        remaining_reserved = self.outstanding_reserved_nano_usd - reservation
        reconciled_event = self._evidence._prepare(
            "reconciled",
            f"attempt_{outcome}",
            attempt_ordinal=ordinal,
            reserved_nano_usd=remaining_reserved,
            reconciled_nano_usd=total,
        )
        exhausted = total >= self.lease.session_budget_nano_usd
        stop_event = (
            self._evidence._prepare(
                "stopped",
                "session_budget_exhausted",
                attempt_ordinal=None,
                reserved_nano_usd=remaining_reserved,
                reconciled_nano_usd=total,
            )
            if exhausted
            else None
        )
        del self._open[ordinal]
        self._reconciled_nano_usd = total
        self._receipts.append(receipt)
        if exhausted:
            self._admission_open = False
        self._evidence._append_prepared(
            (reconciled_event,) if stop_event is None else (reconciled_event, stop_event)
        )
        return receipt

    def stop(self, reason: str) -> None:
        if self._closed:
            raise PreviewShadowRuntimeError("closed")
        if type(reason) is not str or reason not in {
            "session_budget_exhausted",
            "attempt_limit_reached",
            "kill_switch_closed",
            "settle_started",
            "settle_timeout",
        }:
            raise PreviewShadowRuntimeError("invalid_config")
        event = self._evidence._prepare(
            "stopped",
            reason,
            attempt_ordinal=None,
            reserved_nano_usd=self.outstanding_reserved_nano_usd,
            reconciled_nano_usd=self._reconciled_nano_usd,
        )
        self._admission_open = False
        self._evidence._append_prepared((event,))

    def settle_open_attempts_as_ambiguous(self) -> None:
        for ordinal in tuple(self._open):
            self.reconcile_attempt(ordinal, "ambiguous")

    def close(self, *, settle_completed: bool, cleanup_completed: bool) -> None:
        if (
            self._settle_completed is not None
            or type(settle_completed) is not bool
            or type(cleanup_completed) is not bool
            or settle_completed and not cleanup_completed
        ):
            raise PreviewShadowRuntimeError("closed")
        future_total = self._reconciled_nano_usd
        future_reserved = self.outstanding_reserved_nano_usd
        planned_receipts: list[PreviewShadowAttemptReceipt] = []
        planned_events: list[PreviewShadowEvidenceEvent] = []
        for ordinal, reservation in tuple(self._open.items()):
            future_total += reservation
            future_reserved -= reservation
            if not _safe_nonnegative_integer(future_total):
                raise PreviewShadowRuntimeError("session_budget_exhausted")
            planned_receipts.append(
                PreviewShadowAttemptReceipt(
                    attempt_ordinal=ordinal,
                    outcome="ambiguous",
                    reserved_nano_usd=reservation,
                    reconciled_nano_usd=reservation,
                )
            )
            planned_events.append(
                self._evidence._prepare(
                    "reconciled",
                    "attempt_ambiguous",
                    attempt_ordinal=ordinal,
                    reserved_nano_usd=future_reserved,
                    reconciled_nano_usd=future_total,
                )
            )
        terminal_event = self._evidence._prepare(
            "settled" if settle_completed and cleanup_completed else "stopped",
            "settle_completed" if settle_completed else "settle_timeout",
            attempt_ordinal=None,
            reserved_nano_usd=0,
            reconciled_nano_usd=future_total,
        )
        self._admission_open = False
        self._open.clear()
        self._receipts.extend(planned_receipts)
        self._reconciled_nano_usd = future_total
        self._settle_completed = settle_completed
        self._cleanup_completed = cleanup_completed
        self._closed = cleanup_completed
        self._evidence._append_prepared(
            (*planned_events, terminal_event)
        )


class LeaseBoundOpenAIResponsesDirectorAdapter:
    """Adds local lease accounting around the fully normalized adapter result."""

    version = OPENAI_RESPONSES_DIRECTOR_ADAPTER_VERSION

    def __init__(
        self,
        delegate: OpenAIResponsesDirectorAdapter,
        ledger: PreviewShadowLocalSpendLedger,
    ) -> None:
        self._delegate = delegate
        self._ledger = ledger

    async def prewarm(self, *, affinity_key: str, limits: DirectorLimits) -> None:
        await self._delegate.prewarm(affinity_key=affinity_key, limits=limits)

    async def recommend(
        self,
        context: DirectorContext,
        *,
        limits: DirectorLimits,
    ) -> DirectorAdapterResult:
        ordinal = self._ledger.reserve_attempt()
        try:
            result = await self._delegate.recommend(context, limits=limits)
        except asyncio.CancelledError:
            self._ledger.reconcile_attempt(ordinal, "cancelled")
            raise
        except DirectorError as error:
            outcome = {
                "deadline_exceeded": "timeout",
                "transport_unavailable": "failed",
            }.get(error.code, "invalid_response")
            self._ledger.reconcile_attempt(ordinal, outcome)
            raise
        except Exception:
            self._ledger.reconcile_attempt(ordinal, "failed")
            raise
        self._ledger.reconcile_attempt(
            ordinal,
            "succeeded",
            normalized_cost_evidence_nano_usd=result.estimated_cost_microusd * 1_000,
        )
        return result

    async def recover(
        self,
        *,
        affinity_key: str,
        writer_generation: int,
        limits: DirectorLimits,
    ) -> None:
        await self._delegate.recover(
            affinity_key=affinity_key,
            writer_generation=writer_generation,
            limits=limits,
        )

    async def close(self, *, affinity_key: str) -> None:
        await self._delegate.close(affinity_key=affinity_key)


@dataclass(frozen=True)
class PreviewShadowRuntime:
    lease: PreviewShadowSessionLease
    adapter: LeaseBoundOpenAIResponsesDirectorAdapter
    ledger: PreviewShadowLocalSpendLedger
    evidence: PreviewShadowEvidenceRecorder
    _terminal_receipt: PreviewShadowSessionReceipt | None = field(
        default=None,
        init=False,
        repr=False,
        compare=False,
    )
    _settle_task: asyncio.Task[bool] | None = field(
        default=None,
        init=False,
        repr=False,
        compare=False,
    )
    _stop_incomplete_incident: PreviewShadowStopIncompleteIncident | None = field(
        default=None,
        init=False,
        repr=False,
        compare=False,
    )

    async def settle_shadow(self, shadow: PreviewShadowSettledSession) -> bool:
        task = self._settle_task
        if task is None:
            if self.ledger.settle_completed is not None:
                return self.ledger.settle_completed is True
            task = asyncio.create_task(self._settle_shadow_once(shadow))
            object.__setattr__(self, "_settle_task", task)
        cancellation_observed = False
        while True:
            try:
                result = await asyncio.shield(task)
                break
            except asyncio.CancelledError:
                # Repeated caller cancellation cannot escape before the one
                # shared, internally bounded cleanup freezes its final state.
                cancellation_observed = True
                current = asyncio.current_task()
                if current is not None:
                    while current.cancelling():
                        current.uncancel()
        if cancellation_observed:
            raise asyncio.CancelledError
        return result

    async def _settle_shadow_once(
        self, shadow: PreviewShadowSettledSession
    ) -> bool:
        self.ledger.stop("settle_started")
        loop = asyncio.get_running_loop()
        deadline = loop.time() + _MAXIMUM_SETTLE_SHUTDOWN_SECONDS
        wait_deadline = deadline - _SHUTDOWN_RESERVE_SECONDS
        settled = False
        cleanup_completed = False
        try:
            shadow.settle()
            completed, idle = await _await_until_deadline(
                shadow.wait_idle(
                    timeout_seconds=max(0.001, wait_deadline - loop.time())
                ),
                operation_deadline=wait_deadline,
                cancellation_deadline=deadline,
            )
            settled = completed and idle is True
        except asyncio.CancelledError:
            settled = False
        except Exception:
            settled = False
        finally:
            try:
                completed, shutdown_confirmed = await _await_until_deadline(
                    shadow.shutdown(),
                    operation_deadline=deadline - _CANCELLATION_GRACE_SECONDS,
                    cancellation_deadline=deadline,
                )
                cleanup_completed = completed and shutdown_confirmed is True
            except asyncio.CancelledError:
                cleanup_completed = False
            except Exception:
                cleanup_completed = False
            settled = settled and cleanup_completed
            self.ledger.close(
                settle_completed=settled,
                cleanup_completed=cleanup_completed,
            )
            if cleanup_completed:
                object.__setattr__(
                    self,
                    "_terminal_receipt",
                    self._build_terminal_receipt(
                        outcome="settled" if settled else "stopped",
                        settled_at=datetime.now(timezone.utc),
                    ),
                )
            else:
                object.__setattr__(
                    self,
                    "_stop_incomplete_incident",
                    self._build_stop_incomplete_incident(
                        observed_at=datetime.now(timezone.utc),
                    ),
                )
        return settled

    def _build_terminal_receipt(
        self,
        *,
        outcome: Literal["settled", "stopped"],
        settled_at: datetime,
    ) -> PreviewShadowSessionReceipt:
        attempts = [receipt.to_wire() for receipt in self.ledger.receipts]
        attempt_digest = _digest(
            PREVIEW_SHADOW_ATTEMPT_RECEIPTS_DIGEST_VERSION,
            attempts,
        )
        payload = {
            "contract_version": PREVIEW_SHADOW_SESSION_RECEIPT_VERSION,
            "run_id": self.lease.run_id,
            "lease_id": self.lease.lease_id,
            "session_ordinal": self.lease.session_ordinal,
            "allocation_ledger_revision": self.lease.allocation_ledger_revision,
            "preview_shadow_configuration_sha256": PREVIEW_SHADOW_CONFIGURATION_SHA256,
            "outcome": outcome,
            "attempt_count": len(attempts),
            "reconciled_spend_nano_usd": self.ledger.reconciled_nano_usd,
            "outstanding_attempt_reservations_nano_usd": 0,
            "attempt_receipts_sha256": attempt_digest,
            "settled_at": _whole_second_iso(settled_at),
        }
        receipt_id = _digest(PREVIEW_SHADOW_SESSION_RECEIPT_DIGEST_VERSION, payload)
        return PreviewShadowSessionReceipt(
            **payload,  # type: ignore[arg-type]
            receipt_id=receipt_id,
            integrity_sha256=receipt_id,
        )

    def create_session_receipt(self) -> PreviewShadowSessionReceipt:
        receipt = self._terminal_receipt
        if (
            receipt is None
            or not self.ledger.closed
            or self.ledger.cleanup_completed is not True
            or self.ledger.outstanding_reserved_nano_usd != 0
        ):
            raise PreviewShadowRuntimeError("attempt_invalid")
        return receipt

    def _build_stop_incomplete_incident(
        self, *, observed_at: datetime
    ) -> PreviewShadowStopIncompleteIncident:
        attempts = [receipt.to_wire() for receipt in self.ledger.receipts]
        payload = {
            "contract_version": PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_VERSION,
            "run_id": self.lease.run_id,
            "lease_id": self.lease.lease_id,
            "session_ordinal": self.lease.session_ordinal,
            "allocation_ledger_revision": self.lease.allocation_ledger_revision,
            "preview_shadow_configuration_sha256": (
                PREVIEW_SHADOW_CONFIGURATION_SHA256
            ),
            "reason": "cleanup_unconfirmed",
            "attempt_count": len(attempts),
            "reconciled_spend_nano_usd": self.ledger.reconciled_nano_usd,
            "retained_session_reservation_nano_usd": _SESSION_BUDGET_NANO_USD,
            "attempt_receipts_sha256": _digest(
                PREVIEW_SHADOW_ATTEMPT_RECEIPTS_DIGEST_VERSION,
                attempts,
            ),
            "observed_at": _whole_second_iso(observed_at),
            "requires_allocation_stop": True,
            "termination_acknowledgement_required": True,
        }
        incident_id = _digest(
            PREVIEW_SHADOW_STOP_INCOMPLETE_INCIDENT_DIGEST_VERSION,
            payload,
        )
        return PreviewShadowStopIncompleteIncident(
            **payload,  # type: ignore[arg-type]
            incident_id=incident_id,
            integrity_sha256=incident_id,
        )

    def create_stop_incomplete_incident(
        self,
    ) -> PreviewShadowStopIncompleteIncident:
        incident = self._stop_incomplete_incident
        if incident is None or self.ledger.cleanup_completed is not False:
            raise PreviewShadowRuntimeError("attempt_invalid")
        return incident


@dataclass(frozen=True)
class PreviewShadowRuntimeConstruction:
    status: Literal["disabled", "unavailable", "ready"]
    reason: Literal[
        "default_off",
        "durable_admission_verifier_unavailable",
        "durable_admission_verifier_invalid",
        "live_stage_config_incomplete",
        "kill_switch_closed",
        "session_lease_invalid",
        "session_lease_not_admitted",
        "transport_factory_unavailable",
        "transport_unavailable",
        "admitted_session_lease",
    ]
    runtime: PreviewShadowRuntime | None

    @property
    def adapter(self) -> LeaseBoundOpenAIResponsesDirectorAdapter | None:
        return self.runtime.adapter if self.runtime is not None else None


def create_preview_shadow_runtime(
    *,
    raw_lease: Mapping[str, object] | None = None,
    expected_run_id: str | None = None,
    expected_candidate_git_sha: str | None = None,
    expected_session_binding_sha256: str | None = None,
    now: datetime | None = None,
    admission_verifier: DurableControlPlaneAdmissionVerifier | None = None,
    transport_factory: Callable[
        [PreviewShadowSessionLease], OpenAIResponsesTransport
    ]
    | None = None,
    kill_switch_open: bool = False,
) -> PreviewShadowRuntimeConstruction:
    """Construct only from an externally admitted lease; default is no adapter."""
    values = (
        raw_lease,
        expected_run_id,
        expected_candidate_git_sha,
        expected_session_binding_sha256,
        now,
        admission_verifier,
        transport_factory,
    )
    if all(value is None for value in values) and kill_switch_open is False:
        return PreviewShadowRuntimeConstruction(
            status="disabled",
            reason="default_off",
            runtime=None,
        )
    if admission_verifier is None:
        return PreviewShadowRuntimeConstruction(
            status="unavailable",
            reason="durable_admission_verifier_unavailable",
            runtime=None,
        )
    if transport_factory is None:
        return PreviewShadowRuntimeConstruction(
            status="unavailable",
            reason="transport_factory_unavailable",
            runtime=None,
        )
    if any(value is None for value in values):
        return PreviewShadowRuntimeConstruction(
            status="unavailable",
            reason="live_stage_config_incomplete",
            runtime=None,
        )
    if kill_switch_open is not True:
        return PreviewShadowRuntimeConstruction(
            status="disabled",
            reason="kill_switch_closed",
            runtime=None,
        )
    assert raw_lease is not None
    assert expected_run_id is not None
    assert expected_candidate_git_sha is not None
    assert expected_session_binding_sha256 is not None
    assert now is not None
    assert admission_verifier is not None
    assert transport_factory is not None
    try:
        lease = parse_preview_shadow_session_lease(
            raw_lease,
            expected_run_id=expected_run_id,
            expected_candidate_git_sha=expected_candidate_git_sha,
            expected_session_binding_sha256=expected_session_binding_sha256,
            now=now,
        )
    except PreviewShadowRuntimeError:
        return PreviewShadowRuntimeConstruction(
            status="unavailable",
            reason="session_lease_invalid",
            runtime=None,
        )
    if (
        admission_verifier.contract_version
        != PREVIEW_SHADOW_DURABLE_ADMISSION_VERIFIER_VERSION
    ):
        return PreviewShadowRuntimeConstruction(
            status="unavailable",
            reason="durable_admission_verifier_invalid",
            runtime=None,
        )
    try:
        admitted = admission_verifier.verify_admitted_session_lease(lease)
    except Exception:
        return PreviewShadowRuntimeConstruction(
            status="unavailable",
            reason="durable_admission_verifier_unavailable",
            runtime=None,
        )
    if admitted is not True:
        return PreviewShadowRuntimeConstruction(
            status="unavailable",
            reason="session_lease_not_admitted",
            runtime=None,
        )
    try:
        transport = transport_factory(lease)
    except Exception:
        return PreviewShadowRuntimeConstruction(
            status="unavailable",
            reason="transport_unavailable",
            runtime=None,
        )
    delegate = OpenAIResponsesDirectorAdapter(transport)
    evidence = PreviewShadowEvidenceRecorder(session_ordinal=lease.session_ordinal)
    evidence.record(
        "planned",
        "runtime_planned",
        attempt_ordinal=None,
        reserved_nano_usd=0,
        reconciled_nano_usd=0,
        occurred_at=now,
    )
    evidence.record(
        "admitted",
        "lease_admitted",
        attempt_ordinal=None,
        reserved_nano_usd=0,
        reconciled_nano_usd=0,
        occurred_at=now,
    )
    ledger = PreviewShadowLocalSpendLedger(lease, evidence)
    return PreviewShadowRuntimeConstruction(
        status="ready",
        reason="admitted_session_lease",
        runtime=PreviewShadowRuntime(
            lease=lease,
            adapter=LeaseBoundOpenAIResponsesDirectorAdapter(delegate, ledger),
            ledger=ledger,
            evidence=evidence,
        ),
    )


def parse_preview_shadow_session_lease(
    value: Mapping[str, object],
    *,
    expected_run_id: str,
    expected_candidate_git_sha: str,
    expected_session_binding_sha256: str,
    now: datetime,
) -> PreviewShadowSessionLease:
    if type(value) is not dict or frozenset(value) != _LEASE_KEYS:
        raise PreviewShadowRuntimeError("invalid_lease")
    try:
        lease = PreviewShadowSessionLease(**value)  # type: ignore[arg-type]
    except TypeError:
        raise PreviewShadowRuntimeError("invalid_lease") from None
    if (
        lease.contract_version != PREVIEW_SHADOW_SESSION_LEASE_VERSION
        or lease.run_id != expected_run_id
        or lease.candidate_git_sha != expected_candidate_git_sha
        or lease.session_binding_sha256 != expected_session_binding_sha256
        or lease.preview_shadow_configuration_sha256
        != PREVIEW_SHADOW_CONFIGURATION_SHA256
        or lease.adapter_id != "meelni_director_openai_responses"
        or lease.adapter_version != OPENAI_RESPONSES_DIRECTOR_ADAPTER_VERSION
        or lease.provider != "openai-api"
        or lease.model != "gpt-5.4-mini-2026-03-17"
        or lease.target_stage != "preview_shadow"
        or lease.target_environment != "preview_staging"
        or lease.target_cohort != "shadow"
        or lease.exposure != "none"
        or lease.session_budget_nano_usd != _SESSION_BUDGET_NANO_USD
        or lease.maximum_attempts != _MAXIMUM_ATTEMPTS
        or lease.attempt_reservation_nano_usd != _ATTEMPT_RESERVATION_NANO_USD
        or not _positive_integer(lease.session_ordinal)
        or not _positive_integer(lease.allocation_ledger_revision)
        or not _sha256(lease.run_id)
        or not _sha256(lease.authorization_id)
        or not _git_sha(lease.candidate_git_sha)
        or not _sha256(lease.session_binding_sha256)
        or not _sha256(lease.lease_id)
        or lease.integrity_sha256 != lease.lease_id
    ):
        raise PreviewShadowRuntimeError("invalid_lease")
    issued_at = _parse_whole_second(lease.issued_at)
    expires_at = _parse_whole_second(lease.expires_at)
    if now.tzinfo is None or now.utcoffset() is None:
        raise PreviewShadowRuntimeError("invalid_lease")
    now_utc = now.astimezone(timezone.utc)
    if (
        now_utc < issued_at
        or now_utc >= expires_at
        or expires_at <= issued_at
        or (expires_at - issued_at).total_seconds() > _MAXIMUM_LEASE_TTL_SECONDS
    ):
        raise PreviewShadowRuntimeError("invalid_lease")
    expected_digest = _digest(
        PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION,
        lease.payload(),
    )
    if lease.lease_id != expected_digest:
        raise PreviewShadowRuntimeError("invalid_lease")
    return lease


def _digest(version: str, payload: object) -> str:
    encoded = (
        version.encode("ascii")
        + b"\0"
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode(
            "utf-8"
        )
    )
    return hashlib.sha256(encoded).hexdigest()


async def _await_until_deadline(
    awaitable: object,
    *,
    operation_deadline: float,
    cancellation_deadline: float,
) -> tuple[bool, object | None]:
    if not hasattr(awaitable, "__await__"):
        raise PreviewShadowRuntimeError("invalid_config")
    task = asyncio.ensure_future(awaitable)  # type: ignore[arg-type]
    try:
        remaining = operation_deadline - asyncio.get_running_loop().time()
        if remaining <= 0:
            return False, None
        done, _ = await asyncio.wait({task}, timeout=remaining)
        if task not in done:
            return False, None
        return True, task.result()
    finally:
        if not task.done():
            task.cancel()
            remaining = cancellation_deadline - asyncio.get_running_loop().time()
            if remaining > 0:
                await asyncio.wait({task}, timeout=remaining)
        if task.done() and not task.cancelled():
            try:
                task.result()
            except Exception:
                pass


def _whole_second_iso(value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise PreviewShadowRuntimeError("invalid_config")
    utc = value.astimezone(timezone.utc).replace(microsecond=0)
    return utc.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _parse_whole_second(value: str) -> datetime:
    if type(value) is not str or not value.endswith(".000Z"):
        raise PreviewShadowRuntimeError("invalid_lease")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise PreviewShadowRuntimeError("invalid_lease") from None
    if parsed.microsecond != 0 or _whole_second_iso(parsed) != value:
        raise PreviewShadowRuntimeError("invalid_lease")
    return parsed


def _safe_nonnegative_integer(value: object) -> bool:
    return type(value) is int and 0 <= value <= _MAX_SAFE_INTEGER


def _positive_integer(value: object) -> bool:
    return type(value) is int and 0 < value <= _MAX_SAFE_INTEGER


def _sha256(value: object) -> bool:
    return (
        type(value) is str
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )


def _git_sha(value: object) -> bool:
    return (
        type(value) is str
        and len(value) == 40
        and all(character in "0123456789abcdef" for character in value)
    )
