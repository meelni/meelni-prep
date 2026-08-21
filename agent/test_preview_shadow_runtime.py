#!/usr/bin/env python3
"""Provider-free contracts for the lease-bounded Preview shadow runtime."""

from __future__ import annotations

import asyncio
import json
import sys
import unittest
from dataclasses import FrozenInstanceError
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from shared.interview_director import (  # noqa: E402
    DIRECTOR_CONTEXT_CONTRACT_VERSION,
    DirectorContext,
    DirectorContextTurn,
    DirectorError,
    DirectorShadowConfig,
    InterviewDirectorShadowSession,
)
from shared.interviewer_contracts import (  # noqa: E402
    DIRECTOR_POLICY_CONTRACT_VERSION,
)
from shared.openai_responses_director_adapter import (  # noqa: E402
    OPENAI_RESPONSES_DIRECTOR_ADAPTER_VERSION,
    OPENAI_RESPONSES_DIRECTOR_MODEL,
    ProviderFreeFakeOpenAIResponsesTransport,
    openai_responses_director_limits,
)
from shared.preview_shadow_runtime import (  # noqa: E402
    PREVIEW_SHADOW_AUTHORIZATION_DIGEST_VERSION,
    PREVIEW_SHADOW_CONFIGURATION_SHA256,
    PREVIEW_SHADOW_DURABLE_ADMISSION_VERIFIER_VERSION,
    PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION,
    PREVIEW_SHADOW_SESSION_LEASE_VERSION,
    PREVIEW_SHADOW_RUNTIME_CONFIG_VERSION,
    PreviewShadowEvidenceRecorder,
    PreviewShadowLocalSpendLedger,
    PreviewShadowRuntimeError,
    _digest,
    create_preview_shadow_runtime,
    parse_preview_shadow_session_lease,
)


NOW = datetime(2026, 8, 20, 8, 30, tzinfo=timezone.utc)
CANDIDATE_SHA = "a" * 40
RUN_ID = "c" * 64
SESSION_BINDING = "b" * 64
AUTHORIZATION_ID = "d" * 64


def lease_wire(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "contract_version": PREVIEW_SHADOW_SESSION_LEASE_VERSION,
        "run_id": RUN_ID,
        "authorization_id": AUTHORIZATION_ID,
        "candidate_git_sha": CANDIDATE_SHA,
        "preview_shadow_configuration_sha256": PREVIEW_SHADOW_CONFIGURATION_SHA256,
        "adapter_id": "meelni_director_openai_responses",
        "adapter_version": OPENAI_RESPONSES_DIRECTOR_ADAPTER_VERSION,
        "provider": "openai-api",
        "model": OPENAI_RESPONSES_DIRECTOR_MODEL,
        "target_stage": "preview_shadow",
        "target_environment": "preview_staging",
        "target_cohort": "shadow",
        "exposure": "none",
        "session_ordinal": 1,
        "session_binding_sha256": SESSION_BINDING,
        "session_budget_nano_usd": 1_000_000_000,
        "maximum_attempts": 10,
        "attempt_reservation_nano_usd": 100_000_000,
        "issued_at": "2026-08-20T08:00:00.000Z",
        "expires_at": "2026-08-20T09:00:00.000Z",
        "allocation_ledger_revision": 1,
    }
    payload.update(overrides)
    lease_id = _digest(PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION, payload)
    return {**payload, "lease_id": lease_id, "integrity_sha256": lease_id}


def parse_lease(value: dict[str, object] | None = None):
    return parse_preview_shadow_session_lease(
        value or lease_wire(),
        expected_run_id=RUN_ID,
        expected_candidate_git_sha=CANDIDATE_SHA,
        expected_session_binding_sha256=SESSION_BINDING,
        now=NOW,
    )


class AdmissionVerifier:
    contract_version = PREVIEW_SHADOW_DURABLE_ADMISSION_VERIFIER_VERSION

    def __init__(self, admitted: bool = True) -> None:
        self.admitted = admitted
        self.calls = 0

    def verify_admitted_session_lease(self, lease) -> bool:
        self.calls += 1
        return self.admitted and lease.lease_id == lease.integrity_sha256


