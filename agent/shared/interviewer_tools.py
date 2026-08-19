"""Bounded session-local tools for the deterministic interview controller."""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from collections.abc import Awaitable, Callable, Mapping
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from shared.interview_controller import (
    ControllerError,
    ControllerState,
    list_probe_candidates,
    project_controller_state,
)
from shared.interview_controller_adapter import InterviewControllerAdapter
from shared.interviewer_contract_assessment import (
    assess_interviewer_tool_request_against_state,
)
from shared.interviewer_contract_canonicalization import (
    assess_interviewer_mutation_replay,
    calculate_interviewer_mutation_request_digest,
)
from shared.interviewer_contract_errors import InterviewerContractError
from shared.interviewer_contracts import (
    INTERVIEWER_MOVE_CONTRACT_VERSION,
    INTERVIEWER_TOOL_CONTRACT_VERSION,
    INTERVIEWER_TOOL_NAMES,
    parse_interviewer_tool_request,
    parse_interviewer_tool_result,
)
from shared.session_deadline import serialize_deadline_at


INTERVIEWER_TOOLS_FEATURE_ENV = "MEELNI_INTERVIEW_TOOLS_V1_ENABLED"
TRUSTED_LIFECYCLE_SNAPSHOT_CONTRACT_VERSION = (
    "trusted-interview-lifecycle-snapshot.v1"
)
INTERVIEWER_TOOL_FALLBACK_CONTRACT_VERSION = "interviewer-tool-fallback.v1"
INTERVIEWER_TOOL_CALL_TIMEOUT_MS = 150
MAX_TRUSTED_LIFECYCLE_LEASE_MS = 10_000
MAX_MUTATION_IDEMPOTENCY_ENTRIES = 128

ToolStatus = Literal[
    "ok",
    "duplicate",
    "stale_state",
    "stale_writer",
    "expired",
    "idempotency_conflict",
    "closed",
    "invalid_request",
    "timeout",
    "unavailable",
]
OperationBarrier = Callable[[str], Awaitable[None]]


class InterviewerToolsError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(f"Interviewer tools failure: {code}")


@dataclass(frozen=True)
class TrustedLifecycleSnapshot:
    contract_version: str
    session_id: str
    writer_id: str
    writer_generation: int
    state: str
    version: int
    observed_monotonic_ms: int
    valid_until_monotonic_ms: int


@dataclass(frozen=True)
class ToolExecutionOutcome:
    tool_name: str | None
    status: ToolStatus
    result: dict[str, Any] | None
    fallback_required: bool

    def to_model_json(self) -> str:
        value: dict[str, Any]
        if self.result is not None:
            value = self.result
        else:
            value = {
                "contract_version": INTERVIEWER_TOOL_FALLBACK_CONTRACT_VERSION,
                "tool_name": self.tool_name,
                "status": self.status,
                "fallback_required": True,
            }
        return json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )


@dataclass(frozen=True)
class InterviewerToolsStatus:
    enabled: bool
    failure_reason: str | None