def runtime(*, verifier: AdmissionVerifier | None = None, transport=None):
    constructed = create_preview_shadow_runtime(
        raw_lease=lease_wire(),
        expected_run_id=RUN_ID,
        expected_candidate_git_sha=CANDIDATE_SHA,
        expected_session_binding_sha256=SESSION_BINDING,
        now=NOW,
        admission_verifier=verifier or AdmissionVerifier(),
        transport_factory=lambda _lease: transport
        or ProviderFreeFakeOpenAIResponsesTransport(),
        kill_switch_open=True,
    )
    if constructed.status != "ready" or constructed.runtime is None:
        raise AssertionError((constructed.status, constructed.reason))
    return constructed.runtime


def director_context() -> DirectorContext:
    return DirectorContext(
        contract_version=DIRECTOR_CONTEXT_CONTRACT_VERSION,
        policy_version=DIRECTOR_POLICY_CONTRACT_VERSION,
        model_adapter_version=OPENAI_RESPONSES_DIRECTOR_ADAPTER_VERSION,
        affinity_key="affinity:" + "e" * 64,
        session_id="session-preview-shadow",
        brief_id="brief:preview-shadow",
        writer_id="writer-preview-shadow",
        writer_generation=1,
        state_revision=1,
        lifecycle_version=1,
        active_question_id="question-preview-shadow",
        round_objective_id="clarify_product_goal",
        current_topic="objective_and_scope",
        allowed_moves=("probe", "transition", "close"),
        source_turn_id="turn-1",
        source_transcript_revision="event:user:1",
        source_finality="finalized",
        turns=(
            DirectorContextTurn(
                turn_id="turn-1",
                transcript_revision="event:user:1",
                sequence=1,
                speaker="candidate",
                finality="finalized",
                text="I would start by clarifying the objective.",
            ),
        ),
    )


def response() -> dict[str, object]:
    output = json.dumps(
        {
            "move_type": "probe",
            "topic": "objective_and_scope",
            "reason_code": "deepen_reasoning",
        },
        separators=(",", ":"),
    )
    return {
        "object": "response",
        "status": "completed",
        "error": None,
        "incomplete_details": None,
        "model": OPENAI_RESPONSES_DIRECTOR_MODEL,
        "service_tier": "default",
        "background": False,
        "previous_response_id": None,
        "parallel_tool_calls": False,
        "tool_choice": "none",
        "tools": [],
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "status": "completed",
                "content": [
                    {
                        "type": "output_text",
                        "annotations": [],
                        "text": output,
                    }
                ],
            }
        ],
        "usage": {
            "input_tokens": 100,
            "input_tokens_details": {
                "cache_write_tokens": 0,
                "cached_tokens": 0,
            },
            "output_tokens": 20,
            "output_tokens_details": {"reasoning_tokens": 0},
            "total_tokens": 120,
        },
    }


class SettledShadow:
    def __init__(
        self,
        *,
        idle: bool = True,
        wait_forever: bool = False,
        shutdown_forever: bool = False,
        shutdown_error: bool = False,
        wait_gate: asyncio.Event | None = None,
    ) -> None:
        self.idle = idle
        self.wait_forever = wait_forever
        self.shutdown_forever = shutdown_forever
        self.shutdown_error = shutdown_error
        self.wait_gate = wait_gate
        self.settle_calls = 0
        self.wait_calls = 0
        self.shutdown_calls = 0
        self.forbidden_calls = 0
        self.wait_started = asyncio.Event()
        self.wait_cancelled = asyncio.Event()
        self.shutdown_started = asyncio.Event()
        self.shutdown_cancelled = asyncio.Event()
        self.adapter_close_observed = False

    def settle(self) -> None:
        self.settle_calls += 1

    async def wait_idle(self, timeout_seconds: float) -> bool:
        self.wait_calls += 1
        self.wait_started.set()
        try:
            if self.wait_forever:
                await asyncio.Event().wait()
            if self.wait_gate is not None:
                await self.wait_gate.wait()
            await asyncio.sleep(0)
            return self.idle
        except asyncio.CancelledError:
            self.wait_cancelled.set()
            raise

    async def shutdown(self) -> bool:
        self.shutdown_calls += 1
        self.shutdown_started.set()
        try:
            if self.shutdown_forever:
                await asyncio.Event().wait()
            if self.shutdown_error:
                raise RuntimeError("content-must-not-escape")
            self.adapter_close_observed = True
            return True
        except asyncio.CancelledError:
            self.shutdown_cancelled.set()
            raise

    def say(self, _text: str) -> None:
        self.forbidden_calls += 1

    def write_transcript(self, _text: str) -> None:
        self.forbidden_calls += 1

    def write_feedback(self, _text: str) -> None:
        self.forbidden_calls += 1


class CloseProbeAdapter:
    version = "director-close-probe.v1"

    def __init__(self, *, fail: bool = False, wait_forever: bool = False) -> None:
        self.fail = fail
        self.wait_forever = wait_forever
        self.close_calls = 0
        self.close_cancelled = asyncio.Event()

    async def close(self, *, affinity_key: str) -> None:
        del affinity_key
        self.close_calls += 1
        try:
            if self.wait_forever:
                await asyncio.Event().wait()
            if self.fail:
                raise RuntimeError("provider-secret-body")
        except asyncio.CancelledError:
            self.close_cancelled.set()
            raise


class PreviewShadowLeaseTests(unittest.TestCase):
    def test_cross_runtime_config_authorization_and_lease_digests(self):
        pending = json.loads(
            Path(
                "docs/evidence/adaptive-interviewer-preview-shadow-authorization-request.pending.json"
            ).read_text()
        )
        fixture = json.loads(
            Path(
                "docs/evidence/adaptive-interviewer-preview-shadow-cross-runtime-digests.json"
            ).read_text()
        )
        config = pending["preview_shadow_configuration"]
        self.assertEqual(
            _digest(PREVIEW_SHADOW_RUNTIME_CONFIG_VERSION, config),
            fixture["configuration_sha256"],
        )
        authorization = {
            **fixture["authorization_before_configuration"],
            "preview_shadow_configuration": config,
            **fixture["authorization_after_configuration"],
        }
        self.assertEqual(
            _digest(PREVIEW_SHADOW_AUTHORIZATION_DIGEST_VERSION, authorization),
            fixture["authorization_sha256"],
        )
        lease = fixture["lease"]
        lease_payload = {
            key: value
            for key, value in lease.items()
            if key not in ("lease_id", "integrity_sha256")
        }
        self.assertEqual(
            _digest(PREVIEW_SHADOW_SESSION_LEASE_DIGEST_VERSION, lease_payload),
            lease["lease_id"],
        )
        parsed = parse_preview_shadow_session_lease(
            lease,
            expected_run_id=RUN_ID,
            expected_candidate_git_sha=CANDIDATE_SHA,
            expected_session_binding_sha256=SESSION_BINDING,
            now=NOW,
        )
        self.assertEqual(parsed.lease_id, lease["lease_id"])

    def test_exact_lease_is_copied_immutable_and_drift_fails_closed(self):
        wire = lease_wire()
        parsed = parse_lease(dict(reversed(list(wire.items()))))
        wire["maximum_attempts"] = 11
        self.assertEqual(parsed.maximum_attempts, 10)
        with self.assertRaises(FrozenInstanceError):
            parsed.maximum_attempts = 11  # type: ignore[misc]

        mutations = (
            {"extra": True},
            {"run_id": RUN_ID.upper()},
            {"run_id": f" {RUN_ID}"},
            {"target_stage": "preview_shadow "},
            {"session_ordinal": 9_007_199_254_740_992},
            {"session_ordinal": True},
            {"issued_at": "2026-08-20T08:00:00Z"},
            {"integrity_sha256": "0" * 64},
        )
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                candidate = lease_wire()
                candidate.update(mutation)
                with self.assertRaisesRegex(
                    PreviewShadowRuntimeError, "invalid_lease"
                ):
                    parse_lease(candidate)

        for at in (
            datetime(2026, 8, 20, 7, 59, 59, tzinfo=timezone.utc),
            datetime(2026, 8, 20, 9, 0, tzinfo=timezone.utc),
        ):
            with self.assertRaisesRegex(PreviewShadowRuntimeError, "invalid_lease"):
                parse_preview_shadow_session_lease(
                    lease_wire(),
                    expected_run_id=RUN_ID,
                    expected_candidate_git_sha=CANDIDATE_SHA,
                    expected_session_binding_sha256=SESSION_BINDING,
                    now=at,
                )

    def test_self_digest_is_not_admission_and_default_construction_is_off(self):
        default = create_preview_shadow_runtime()
        self.assertEqual((default.status, default.reason), ("disabled", "default_off"))
        self.assertIsNone(default.adapter)
        missing = create_preview_shadow_runtime(raw_lease=lease_wire())
        self.assertEqual(
            (missing.status, missing.reason),
            ("unavailable", "durable_admission_verifier_unavailable"),
        )
        self.assertIsNone(missing.adapter)
        killed = create_preview_shadow_runtime(
            raw_lease=lease_wire(),
            expected_run_id=RUN_ID,
            expected_candidate_git_sha=CANDIDATE_SHA,
            expected_session_binding_sha256=SESSION_BINDING,
            now=NOW,
            admission_verifier=AdmissionVerifier(),
            transport_factory=lambda _lease: (
                ProviderFreeFakeOpenAIResponsesTransport()
            ),
            kill_switch_open=False,
        )
        self.assertEqual((killed.status, killed.reason), ("disabled", "kill_switch_closed"))
        self.assertIsNone(killed.adapter)
        rejected = AdmissionVerifier(False)
        denied = create_preview_shadow_runtime(
            raw_lease=lease_wire(),
            expected_run_id=RUN_ID,
            expected_candidate_git_sha=CANDIDATE_SHA,
            expected_session_binding_sha256=SESSION_BINDING,
            now=NOW,
            admission_verifier=rejected,
            transport_factory=lambda _lease: (
                ProviderFreeFakeOpenAIResponsesTransport()
            ),
            kill_switch_open=True,
        )
        self.assertEqual(
            (denied.status, denied.reason),
            ("unavailable", "session_lease_not_admitted"),
        )
        self.assertIsNone(denied.adapter)
        self.assertEqual(rejected.calls, 1)
        admitted = AdmissionVerifier()
        created = runtime(verifier=admitted)
        self.assertIsNotNone(created)
        self.assertEqual(admitted.calls, 1)

        expired = create_preview_shadow_runtime(
            raw_lease=lease_wire(),
            expected_run_id=RUN_ID,
            expected_candidate_git_sha=CANDIDATE_SHA,
            expected_session_binding_sha256=SESSION_BINDING,
            now=datetime(2026, 8, 20, 9, 0, tzinfo=timezone.utc),
            admission_verifier=AdmissionVerifier(),
            transport_factory=lambda _lease: (
                ProviderFreeFakeOpenAIResponsesTransport()
            ),
            kill_switch_open=True,
        )
        self.assertEqual(
            (expired.status, expired.reason),
            ("unavailable", "session_lease_invalid"),
        )
        self.assertIsNone(expired.adapter)

        app_source = Path("agent/interview/agent.py").read_text()
        runtime_source = Path("agent/shared/preview_shadow_runtime.py").read_text()
        self.assertIn("create_production_director_runtime", app_source)
        self.assertIn("adapter=production_director.adapter", app_source)
        self.assertNotIn("create_preview_shadow_runtime", app_source)
        self.assertNotIn("os.environ", runtime_source)
        self.assertNotIn("os.getenv", runtime_source)
        self.assertNotIn("activateOnce", runtime_source)
        self.assertNotIn("maximum_sessions", runtime_source)