class TrustedLifecycleSnapshotStore:
    """Accept already-authenticated lifecycle authority into one local lease."""

    def __init__(
        self,
        initial: TrustedLifecycleSnapshot,
        *,
        monotonic_ms: int,
    ) -> None:
        self._snapshot: TrustedLifecycleSnapshot | None = None
        self._failure_reason: str | None = None
        self._validate_snapshot(initial, monotonic_ms=monotonic_ms)
        self._snapshot = initial

    @property
    def failure_reason(self) -> str | None:
        return self._failure_reason

    def current(self, *, monotonic_ms: int) -> TrustedLifecycleSnapshot | None:
        snapshot = self._snapshot
        if (
            snapshot is None
            or self._failure_reason is not None
            or monotonic_ms >= snapshot.valid_until_monotonic_ms
        ):
            return None
        return snapshot

    def preview_refresh(
        self,
        snapshot: TrustedLifecycleSnapshot,
        *,
        monotonic_ms: int,
    ) -> Literal["duplicate", "updated"]:
        self._validate_snapshot(snapshot, monotonic_ms=monotonic_ms)
        current = self._snapshot
        if current is None:
            raise InterviewerToolsError("lifecycle_snapshot_unavailable")
        if (
            snapshot.session_id != current.session_id
            or snapshot.writer_id != current.writer_id
            or snapshot.writer_generation != current.writer_generation
        ):
            raise InterviewerToolsError("lifecycle_identity_mismatch")
        if snapshot.version < current.version:
            raise InterviewerToolsError("stale_lifecycle")
        if current.state != "active" and snapshot.state == "active":
            raise InterviewerToolsError("lifecycle_reactivation_denied")
        if snapshot.version == current.version:
            if (
                snapshot.state != current.state
                or snapshot.observed_monotonic_ms
                < current.observed_monotonic_ms
            ):
                raise InterviewerToolsError("lifecycle_version_conflict")
            return "duplicate" if snapshot == current else "updated"
        if snapshot.observed_monotonic_ms < current.observed_monotonic_ms:
            raise InterviewerToolsError("lifecycle_observation_regression")
        return "updated"

    def commit_refresh(self, snapshot: TrustedLifecycleSnapshot) -> None:
        self._snapshot = snapshot
        self._failure_reason = None

    def mark_refresh_unavailable(self) -> None:
        self._failure_reason = "lifecycle_refresh_unavailable"

    @staticmethod
    def _validate_snapshot(
        snapshot: TrustedLifecycleSnapshot,
        *,
        monotonic_ms: int,
    ) -> None:
        if not isinstance(snapshot, TrustedLifecycleSnapshot):
            raise InterviewerToolsError("invalid_lifecycle_snapshot")
        if (
            snapshot.contract_version
            != TRUSTED_LIFECYCLE_SNAPSHOT_CONTRACT_VERSION
            or not snapshot.session_id
            or not snapshot.writer_id
            or type(snapshot.writer_generation) is not int
            or snapshot.writer_generation <= 0
            or snapshot.state
            not in (
                "created",
                "connecting",
                "active",
                "reconnecting",
                "ending",
                "completed",
                "abandoned",
                "failed",
            )
            or type(snapshot.version) is not int
            or snapshot.version <= 0
            or type(snapshot.observed_monotonic_ms) is not int
            or type(snapshot.valid_until_monotonic_ms) is not int
            or type(monotonic_ms) is not int
            or snapshot.observed_monotonic_ms > monotonic_ms
            or snapshot.valid_until_monotonic_ms <= monotonic_ms
            or snapshot.valid_until_monotonic_ms
            - snapshot.observed_monotonic_ms
            > MAX_TRUSTED_LIFECYCLE_LEASE_MS
        ):
            raise InterviewerToolsError("invalid_lifecycle_snapshot")