class PreviewShadowSpendTests(unittest.TestCase):
    def fresh_ledger(self):
        lease = parse_lease()
        evidence = PreviewShadowEvidenceRecorder(session_ordinal=1)
        return PreviewShadowLocalSpendLedger(lease, evidence), evidence

    def test_every_attempt_retains_a_conservative_reservation(self):
        ledger, evidence = self.fresh_ledger()
        first = ledger.reserve_attempt()
        receipt = ledger.reconcile_attempt(
            first,
            "succeeded",
            normalized_cost_evidence_nano_usd=1,
        )
        self.assertEqual(receipt.reconciled_nano_usd, 100_000_000)

        second = ledger.reserve_attempt()
        with self.assertRaisesRegex(PreviewShadowRuntimeError, "attempt_invalid"):
            ledger.reconcile_attempt(
                second,
                "succeeded",
                normalized_cost_evidence_nano_usd=None,
            )
        self.assertEqual(ledger.outstanding_reserved_nano_usd, 100_000_000)
        ledger.reconcile_attempt(second, "ambiguous")
        for outcome in (
            "failed",
            "timeout",
            "cancelled",
            "invalid_response",
            "ambiguous",
            "failed",
            "timeout",
            "cancelled",
        ):
            ledger.reconcile_attempt(ledger.reserve_attempt(), outcome)
        self.assertEqual(ledger.attempt_count, 10)
        self.assertEqual(ledger.reconciled_nano_usd, 1_000_000_000)
        self.assertFalse(ledger.admission_open)
        with self.assertRaisesRegex(
            PreviewShadowRuntimeError, "session_budget_exhausted"
        ):
            ledger.reserve_attempt()
        self.assertEqual(ledger.outstanding_reserved_nano_usd, 0)
        self.assertTrue(
            all("text" not in event.to_wire() for event in evidence.events)
        )

    def test_upward_reconciliation_stops_before_another_request(self):
        ledger, _ = self.fresh_ledger()
        for _ in range(9):
            ledger.reconcile_attempt(
                ledger.reserve_attempt(),
                "succeeded",
                normalized_cost_evidence_nano_usd=1,
            )
        ledger.reconcile_attempt(
            ledger.reserve_attempt(),
            "succeeded",
            normalized_cost_evidence_nano_usd=200_000_000,
        )
        self.assertEqual(ledger.reconciled_nano_usd, 1_100_000_000)
        self.assertFalse(ledger.admission_open)
        with self.assertRaisesRegex(
            PreviewShadowRuntimeError, "session_budget_exhausted"
        ):
            ledger.reserve_attempt()

    def test_reconcile_rejects_integer_aliases_and_is_atomic(self):
        ledger, evidence = self.fresh_ledger()
        ordinal = ledger.reserve_attempt()

        def snapshot():
            return (
                ledger._next_attempt_ordinal,
                dict(ledger._open),
                ledger.receipts,
                ledger.reconciled_nano_usd,
                ledger.admission_open,
                tuple(event.to_wire() for event in evidence.events),
            )

        baseline = snapshot()
        invalid_calls = (
            lambda: ledger.reconcile_attempt(True, "failed"),
            lambda: ledger.reconcile_attempt(1.0, "failed"),
            lambda: ledger.reconcile_attempt(float("nan"), "failed"),
            lambda: ledger.reconcile_attempt(float("inf"), "failed"),
            lambda: ledger.reconcile_attempt(-1, "failed"),
            lambda: ledger.reconcile_attempt(9_007_199_254_740_992, "failed"),
            lambda: ledger.reconcile_attempt(ordinal, []),
            lambda: ledger.reconcile_attempt(ordinal, "provider-secret-body"),
            lambda: ledger.reconcile_attempt(
                ordinal,
                "succeeded",
                normalized_cost_evidence_nano_usd=True,
            ),
            lambda: ledger.reconcile_attempt(
                ordinal,
                "succeeded",
                normalized_cost_evidence_nano_usd=-1,
            ),
            lambda: ledger.reconcile_attempt(
                ordinal,
                "succeeded",
                normalized_cost_evidence_nano_usd=float("nan"),
            ),
            lambda: ledger.reconcile_attempt(
                ordinal,
                "failed",
                normalized_cost_evidence_nano_usd=1,
            ),
        )
        for invalid_call in invalid_calls:
            with self.subTest(call=repr(invalid_call)):
                with self.assertRaisesRegex(
                    PreviewShadowRuntimeError, "attempt_invalid"
                ):
                    invalid_call()
                self.assertEqual(snapshot(), baseline)


class PreviewShadowAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_adapter_accounts_success_invalid_response_and_cancel(self):
        limits = openai_responses_director_limits()

        success_runtime = runtime(
            transport=ProviderFreeFakeOpenAIResponsesTransport([response()])
        )
        assert success_runtime is not None
        await success_runtime.adapter.recommend(director_context(), limits=limits)
        self.assertEqual(success_runtime.ledger.reconciled_nano_usd, 100_000_000)
        self.assertEqual(success_runtime.ledger.receipts[-1].outcome, "succeeded")

        invalid_runtime = runtime(
            transport=ProviderFreeFakeOpenAIResponsesTransport([{}])
        )
        assert invalid_runtime is not None
        with self.assertRaises(DirectorError):
            await invalid_runtime.adapter.recommend(director_context(), limits=limits)
        self.assertEqual(invalid_runtime.ledger.receipts[-1].outcome, "invalid_response")

        cancel_runtime = runtime(
            transport=ProviderFreeFakeOpenAIResponsesTransport(
                [asyncio.CancelledError()]
            )
        )
        assert cancel_runtime is not None
        with self.assertRaises(asyncio.CancelledError):
            await cancel_runtime.adapter.recommend(director_context(), limits=limits)
        self.assertEqual(cancel_runtime.ledger.receipts[-1].outcome, "cancelled")

    async def test_adapter_preserves_closed_timeout_and_transport_outcomes(self):
        limits = openai_responses_director_limits()
        for transport_error, expected_code, expected_outcome in (
            (asyncio.TimeoutError(), "deadline_exceeded", "timeout"),
            (RuntimeError("provider detail must not escape"), "transport_unavailable", "failed"),
        ):
            with self.subTest(expected_code=expected_code):
                created = runtime(
                    transport=ProviderFreeFakeOpenAIResponsesTransport(
                        [transport_error]
                    )
                )
                assert created is not None
                with self.assertRaises(DirectorError) as caught:
                    await created.adapter.recommend(
                        director_context(), limits=limits
                    )
                self.assertEqual(caught.exception.code, expected_code)
                self.assertNotIn("provider detail", str(caught.exception))
                self.assertEqual(
                    created.ledger.receipts[-1].outcome,
                    expected_outcome,
                )


class PreviewShadowLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_settle_is_bounded_idempotent_and_never_touches_customer_outputs(self):
        created = runtime()
        assert created is not None
        shadow = SettledShadow()
        self.assertTrue(await created.settle_shadow(shadow))
        terminal_before = len(
            [
                event
                for event in created.evidence.events
                if event.reason in ("settle_completed", "settle_timeout")
            ]
        )
        self.assertTrue(await created.settle_shadow(shadow))
        self.assertEqual(shadow.settle_calls, 1)
        self.assertEqual(shadow.wait_calls, 1)
        self.assertEqual(shadow.shutdown_calls, 1)
        self.assertEqual(shadow.forbidden_calls, 0)
        self.assertEqual(
            len(
                [
                    event
                    for event in created.evidence.events
                    if event.reason in ("settle_completed", "settle_timeout")
                ]
            ),
            terminal_before,
        )

        receipt = created.create_session_receipt()
        self.assertIs(
            receipt,
            created.create_session_receipt(),
        )
        with self.assertRaises(FrozenInstanceError):
            receipt.outcome = "stopped"  # type: ignore[misc]
        wire = receipt.to_wire()
        self.assertEqual(set(wire) & {"text", "transcript", "feedback", "audio"}, set())

    async def test_timeout_and_cancellation_close_admission_and_retain_ambiguous_reserve(self):
        timed = runtime()
        assert timed is not None
        timed.ledger.reserve_attempt()
        timed_shadow = SettledShadow(wait_forever=True)
        started = asyncio.get_running_loop().time()
        self.assertFalse(await timed.settle_shadow(timed_shadow))
        self.assertLess(asyncio.get_running_loop().time() - started, 0.6)
        self.assertTrue(timed_shadow.wait_cancelled.is_set())
        self.assertEqual(timed_shadow.shutdown_calls, 1)
        self.assertTrue(timed_shadow.adapter_close_observed)
        self.assertFalse(timed.ledger.admission_open)
        self.assertEqual(timed.ledger.reconciled_nano_usd, 100_000_000)
        self.assertEqual(timed.ledger.receipts[-1].outcome, "ambiguous")
        self.assertTrue(timed.ledger.cleanup_completed)
        timeout_receipt = timed.create_session_receipt()
        self.assertEqual(timeout_receipt.outcome, "stopped")
        self.assertTrue(timed._settle_task is not None and timed._settle_task.done())

        cancelled = runtime()
        assert cancelled is not None
        cancelled.ledger.reserve_attempt()
        shadow = SettledShadow(wait_forever=True)
        task = asyncio.create_task(cancelled.settle_shadow(shadow))
        await shadow.wait_started.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(shadow.wait_cancelled.is_set())
        self.assertTrue(shadow.adapter_close_observed)
        self.assertFalse(cancelled.ledger.admission_open)
        self.assertTrue(cancelled.ledger.closed)
        self.assertEqual(cancelled.ledger.receipts[-1].outcome, "ambiguous")
        self.assertFalse(await cancelled.settle_shadow(shadow))
        self.assertEqual(shadow.settle_calls, 1)

    async def test_concurrent_settle_callers_share_cleanup_result_and_receipt(self):
        created = runtime()
        assert created is not None
        gate = asyncio.Event()
        shadow = SettledShadow(wait_gate=gate)
        first = asyncio.create_task(created.settle_shadow(shadow))
        await shadow.wait_started.wait()
        second = asyncio.create_task(created.settle_shadow(shadow))
        await asyncio.sleep(0)
        self.assertEqual(shadow.settle_calls, 1)
        gate.set()
        self.assertEqual(await asyncio.gather(first, second), [True, True])
        self.assertEqual(shadow.shutdown_calls, 1)
        self.assertTrue(shadow.adapter_close_observed)
        first_receipt = created.create_session_receipt()
        self.assertIs(first_receipt, created.create_session_receipt())
        self.assertEqual(first_receipt.outcome, "settled")

    async def test_wait_failure_still_closes_adapter_and_derives_stopped_receipt(self):
        created = runtime()
        assert created is not None
        shadow = SettledShadow(idle=False)
        self.assertFalse(await created.settle_shadow(shadow))
        self.assertEqual((shadow.wait_calls, shadow.shutdown_calls), (1, 1))
        self.assertTrue(shadow.adapter_close_observed)
        self.assertTrue(created.ledger.closed)
        self.assertEqual(created.create_session_receipt().outcome, "stopped")

    async def test_unconfirmed_shutdown_never_freezes_a_terminal_receipt(self):
        for shadow in (
            SettledShadow(shutdown_error=True),
            SettledShadow(shutdown_forever=True),
        ):
            with self.subTest(shutdown_error=shadow.shutdown_error):
                created = runtime()
                assert created is not None
                started = asyncio.get_running_loop().time()
                self.assertFalse(await created.settle_shadow(shadow))
                self.assertLess(asyncio.get_running_loop().time() - started, 0.6)
                self.assertFalse(created.ledger.admission_open)
                self.assertFalse(created.ledger.closed)
                self.assertFalse(created.ledger.cleanup_completed)
                if shadow.shutdown_forever:
                    self.assertTrue(shadow.shutdown_cancelled.is_set())
                with self.assertRaisesRegex(
                    PreviewShadowRuntimeError, "attempt_invalid"
                ):
                    created.create_session_receipt()
                incident = created.create_stop_incomplete_incident()
                self.assertIs(
                    incident,
                    created.create_stop_incomplete_incident(),
                )
                self.assertEqual(incident.reason, "cleanup_unconfirmed")
                self.assertEqual(
                    incident.retained_session_reservation_nano_usd,
                    1_000_000_000,
                )
                self.assertTrue(incident.requires_allocation_stop)
                self.assertTrue(incident.termination_acknowledgement_required)
                self.assertEqual(
                    set(incident.to_wire())
                    & {"text", "transcript", "feedback", "audio", "identity"},
                    set(),
                )
                self.assertFalse(await created.settle_shadow(shadow))

    async def test_concurrent_incomplete_settle_callers_share_one_incident(self):
        created = runtime()
        assert created is not None
        shadow = SettledShadow(shutdown_forever=True)
        first = asyncio.create_task(created.settle_shadow(shadow))
        await shadow.shutdown_started.wait()
        second = asyncio.create_task(created.settle_shadow(shadow))
        self.assertEqual(await asyncio.gather(first, second), [False, False])
        self.assertEqual(shadow.shutdown_calls, 1)
        first_incident = created.create_stop_incomplete_incident()
        self.assertIs(
            first_incident,
            created.create_stop_incomplete_incident(),
        )

    async def test_actual_director_requires_adapter_close_confirmation(self):
        for adapter in (
            CloseProbeAdapter(fail=True),
            CloseProbeAdapter(wait_forever=True),
        ):
            with self.subTest(
                fail=adapter.fail,
                wait_forever=adapter.wait_forever,
            ):
                created = runtime()
                assert created is not None
                shadow = InterviewDirectorShadowSession(
                    config=DirectorShadowConfig(enabled=False),
                    session_id="session-preview-close",
                    adapter=adapter,
                    state_provider=lambda: None,
                )
                self.assertFalse(await created.settle_shadow(shadow))
                self.assertEqual(adapter.close_calls, 1)
                if adapter.wait_forever:
                    self.assertTrue(adapter.close_cancelled.is_set())
                self.assertFalse(created.ledger.cleanup_completed)
                with self.assertRaisesRegex(
                    PreviewShadowRuntimeError, "attempt_invalid"
                ):
                    created.create_session_receipt()
                self.assertEqual(
                    created.create_stop_incomplete_incident().reason,
                    "cleanup_unconfirmed",
                )

    async def test_repeated_caller_cancellation_waits_for_shared_cleanup(self):
        created = runtime()
        assert created is not None
        shadow = SettledShadow(shutdown_forever=True)
        caller = asyncio.create_task(created.settle_shadow(shadow))
        await shadow.shutdown_started.wait()
        caller.cancel()
        await asyncio.sleep(0)
        caller.cancel()
        await asyncio.sleep(0)
        self.assertFalse(caller.done())
        with self.assertRaises(asyncio.CancelledError):
            await caller
        self.assertTrue(created._settle_task is not None)
        self.assertTrue(created._settle_task.done())
        self.assertTrue(shadow.shutdown_cancelled.is_set())
        self.assertFalse(created.ledger.cleanup_completed)
        first_incident = created.create_stop_incomplete_incident()
        self.assertIs(first_incident, created.create_stop_incomplete_incident())

    async def test_repeated_child_cancellation_freezes_one_incomplete_result(self):
        created = runtime()
        assert created is not None
        shadow = SettledShadow(shutdown_forever=True)
        caller = asyncio.create_task(created.settle_shadow(shadow))
        await shadow.shutdown_started.wait()
        assert created._settle_task is not None
        created._settle_task.cancel()
        created._settle_task.cancel()
        self.assertFalse(await asyncio.wait_for(caller, timeout=0.6))
        self.assertTrue(created._settle_task.done())
        self.assertFalse(created.ledger.cleanup_completed)
        self.assertFalse(created.ledger.admission_open)
        with self.assertRaisesRegex(
            PreviewShadowRuntimeError, "attempt_invalid"
        ):
            created.create_session_receipt()
        first_incident = created.create_stop_incomplete_incident()
        self.assertIs(first_incident, created.create_stop_incomplete_incident())


if __name__ == "__main__":
    unittest.main()