class SessionScopedInterviewerTools:
    """Execute the accepted five-tool contract over one in-memory session."""

    def __init__(
        self,
        *,
        controller: InterviewControllerAdapter,
        lifecycle_store: TrustedLifecycleSnapshotStore | None,
        enabled: bool,
        observability: object | None = None,
        call_timeout_ms: int = INTERVIEWER_TOOL_CALL_TIMEOUT_MS,
        monotonic_clock_ms: Callable[[], int] | None = None,
        wall_clock: Callable[[], float] = time.time,
        operation_barrier: OperationBarrier | None = None,
    ) -> None:
        if type(call_timeout_ms) is not int or call_timeout_ms <= 0:
            raise InterviewerToolsError("invalid_tool_timeout")
        self._controller = controller
        self._lifecycle_store = lifecycle_store
        self._configured_enabled = enabled
        self._observability = observability
        self._call_timeout_ms = call_timeout_ms
        self._monotonic_clock_ms = monotonic_clock_ms or (
            lambda: time.monotonic_ns() // 1_000_000
        )
        self._wall_clock = wall_clock
        self._operation_barrier = operation_barrier or _no_op_barrier
        self._mutation_ledger: dict[
            str, tuple[dict[str, Any], dict[str, Any]]
        ] = {}
        self._lock = asyncio.Lock()
        initial_state = controller.state
        self._last_state_revision = (
            initial_state.state_revision if initial_state is not None else None
        )
        self._last_lifecycle_version = (
            initial_state.lifecycle_version if initial_state is not None else None
        )

    @property
    def status(self) -> InterviewerToolsStatus:
        reason = self._availability_failure(
            monotonic_ms=self._monotonic_clock_ms()
        )
        return InterviewerToolsStatus(enabled=reason is None, failure_reason=reason)

    @property
    def enabled(self) -> bool:
        return self.status.enabled

    def accept_lifecycle_refresh(
        self,
        snapshot: TrustedLifecycleSnapshot,
        *,
        monotonic_ms: int | None = None,
    ) -> Literal["duplicate", "updated"]:
        store = self._lifecycle_store
        if store is None:
            raise InterviewerToolsError("lifecycle_snapshot_unavailable")
        current_ms = self._resolve_monotonic_ms(monotonic_ms)
        disposition = store.preview_refresh(snapshot, monotonic_ms=current_ms)
        if disposition == "duplicate":
            return disposition
        controller_state = self._controller.state
        if (
            controller_state is None
            or (
                snapshot.state == "active"
                and (
                    controller_state.lifecycle_state != "active"
                    or controller_state.terminal
                    or controller_state.speech_fenced
                )
            )
        ):
            raise InterviewerToolsError("lifecycle_reactivation_denied")
        self._controller.refresh_lifecycle_snapshot(
            lifecycle_state=snapshot.state,
            lifecycle_version=snapshot.version,
            monotonic_ms=current_ms,
        )
        store.commit_refresh(snapshot)
        return disposition

    def mark_lifecycle_refresh_unavailable(self) -> None:
        if self._lifecycle_store is not None:
            self._lifecycle_store.mark_refresh_unavailable()
        self._controller.invalidate_lifecycle_authority()

    async def execute(
        self,
        request: object,
        *,
        handle_id: str | None = None,
        enforce_handle_authority: bool = False,
    ) -> ToolExecutionOutcome:
        started = time.perf_counter()
        identity = self._request_identity(request)
        tool_name = identity.get("tool_name")
        if tool_name not in INTERVIEWER_TOOL_NAMES:
            tool_name = None

        try:
            parsed = parse_interviewer_tool_request(request)
        except (InterviewerContractError, TypeError, ValueError, UnicodeError):
            outcome = self._finish(
                identity=identity,
                tool_name=tool_name,
                status="invalid_request",
                payload=None,
                started=started,
            )
            await self._fence_handle_after_failure(
                handle_id=handle_id,
                enforce_handle_authority=enforce_handle_authority,
            )
            return outcome

        began_handle_call = False
        if enforce_handle_authority:
            if not isinstance(handle_id, str) or not handle_id:
                return self._finish(
                    identity=identity,
                    tool_name=parsed["tool_name"],
                    status="unavailable",
                    payload=None,
                    started=started,
                )
            admission = self._controller.begin_tool_call(
                handle_id=handle_id,
                tool_name=parsed["tool_name"],
            )
            if admission != "eligible":
                outcome = self._finish(
                    identity=identity,
                    tool_name=parsed["tool_name"],
                    status=(
                        "invalid_request"
                        if admission == "invalid_request"
                        else "unavailable"
                    ),
                    payload=None,
                    started=started,
                )
                await self._fence_handle_after_failure(
                    handle_id=handle_id,
                    enforce_handle_authority=True,
                )
                return outcome
            began_handle_call = True

        try:
            result = await asyncio.wait_for(
                self._execute_serialized(
                    parsed,
                    handle_id=handle_id,
                ),
                timeout=self._call_timeout_ms / 1_000,
            )
            return self._finish(
                identity=identity,
                tool_name=parsed["tool_name"],
                status=result["status"],
                payload=result["payload"],
                started=started,
                observed_state_revision=result["observed_state_revision"],
                observed_lifecycle_version=result[
                    "observed_lifecycle_version"
                ],
            )
        except asyncio.TimeoutError:
            outcome = self._finish(
                identity=identity,
                tool_name=parsed["tool_name"],
                status="timeout",
                payload=None,
                started=started,
            )
            await self._fence_handle_after_failure(
                handle_id=handle_id,
                enforce_handle_authority=enforce_handle_authority,
            )
            return outcome
        except Exception:
            outcome = self._finish(
                identity=identity,
                tool_name=parsed["tool_name"],
                status="unavailable",
                payload=None,
                started=started,
            )
            await self._fence_handle_after_failure(
                handle_id=handle_id,
                enforce_handle_authority=enforce_handle_authority,
            )
            return outcome
        finally:
            if began_handle_call and isinstance(handle_id, str):
                self._controller.end_tool_call(handle_id=handle_id)

    async def invoke_read(
        self,
        *,
        tool_name: Literal["read_interview_state", "read_interview_clock"],
        raw_call_id: str,
        handle_id: str,
        contract_version: str,
    ) -> ToolExecutionOutcome:
        request = self.build_read_request(
            tool_name=tool_name,
            raw_call_id=raw_call_id,
            contract_version=contract_version,
        )
        return await self.execute(
            request,
            handle_id=handle_id,
            enforce_handle_authority=True,
        )

    async def invoke_probe_candidates(
        self,
        *,
        raw_call_id: str,
        handle_id: str,
        contract_version: str,
        expected_state_revision: int,
        expected_lifecycle_version: int,
        active_question_id: str,
    ) -> ToolExecutionOutcome:
        request = self.build_probe_candidates_request(
            raw_call_id=raw_call_id,
            contract_version=contract_version,
            expected_state_revision=expected_state_revision,
            expected_lifecycle_version=expected_lifecycle_version,
            active_question_id=active_question_id,
        )
        return await self.execute(
            request,
            handle_id=handle_id,
            enforce_handle_authority=True,
        )

    async def invoke_commit(
        self,
        *,
        raw_call_id: str,
        handle_id: str,
        contract_version: str,
        expected_state_revision: int,
        expected_lifecycle_version: int,
        move_type: str,
        probe_candidate_id: str | None,
        idempotency_key: str,
    ) -> ToolExecutionOutcome:
        request = self.build_commit_request(
            raw_call_id=raw_call_id,
            contract_version=contract_version,
            expected_state_revision=expected_state_revision,
            expected_lifecycle_version=expected_lifecycle_version,
            move_type=move_type,
            probe_candidate_id=probe_candidate_id,
            idempotency_key=idempotency_key,
        )
        return await self.execute(
            request,
            handle_id=handle_id,
            enforce_handle_authority=True,
        )

    async def invoke_close(
        self,
        *,
        raw_call_id: str,
        handle_id: str,
        contract_version: str,
        expected_state_revision: int,
        expected_lifecycle_version: int,
        idempotency_key: str,
        reason: str,
    ) -> ToolExecutionOutcome:
        request = self.build_close_request(
            raw_call_id=raw_call_id,
            contract_version=contract_version,
            expected_state_revision=expected_state_revision,
            expected_lifecycle_version=expected_lifecycle_version,
            idempotency_key=idempotency_key,
            reason=reason,
        )
        return await self.execute(
            request,
            handle_id=handle_id,
            enforce_handle_authority=True,
        )

    def build_read_request(
        self,
        *,
        tool_name: Literal["read_interview_state", "read_interview_clock"],
        raw_call_id: str,
        contract_version: str = INTERVIEWER_TOOL_CONTRACT_VERSION,
    ) -> dict[str, Any]:
        return self._base_request(
            tool_name=tool_name,
            raw_call_id=raw_call_id,
            contract_version=contract_version,
        )

    def build_probe_candidates_request(
        self,
        *,
        raw_call_id: str,
        expected_state_revision: int,
        expected_lifecycle_version: int,
        active_question_id: str,
        contract_version: str = INTERVIEWER_TOOL_CONTRACT_VERSION,
    ) -> dict[str, Any]:
        return {
            **self._base_request(
                tool_name="get_probe_candidates",
                raw_call_id=raw_call_id,
                contract_version=contract_version,
            ),
            "expected_state_revision": expected_state_revision,
            "expected_lifecycle_version": expected_lifecycle_version,
            "active_question_id": active_question_id,
        }

    def build_close_request(
        self,
        *,
        raw_call_id: str,
        expected_state_revision: int,
        expected_lifecycle_version: int,
        idempotency_key: str,
        reason: str,
        contract_version: str = INTERVIEWER_TOOL_CONTRACT_VERSION,
    ) -> dict[str, Any]:
        request = {
            **self._base_request(
                tool_name="request_graceful_close",
                raw_call_id=raw_call_id,
                contract_version=contract_version,
            ),
            "expected_state_revision": expected_state_revision,
            "expected_lifecycle_version": expected_lifecycle_version,
            "idempotency_key": idempotency_key,
            "request_digest": "",
            "reason": reason,
        }
        request["request_digest"] = (
            calculate_interviewer_mutation_request_digest(request)
        )
        return request

    def build_commit_request(
        self,
        *,
        raw_call_id: str,
        contract_version: str,
        expected_state_revision: int,
        expected_lifecycle_version: int,
        move_type: str,
        probe_candidate_id: str | None,
        idempotency_key: str,
    ) -> dict[str, Any]:
        state = self._controller.state
        if state is None:
            raise InterviewerToolsError("controller_unavailable")
        now = self._wall_now()
        deadline = now + timedelta(milliseconds=self._call_timeout_ms)
        topic = state.current_topic
        reason_codes = {
            "probe": "deepen_reasoning",
            "clarify": "resolve_ambiguity",
            "challenge": "test_tradeoff",
            "transition": "advance_round",
        }
        if move_type not in reason_codes:
            raise InterviewerToolsError("invalid_move_type")
        if move_type == "transition":
            topic = state.topic_catalog[
                min(state.topic_index + 1, len(state.topic_catalog) - 1)
            ]
            probe_candidate_id = None
        source_turn_id = state.last_finalized_candidate_turn_id
        if source_turn_id is None:
            raise InterviewerToolsError("source_turn_unavailable")
        move = {
            "contract_version": INTERVIEWER_MOVE_CONTRACT_VERSION,
            "move_id": f"move:{state.session_id}:{state.move_ordinal + 1}",
            "session_id": state.session_id,
            "brief_id": state.brief_id,
            "writer_id": state.writer_id,
            "writer_generation": state.writer_generation,
            "based_on_state_revision": expected_state_revision,
            "based_on_lifecycle_version": expected_lifecycle_version,
            "move_type": move_type,
            "target": {
                "question_id": state.active_question_id,
                "topic": topic,
                "source_turn_id": source_turn_id,
                "probe_candidate_id": probe_candidate_id,
            },
            "reason_code": reason_codes[move_type],
            "created_at": serialize_deadline_at(now),
            "expires_at": serialize_deadline_at(deadline),
            "idempotency_key": idempotency_key,
        }
        request = {
            **self._base_request(
                tool_name="commit_interviewer_move",
                raw_call_id=raw_call_id,
                contract_version=contract_version,
                deadline=deadline,
            ),
            "expected_state_revision": expected_state_revision,
            "expected_lifecycle_version": expected_lifecycle_version,
            "idempotency_key": idempotency_key,
            "request_digest": "",
            "move": move,
        }
        request["request_digest"] = (
            calculate_interviewer_mutation_request_digest(request)
        )
        return request

    async def _execute_serialized(
        self,
        request: dict[str, Any],
        *,
        handle_id: str | None,
    ) -> dict[str, Any]:
        async with self._lock:
            try:
                result = await self._execute_locked(
                    request,
                    handle_id=handle_id,
                )
                if result["status"] not in ("ok", "duplicate"):
                    self._request_tool_fallback_locked(handle_id=handle_id)
                return result
            except asyncio.CancelledError:
                self._request_tool_fallback_locked(handle_id=handle_id)
                raise
            except Exception:
                self._request_tool_fallback_locked(handle_id=handle_id)
                raise

    async def _execute_locked(
        self,
        request: dict[str, Any],
        *,
        handle_id: str | None,
    ) -> dict[str, Any]:
        await self._operation_barrier(request["tool_name"])
        state = self._controller.state
        current_ms = self._monotonic_clock_ms()
        availability = self._availability_failure(monotonic_ms=current_ms)
        if availability is not None or state is None:
            return self._execution_result(
                status="unavailable",
                payload=None,
                state=state,
            )
        lifecycle = self._current_lifecycle(monotonic_ms=current_ms)
        if lifecycle is None:
            return self._execution_result(
                status="unavailable",
                payload=None,
                state=state,
            )

        if request["tool_name"] in (
            "commit_interviewer_move",
            "request_graceful_close",
        ):
            existing = self._mutation_ledger.get(request["idempotency_key"])
            if existing is not None:
                original_request, original_result = existing
                replay = assess_interviewer_mutation_replay(
                    original_request,
                    request,
                )
                if replay == "duplicate":
                    return {
                        "status": "duplicate",
                        "payload": deepcopy(original_result["payload"]),
                        "observed_state_revision": original_result[
                            "observed_state_revision"
                        ],
                        "observed_lifecycle_version": original_result[
                            "observed_lifecycle_version"
                        ],
                    }
                return self._execution_result(
                    status="idempotency_conflict",
                    payload=None,
                    state=state,
                )
            if len(self._mutation_ledger) >= MAX_MUTATION_IDEMPOTENCY_ENTRIES:
                return self._execution_result(
                    status="unavailable",
                    payload=None,
                    state=state,
                )

        now = self._wall_now()
        admission = assess_interviewer_tool_request_against_state(
            request,
            state.to_runtime_state(),
            now,
        )
        if admission != "eligible":
            return self._execution_result(
                status=_admission_status(admission),
                payload=None,
                state=state,
            )

        name = request["tool_name"]
        if name in ("read_interview_state", "read_interview_clock"):
            projected = project_controller_state(
                state,
                monotonic_ms=current_ms,
            )
            payload = (
                {"state": projected.to_runtime_state()}
                if name == "read_interview_state"
                else {"clock": projected.to_runtime_state()["clock"]}
            )
            return self._execution_result(
                status="ok",
                payload=payload,
                state=state,
                lifecycle_version=lifecycle.version,
            )
        if name == "get_probe_candidates":
            projected = project_controller_state(
                state,
                monotonic_ms=current_ms,
            )
            return self._execution_result(
                status="ok",
                payload={
                    "probe_candidates": [
                        dict(candidate)
                        for candidate in list_probe_candidates(projected)
                    ]
                },
                state=state,
                lifecycle_version=lifecycle.version,
            )
        if name == "commit_interviewer_move":
            move = request["move"]
            target = move["target"]
            try:
                committed = self._controller.apply_tool_move(
                    move_id=move["move_id"],
                    move_type=move["move_type"],
                    reason_code=move["reason_code"],
                    question_id=target["question_id"],
                    topic=target["topic"],
                    source_turn_id=target["source_turn_id"],
                    probe_candidate_id=target["probe_candidate_id"],
                    expected_state_revision=request["expected_state_revision"],
                    monotonic_ms=current_ms,
                    handle_id=handle_id,
                )
            except ControllerError as error:
                return self._execution_result(
                    status=_controller_error_status(error.code),
                    payload=None,
                    state=self._controller.state,
                )
            result = self._execution_result(
                status="ok",
                payload={"committed_move": deepcopy(move)},
                state=committed,
                lifecycle_version=lifecycle.version,
            )
            self._remember_mutation(request, result)
            return result

        close_reason = {
            "deadline": "deadline_close",
            "candidate_request": "candidate_requested_close",
            "controller_policy": "controller_fallback",
        }[request["reason"]]
        source_turn_id = state.last_finalized_candidate_turn_id
        if source_turn_id is None:
            return self._execution_result(
                status="invalid_request",
                payload=None,
                state=state,
            )
        move_id = f"move:{state.session_id}:{state.move_ordinal + 1}"
        try:
            closed = self._controller.apply_tool_move(
                move_id=move_id,
                move_type="close",
                reason_code=close_reason,
                question_id=state.active_question_id,
                topic=state.current_topic,
                source_turn_id=source_turn_id,
                probe_candidate_id=None,
                expected_state_revision=request["expected_state_revision"],
                monotonic_ms=current_ms,
                handle_id=handle_id,
            )
        except ControllerError as error:
            return self._execution_result(
                status=_controller_error_status(error.code),
                payload=None,
                state=self._controller.state,
            )
        result = self._execution_result(
            status="ok",
            payload={"close_state": closed.close_state},
            state=closed,
            lifecycle_version=lifecycle.version,
        )
        self._remember_mutation(request, result)
        return result

    async def _fence_handle_after_failure(
        self,
        *,
        handle_id: str | None,
        enforce_handle_authority: bool,
    ) -> None:
        if (
            not enforce_handle_authority
            or not isinstance(handle_id, str)
            or not handle_id
        ):
            return
        async with self._lock:
            self._request_tool_fallback_locked(handle_id=handle_id)

    def _request_tool_fallback_locked(self, *, handle_id: str | None) -> None:
        if not isinstance(handle_id, str) or not handle_id or not self.enabled:
            return
        try:
            self._controller.request_tool_fallback(
                handle_id=handle_id,
                monotonic_ms=self._resolve_monotonic_ms(None),
            )
        except Exception:
            return

    def _remember_mutation(
        self,
        request: dict[str, Any],
        result: dict[str, Any],
    ) -> None:
        self._mutation_ledger[request["idempotency_key"]] = (
            deepcopy(request),
            deepcopy(result),
        )

    def _availability_failure(self, *, monotonic_ms: int) -> str | None:
        if not self._configured_enabled:
            return "flag_disabled"
        if not self._controller.enabled or self._controller.state is None:
            return "controller_unavailable"
        lifecycle = self._current_lifecycle(monotonic_ms=monotonic_ms)
        if lifecycle is None:
            return (
                self._lifecycle_store.failure_reason
                if self._lifecycle_store is not None
                and self._lifecycle_store.failure_reason is not None
                else "lifecycle_snapshot_stale"
            )
        state = self._controller.state
        if (
            lifecycle.session_id != state.session_id
            or lifecycle.writer_id != state.writer_id
            or lifecycle.writer_generation != state.writer_generation
            or lifecycle.version != state.lifecycle_version
        ):
            return "lifecycle_snapshot_mismatch"
        if lifecycle.state != "active" or state.lifecycle_state != "active":
            return "lifecycle_not_active"
        return None

    def _current_lifecycle(
        self,
        *,
        monotonic_ms: int,
    ) -> TrustedLifecycleSnapshot | None:
        if self._lifecycle_store is None:
            return None
        return self._lifecycle_store.current(monotonic_ms=monotonic_ms)

    def _base_request(
        self,
        *,
        tool_name: str,
        raw_call_id: str,
        contract_version: str,
        deadline: datetime | None = None,
    ) -> dict[str, Any]:
        state = self._controller.state
        if state is None:
            raise InterviewerToolsError("controller_unavailable")
        deadline = deadline or (
            self._wall_now() + timedelta(milliseconds=self._call_timeout_ms)
        )
        return {
            "contract_version": contract_version,
            "tool_name": tool_name,
            "call_id": _bound_call_id(raw_call_id),
            "session_id": state.session_id,
            "writer_id": state.writer_id,
            "writer_generation": state.writer_generation,
            "deadline_at": serialize_deadline_at(deadline),
        }

    def _execution_result(
        self,
        *,
        status: ToolStatus,
        payload: dict[str, Any] | None,
        state: ControllerState | None,
        lifecycle_version: int | None = None,
    ) -> dict[str, Any]:
        if state is not None:
            self._last_state_revision = state.state_revision
            self._last_lifecycle_version = state.lifecycle_version
        observed_revision = state.state_revision if state is not None else 0
        observed_lifecycle = (
            lifecycle_version
            if lifecycle_version is not None
            else state.lifecycle_version
            if state is not None
            else 1
        )
        return {
            "status": status,
            "payload": payload,
            "observed_state_revision": observed_revision,
            "observed_lifecycle_version": observed_lifecycle,
        }

    def _finish(
        self,
        *,
        identity: Mapping[str, Any],
        tool_name: str | None,
        status: ToolStatus,
        payload: dict[str, Any] | None,
        started: float,
        observed_state_revision: int | None = None,
        observed_lifecycle_version: int | None = None,
    ) -> ToolExecutionOutcome:
        latency_ms = max(0.0, (time.perf_counter() - started) * 1_000)
        result: dict[str, Any] | None = None
        state = self._controller.state
        known_revision = (
            state.state_revision if state is not None else self._last_state_revision
        )
        known_lifecycle = (
            state.lifecycle_version
            if state is not None
            else self._last_lifecycle_version
        )
        if (
            tool_name is not None
            and _valid_result_identity(identity)
            and known_revision is not None
            and known_lifecycle is not None
        ):
            result = {
                "contract_version": INTERVIEWER_TOOL_CONTRACT_VERSION,
                "tool_name": tool_name,
                "call_id": identity["call_id"],
                "session_id": identity["session_id"],
                "writer_id": identity["writer_id"],
                "writer_generation": identity["writer_generation"],
                "status": status,
                "observed_state_revision": (
                    observed_state_revision
                    if observed_state_revision is not None
                    else known_revision
                ),
                "observed_lifecycle_version": (
                    observed_lifecycle_version
                    if observed_lifecycle_version is not None
                    else known_lifecycle
                ),
                "payload": payload if status in ("ok", "duplicate") else None,
                "failure_code": (
                    None if status in ("ok", "duplicate") else status
                ),
                "latency_ms": round(latency_ms, 3),
            }
            try:
                result = parse_interviewer_tool_result(result)
            except InterviewerContractError:
                result = None
                status = "unavailable"
        self._record_tool(tool_name=tool_name, status=status, latency_ms=latency_ms)
        return ToolExecutionOutcome(
            tool_name=tool_name,
            status=status,
            result=result,
            fallback_required=status not in ("ok", "duplicate"),
        )

    def _record_tool(
        self,
        *,
        tool_name: str | None,
        status: ToolStatus,
        latency_ms: float,
    ) -> None:
        if tool_name is None or self._observability is None:
            return
        try:
            record = getattr(self._observability, "record", None)
            if callable(record):
                record(
                    "tool",
                    turn_correlation_id=None,
                    tool_contract_version=INTERVIEWER_TOOL_CONTRACT_VERSION,
                    tool_name=tool_name,
                    tool_outcome=status,
                    latency_ms=latency_ms,
                )
            if status not in ("ok", "duplicate"):
                fallback = getattr(self._observability, "record_fallback", None)
                if callable(fallback):
                    fallback(
                        "tool_timeout" if status == "timeout" else "tool_failure",
                        source="tool",
                    )
        except Exception:
            return

    def _request_identity(self, request: object) -> dict[str, Any]:
        if not isinstance(request, Mapping):
            return {}
        return {
            key: request.get(key)
            for key in (
                "tool_name",
                "call_id",
                "session_id",
                "writer_id",
                "writer_generation",
            )
        }

    def _wall_now(self) -> datetime:
        value = self._wall_clock()
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise InterviewerToolsError("invalid_wall_clock")
        return datetime.fromtimestamp(value, timezone.utc)

    def _resolve_monotonic_ms(self, value: int | None) -> int:
        candidate = self._monotonic_clock_ms() if value is None else value
        if type(candidate) is not int or candidate < 0:
            raise InterviewerToolsError("invalid_monotonic_clock")
        return candidate


def create_session_scoped_interviewer_tools(
    *,
    env: Mapping[str, str],
    controller: InterviewControllerAdapter,
    lifecycle_store: TrustedLifecycleSnapshotStore | None,
    observability: object | None = None,
    call_timeout_ms: int = INTERVIEWER_TOOL_CALL_TIMEOUT_MS,
    monotonic_clock_ms: Callable[[], int] | None = None,
    wall_clock: Callable[[], float] = time.time,
    operation_barrier: OperationBarrier | None = None,
) -> SessionScopedInterviewerTools:
    return SessionScopedInterviewerTools(
        controller=controller,
        lifecycle_store=lifecycle_store,
        enabled=env.get(INTERVIEWER_TOOLS_FEATURE_ENV) == "true",
        observability=observability,
        call_timeout_ms=call_timeout_ms,
        monotonic_clock_ms=monotonic_clock_ms,
        wall_clock=wall_clock,
        operation_barrier=operation_barrier,
    )


def _admission_status(admission: str) -> ToolStatus:
    return {
        "session_mismatch": "invalid_request",
        "stale_writer": "stale_writer",
        "request_expired": "expired",
        "deadline_elapsed": "closed",
        "move_expired": "expired",
        "stale_state": "stale_state",
        "stale_lifecycle": "unavailable",
        "question_mismatch": "stale_state",
        "move_not_allowed": "invalid_request",
        "lifecycle_not_active": "unavailable",
        "speech_fenced": "closed",
    }.get(admission, "invalid_request")


def _controller_error_status(code: str) -> ToolStatus:
    if code in ("stale_state", "question_mismatch", "source_turn_mismatch"):
        return "stale_state"
    if code == "stale_writer":
        return "stale_writer"
    if code in ("speech_fenced", "deadline_elapsed"):
        return "closed"
    if code in (
        "stale_lifecycle",
        "lifecycle_not_active",
        "lifecycle_reactivation_denied",
        "adapter_unavailable",
    ):
        return "unavailable"
    return "invalid_request"


def _bound_call_id(raw_call_id: str) -> str:
    value = raw_call_id if isinstance(raw_call_id, str) else ""
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return f"call:{digest}"


def _valid_result_identity(identity: Mapping[str, Any]) -> bool:
    return bool(
        isinstance(identity.get("call_id"), str)
        and identity["call_id"]
        and isinstance(identity.get("session_id"), str)
        and identity["session_id"]
        and isinstance(identity.get("writer_id"), str)
        and identity["writer_id"]
        and type(identity.get("writer_generation")) is int
        and identity["writer_generation"] > 0
    )


async def _no_op_barrier(_: str) -> None:
    await asyncio.sleep(0)
