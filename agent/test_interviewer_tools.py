#!/usr/bin/env python3
"""Behavior tests for bounded session-scoped interviewer tools."""

import asyncio
import copy
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent))

from shared.interview_controller import (  # noqa: E402
    TerminalSettled,
    reduce_controller,
)
from shared.interview_controller_adapter import (  # noqa: E402
    CONTROLLER_FEATURE_ENV,
    MAX_SAME_HANDLE_CONTINUATIONS,
    InterviewControllerAdapter,
    ReplySuppressionGate,
    SpeechCompletionAcceptance,
    allow_controller_generation,
    create_interview_controller_adapter,
)
from shared.interviewer_contract_canonicalization import (  # noqa: E402
    calculate_interviewer_mutation_request_digest,
)
from shared.interviewer_contracts import (  # noqa: E402
    INTERVIEWER_TOOL_CONTRACT_VERSION,
    parse_interviewer_tool_result,
)
from shared.interviewer_tools import (  # noqa: E402
    INTERVIEWER_TOOLS_FEATURE_ENV,
    TRUSTED_LIFECYCLE_SNAPSHOT_CONTRACT_VERSION,
    InterviewerToolsError,
    SessionScopedInterviewerTools,
    TrustedLifecycleSnapshot,
    TrustedLifecycleSnapshotStore,
    create_session_scoped_interviewer_tools,
)


class FakeObservability:
    def __init__(self):
        self.events = []
        self.fallbacks = []

    def record(self, event_kind, **fields):
        self.events.append((event_kind, fields))
        return True

    def record_fallback(self, reason, *, source):
        self.fallbacks.append((reason, source))
        return True


class InterviewerToolsTests(unittest.IsolatedAsyncioTestCase):
    START = datetime(2026, 8, 19, 12, 0, tzinfo=timezone.utc)

    def make_brief(self):
        return {
            "contract_version": "interview-brief.v2",
            "brief_id": "brief:472",
            "session_id": "session-472",
            "deadline_at": "2026-08-19T12:30:00.000Z",
            "duration_minutes": 30,
            "selected_question": {"id": "question-472"},
            "round_pack": {
                "objectives": [
                    "clarify_product_goal",
                    "prioritize_target_user",
                    "identify_core_problem",
                ],
                "probe_families": [
                    "objective_and_scope",
                    "user_segmentation",
                    "problem_evidence",
                ],
            },
        }

    def make_runtime(
        self,
        *,
        observed_at=None,
        monotonic_ms=1_001,
        enabled=True,
        call_timeout_ms=150,
        operation_barrier=None,
        observability=None,
        prepare=True,
    ):
        observed_at = observed_at or self.START
        clock = [monotonic_ms]
        wall = [observed_at.timestamp() + (monotonic_ms - 1_000) / 1_000]
        controller = create_interview_controller_adapter(
            env={CONTROLLER_FEATURE_ENV: "true"},
            session_id="session-472",
            deadline_at="2026-08-19T12:30:00.000Z",
            writer_id="writer-1",
            writer_generation=3,
            interview_brief=self.make_brief(),
            lifecycle_state="active",
            lifecycle_version=7,
            observed_at=observed_at,
            monotonic_ms=1_000,
        )
        snapshot = TrustedLifecycleSnapshot(
            contract_version=TRUSTED_LIFECYCLE_SNAPSHOT_CONTRACT_VERSION,
            session_id="session-472",
            writer_id="writer-1",
            writer_generation=3,
            state="active",
            version=7,
            observed_monotonic_ms=1_000,
            valid_until_monotonic_ms=10_000,
        )
        store = TrustedLifecycleSnapshotStore(snapshot, monotonic_ms=1_000)
        tools = create_session_scoped_interviewer_tools(
            env={INTERVIEWER_TOOLS_FEATURE_ENV: "true" if enabled else "false"},
            controller=controller,
            lifecycle_store=store,
            observability=observability,
            call_timeout_ms=call_timeout_ms,
            monotonic_clock_ms=lambda: clock[0],
            wall_clock=lambda: wall[0],
            operation_barrier=operation_barrier,
        )
        directive = None
        if prepare:
            directive = controller.prepare_user_turn_for_tools(
                message_id="turn-1",
                transcript_revision="writer-1:turn-1",
                text=(
                    "I would define the target user, understand their problem, "
                    "and prioritize the highest-impact opportunity."
                ),
                duration_ms=8_000,
                monotonic_ms=clock[0],
            )
        return controller, tools, store, clock, wall, directive

    def authorize_tool_handle(self, controller, directive, *, handle_id="speech-1"):
        items = [
            SimpleNamespace(role="user", id="turn-1"),
            SimpleNamespace(role="system", id=directive.generation_context_id),
        ]
        acceptance = controller.speech_created(
            handle_id=handle_id,
            monotonic_ms=1_002,
        )
        self.assertIsNotNone(acceptance)
        self.assertTrue(
            allow_controller_generation(
                controller,
                ReplySuppressionGate(),
                items,
                monotonic_ms=1_002,
            )
        )
        return items, acceptance

    async def test_all_five_tools_return_strict_typed_results(self):
        controller, tools, _, _, _, _ = self.make_runtime()
        state = controller.state
        self.assertIsNotNone(state)

        state_result = await tools.execute(
            tools.build_read_request(
                tool_name="read_interview_state",
                raw_call_id="state-call",
            )
        )
        clock_result = await tools.execute(
            tools.build_read_request(
                tool_name="read_interview_clock",
                raw_call_id="clock-call",
            )
        )
        probes_result = await tools.execute(
            tools.build_probe_candidates_request(
                raw_call_id="probe-call",
                expected_state_revision=state.state_revision,
                expected_lifecycle_version=state.lifecycle_version,
                active_question_id=state.active_question_id,
            )
        )
        for outcome in (state_result, clock_result, probes_result):
            self.assertEqual(outcome.status, "ok")
            self.assertIsNotNone(outcome.result)
            parse_interviewer_tool_result(outcome.result)
        self.assertEqual(controller.state.state_revision, state.state_revision)
        candidates = probes_result.result["payload"]["probe_candidates"]
        self.assertEqual(
            [candidate["move_type"] for candidate in candidates],
            ["probe", "clarify", "challenge"],
        )

        commit_request = tools.build_commit_request(
            raw_call_id="commit-call",
            contract_version=INTERVIEWER_TOOL_CONTRACT_VERSION,
            expected_state_revision=state.state_revision,
            expected_lifecycle_version=state.lifecycle_version,
            move_type="probe",
            probe_candidate_id=candidates[0]["probe_candidate_id"],
            idempotency_key="commit-key-1",
        )
        commit_result = await tools.execute(commit_request)
        self.assertEqual(commit_result.status, "ok")
        parse_interviewer_tool_result(commit_result.result)
        self.assertEqual(controller.state.pending_move_id, "move:session-472:1")
        self.assertEqual(controller.state.move_ledger[-1].stage, "admitted")

        close_controller, close_tools, _, _, _, _ = self.make_runtime()
        close_state = close_controller.state
        close_result = await close_tools.execute(
            close_tools.build_close_request(
                raw_call_id="close-call",
                expected_state_revision=close_state.state_revision,
                expected_lifecycle_version=close_state.lifecycle_version,
                idempotency_key="close-key-1",
                reason="controller_policy",
            )
        )
        self.assertEqual(close_result.status, "ok")
        parse_interviewer_tool_result(close_result.result)
        self.assertEqual(close_controller.state.close_state, "admitted")
        self.assertEqual(close_controller.state.move_ledger[-1].move_type, "close")

    async def test_malformed_timeout_disabled_and_unavailable_are_fallbacks(self):
        observability = FakeObservability()
        controller, tools, _, _, _, _ = self.make_runtime(
            observability=observability
        )
        malformed = tools.build_read_request(
            tool_name="read_interview_state",
            raw_call_id="malformed-call",
        )
        malformed["unexpected"] = True
        malformed_result = await tools.execute(malformed)
        self.assertEqual(malformed_result.status, "invalid_request")
        self.assertTrue(malformed_result.fallback_required)
        parse_interviewer_tool_result(malformed_result.result)

        async def slow_barrier(_):
            await asyncio.sleep(0.05)

        timed_controller, timed_tools, _, _, _, _ = self.make_runtime(
            call_timeout_ms=5,
            operation_barrier=slow_barrier,
            observability=observability,
        )
        timed_revision = timed_controller.state.state_revision
        timeout_result = await timed_tools.execute(
            timed_tools.build_read_request(
                tool_name="read_interview_clock",
                raw_call_id="timeout-call",
            )
        )
        self.assertEqual(timeout_result.status, "timeout")
        self.assertEqual(timed_controller.state.state_revision, timed_revision)

        _, disabled, _, _, _, _ = self.make_runtime(enabled=False)
        disabled_result = await disabled.execute(
            disabled.build_read_request(
                tool_name="read_interview_state",
                raw_call_id="disabled-call",
            )
        )
        self.assertEqual(disabled_result.status, "unavailable")

        unavailable_controller = InterviewControllerAdapter(
            state=None,
            failure_reason="controller_unavailable",
        )
        unavailable = SessionScopedInterviewerTools(
            controller=unavailable_controller,
            lifecycle_store=None,
            enabled=True,
            monotonic_clock_ms=lambda: 1_001,
            wall_clock=lambda: self.START.timestamp(),
        )
        unavailable_result = await unavailable.execute({"bad": "request"})
        self.assertEqual(unavailable_result.status, "invalid_request")
        self.assertIsNone(unavailable_result.result)
        self.assertIn("tool_timeout", [reason for reason, _ in observability.fallbacks])
        self.assertTrue(
            all(
                set(fields)
                <= {
                    "turn_correlation_id",
                    "tool_contract_version",
                    "tool_name",
                    "tool_outcome",
                    "latency_ms",
                }
                for _, fields in observability.events
            )
        )

    async def test_stale_writer_revision_lifecycle_and_wrong_turn_do_not_mutate(self):
        controller, tools, _, _, _, _ = self.make_runtime()
        state = controller.state
        revision = state.state_revision

        stale_revision = tools.build_probe_candidates_request(
            raw_call_id="stale-state-call",
            expected_state_revision=revision - 1,
            expected_lifecycle_version=state.lifecycle_version,
            active_question_id=state.active_question_id,
        )
        self.assertEqual((await tools.execute(stale_revision)).status, "stale_state")

        stale_writer = tools.build_read_request(
            tool_name="read_interview_clock",
            raw_call_id="stale-writer-call",
        )
        stale_writer["writer_generation"] = 2
        self.assertEqual((await tools.execute(stale_writer)).status, "stale_writer")

        stale_lifecycle = tools.build_probe_candidates_request(
            raw_call_id="stale-lifecycle-call",
            expected_state_revision=revision,
            expected_lifecycle_version=state.lifecycle_version - 1,
            active_question_id=state.active_question_id,
        )
        self.assertEqual((await tools.execute(stale_lifecycle)).status, "unavailable")

        candidates = (
            await tools.execute(
                tools.build_probe_candidates_request(
                    raw_call_id="candidate-call",
                    expected_state_revision=revision,
                    expected_lifecycle_version=state.lifecycle_version,
                    active_question_id=state.active_question_id,
                )
            )
        ).result["payload"]["probe_candidates"]
        wrong_turn = tools.build_commit_request(
            raw_call_id="wrong-turn-call",
            contract_version=INTERVIEWER_TOOL_CONTRACT_VERSION,
            expected_state_revision=revision,
            expected_lifecycle_version=state.lifecycle_version,
            move_type="probe",
            probe_candidate_id=candidates[0]["probe_candidate_id"],
            idempotency_key="wrong-turn-key",
        )
        wrong_turn["move"]["target"]["source_turn_id"] = "turn-other"
        wrong_turn["request_digest"] = (
            calculate_interviewer_mutation_request_digest(wrong_turn)
        )
        self.assertEqual((await tools.execute(wrong_turn)).status, "stale_state")
        self.assertEqual(controller.state.state_revision, revision)
        self.assertIsNone(controller.state.pending_move_id)

    async def test_duplicate_idempotency_and_conflict_preserve_one_move(self):
        controller, tools, _, _, _, _ = self.make_runtime()
        state = controller.state
        probes = (
            await tools.execute(
                tools.build_probe_candidates_request(
                    raw_call_id="probes",
                    expected_state_revision=state.state_revision,
                    expected_lifecycle_version=state.lifecycle_version,
                    active_question_id=state.active_question_id,
                )
            )
        ).result["payload"]["probe_candidates"]
        request = tools.build_commit_request(
            raw_call_id="commit-original",
            contract_version=INTERVIEWER_TOOL_CONTRACT_VERSION,
            expected_state_revision=state.state_revision,
            expected_lifecycle_version=state.lifecycle_version,
            move_type="probe",
            probe_candidate_id=probes[0]["probe_candidate_id"],
            idempotency_key="commit-key",
        )
        original = await tools.execute(request)
        revision = controller.state.state_revision

        duplicate = copy.deepcopy(request)
        duplicate["call_id"] = "call:duplicate"
        replay = await tools.execute(duplicate)
        self.assertEqual(replay.status, "duplicate")
        self.assertEqual(controller.state.state_revision, revision)
        self.assertEqual(replay.result["payload"], original.result["payload"])

        conflict = copy.deepcopy(request)
        conflict["call_id"] = "call:conflict"
        conflict["deadline_at"] = "2026-08-19T12:00:02.000Z"
        conflict["request_digest"] = (
            calculate_interviewer_mutation_request_digest(conflict)
        )
        conflict_result = await tools.execute(conflict)
        self.assertEqual(conflict_result.status, "idempotency_conflict")
        self.assertEqual(controller.state.state_revision, revision)
        self.assertEqual(len(controller.state.move_ledger), 1)

    async def test_close_race_has_one_winner_and_no_partial_second_move(self):
        controller, tools, _, _, _, _ = self.make_runtime()
        state = controller.state
        first = tools.build_close_request(
            raw_call_id="close-race-1",
            expected_state_revision=state.state_revision,
            expected_lifecycle_version=state.lifecycle_version,
            idempotency_key="close-race-key-1",
            reason="controller_policy",
        )
        second = tools.build_close_request(
            raw_call_id="close-race-2",
            expected_state_revision=state.state_revision,
            expected_lifecycle_version=state.lifecycle_version,
            idempotency_key="close-race-key-2",
            reason="controller_policy",
        )
        results = await asyncio.gather(tools.execute(first), tools.execute(second))
        self.assertEqual({result.status for result in results}, {"ok", "stale_state"})
        self.assertEqual(len(controller.state.move_ledger), 1)
        self.assertEqual(controller.state.move_ledger[0].move_type, "close")

    async def test_near_deadline_and_terminal_paths_do_not_depend_on_tools(self):
        near = datetime(2026, 8, 19, 12, 29, 20, tzinfo=timezone.utc)
        controller, _, _, _, _, directive = self.make_runtime(observed_at=near)
        self.assertFalse(directive.tool_mode)
        self.assertEqual(controller.state.pending_move_id, "move:session-472:1")
        self.assertEqual(controller.state.move_ledger[-1].move_type, "close")

        deadline = datetime(2026, 8, 19, 12, 30, tzinfo=timezone.utc)
        terminal_controller, terminal_tools, _, _, _, _ = self.make_runtime(
            observed_at=deadline,
            prepare=False,
        )
        request = terminal_tools.build_close_request(
            raw_call_id="terminal-close",
            expected_state_revision=terminal_controller.state.state_revision,
            expected_lifecycle_version=terminal_controller.state.lifecycle_version,
            idempotency_key="terminal-close-key",
            reason="deadline",
        )
        result = await terminal_tools.execute(request)
        self.assertEqual(result.status, "closed")
        self.assertEqual(terminal_controller.state.move_ledger, ())

    async def test_tool_budget_recursive_call_and_same_handle_cap_fallback(self):
        controller, tools, _, _, _, directive = self.make_runtime()
        items, _ = self.authorize_tool_handle(controller, directive)

        first = await tools.invoke_read(
            tool_name="read_interview_state",
            raw_call_id="live-state",
            handle_id="speech-1",
            contract_version=INTERVIEWER_TOOL_CONTRACT_VERSION,
        )
        self.assertEqual(first.status, "ok")
        self.assertTrue(
            allow_controller_generation(
                controller,
                ReplySuppressionGate(),
                items,
                monotonic_ms=1_003,
            )
        )
        repeated = await tools.invoke_read(
            tool_name="read_interview_state",
            raw_call_id="live-state-again",
            handle_id="speech-1",
            contract_version=INTERVIEWER_TOOL_CONTRACT_VERSION,
        )
        self.assertEqual(repeated.status, "unavailable")
        self.assertTrue(controller.tools_fenced_for_current_handle())
        self.assertEqual(controller.state.move_ledger, ())

        # A fresh runtime exercises the exact continuation boundary: three
        # bounded re-entries, one tool-free fallback, then deterministic denial.
        capped, _, _, _, _, capped_directive = self.make_runtime()
        capped_items, _ = self.authorize_tool_handle(
            capped,
            capped_directive,
            handle_id="speech-cap",
        )
        for offset in range(MAX_SAME_HANDLE_CONTINUATIONS):
            self.assertTrue(
                allow_controller_generation(
                    capped,
                    ReplySuppressionGate(),
                    capped_items,
                    monotonic_ms=1_003 + offset,
                )
            )
        self.assertTrue(
            allow_controller_generation(
                capped,
                ReplySuppressionGate(),
                capped_items,
                monotonic_ms=1_010,
            )
        )
        self.assertTrue(capped.tools_fenced_for_current_handle())
        self.assertEqual(len(capped.state.move_ledger), 1)
        self.assertEqual(
            capped.state.move_ledger[-1].reason_code,
            "controller_fallback",
        )
        self.assertEqual(capped.state.move_ledger[-1].stage, "generated")
        self.assertFalse(
            allow_controller_generation(
                capped,
                ReplySuppressionGate(),
                capped_items,
                monotonic_ms=1_011,
            )
        )

    async def test_commit_continuation_consumes_no_second_move_capability(self):
        controller, tools, _, _, _, directive = self.make_runtime()
        items, acceptance = self.authorize_tool_handle(controller, directive)
        state = controller.state
        probes = await tools.invoke_probe_candidates(
            raw_call_id="live-probes",
            handle_id="speech-1",
            contract_version=INTERVIEWER_TOOL_CONTRACT_VERSION,
            expected_state_revision=state.state_revision,
            expected_lifecycle_version=state.lifecycle_version,
            active_question_id=state.active_question_id,
        )
        self.assertEqual(probes.status, "ok")
        self.assertTrue(
            allow_controller_generation(
                controller,
                ReplySuppressionGate(),
                items,
                monotonic_ms=1_003,
            )
        )
        candidate = probes.result["payload"]["probe_candidates"][0]
        commit = await tools.invoke_commit(
            raw_call_id="live-commit",
            handle_id="speech-1",
            contract_version=INTERVIEWER_TOOL_CONTRACT_VERSION,
            expected_state_revision=state.state_revision,
            expected_lifecycle_version=state.lifecycle_version,
            move_type="probe",
            probe_candidate_id=candidate["probe_candidate_id"],
            idempotency_key="live-commit-key",
        )
        self.assertEqual(commit.status, "ok")
        committed_revision = controller.state.state_revision
        self.assertEqual(controller.state.move_ledger[-1].stage, "admitted")
        self.assertEqual(len(controller._seen_generation_capabilities), 1)

        self.assertTrue(
            allow_controller_generation(
                controller,
                ReplySuppressionGate(),
                items,
                monotonic_ms=1_004,
            )
        )
        generated_revision = controller.state.state_revision
        self.assertEqual(generated_revision, committed_revision + 1)
        self.assertEqual(controller.state.move_ledger[-1].stage, "generated")
        self.assertEqual(len(controller._seen_generation_capabilities), 1)

        self.assertTrue(
            allow_controller_generation(
                controller,
                ReplySuppressionGate(),
                items,
                monotonic_ms=1_005,
            )
        )
        self.assertEqual(controller.state.state_revision, generated_revision)

        wrong_acceptance = SpeechCompletionAcceptance()
        controller.speech_finished(
            handle_id="speech-1",
            completion_acceptance=wrong_acceptance,
            scheduled=False,
            interrupted=True,
            has_confirmed_prefix=False,
            monotonic_ms=1_006,
        )
        self.assertIn("speech-1", controller._authorized_speech_handles)
        self.assertEqual(controller.state.move_ledger[-1].stage, "generated")

        controller.speech_finished(
            handle_id="speech-1",
            completion_acceptance=acceptance,
            scheduled=False,
            interrupted=True,
            has_confirmed_prefix=False,
            monotonic_ms=1_006,
        )
        self.assertNotIn("speech-1", controller._authorized_speech_handles)
        self.assertEqual(controller.state.move_ledger[-1].stage, "aborted")

    async def test_lifecycle_refresh_is_monotonic_and_never_reopens_speech(self):
        controller, tools, store, clock, _, _ = self.make_runtime()
        renewed = TrustedLifecycleSnapshot(
            contract_version=TRUSTED_LIFECYCLE_SNAPSHOT_CONTRACT_VERSION,
            session_id="session-472",
            writer_id="writer-1",
            writer_generation=3,
            state="active",
            version=7,
            observed_monotonic_ms=1_001,
            valid_until_monotonic_ms=7_000,
        )
        clock[0] = 1_001
        self.assertEqual(
            tools.accept_lifecycle_refresh(renewed, monotonic_ms=clock[0]),
            "updated",
        )
        self.assertTrue(tools.enabled)

        ending = TrustedLifecycleSnapshot(
            contract_version=TRUSTED_LIFECYCLE_SNAPSHOT_CONTRACT_VERSION,
            session_id="session-472",
            writer_id="writer-1",
            writer_generation=3,
            state="ending",
            version=8,
            observed_monotonic_ms=1_002,
            valid_until_monotonic_ms=8_000,
        )
        clock[0] = 1_002
        self.assertEqual(
            tools.accept_lifecycle_refresh(ending, monotonic_ms=clock[0]),
            "updated",
        )
        ending_state = controller.state
        self.assertEqual(ending_state.lifecycle_state, "ending")
        self.assertTrue(ending_state.terminal)
        self.assertTrue(ending_state.speech_fenced)
        self.assertFalse(tools.enabled)

        reopen = TrustedLifecycleSnapshot(
            contract_version=TRUSTED_LIFECYCLE_SNAPSHOT_CONTRACT_VERSION,
            session_id="session-472",
            writer_id="writer-1",
            writer_generation=3,
            state="active",
            version=9,
            observed_monotonic_ms=1_003,
            valid_until_monotonic_ms=8_001,
        )
        with self.assertRaisesRegex(InterviewerToolsError, "reactivation"):
            tools.accept_lifecycle_refresh(reopen, monotonic_ms=1_003)
        self.assertIs(controller.state, ending_state)
        self.assertIs(store.current(monotonic_ms=1_003), ending)

        terminal_source, _, terminal_store, _, _, _ = self.make_runtime()
        terminal_state = reduce_controller(
            terminal_source.state,
            TerminalSettled(
                expected_state_revision=terminal_source.state.state_revision,
                monotonic_ms=1_002,
            ),
        ).state
        terminal_controller = InterviewControllerAdapter(state=terminal_state)
        terminal_tools = SessionScopedInterviewerTools(
            controller=terminal_controller,
            lifecycle_store=terminal_store,
            enabled=True,
            monotonic_clock_ms=lambda: 1_003,
            wall_clock=lambda: self.START.timestamp(),
        )
        active_refresh = copy.copy(reopen)
        with self.assertRaisesRegex(InterviewerToolsError, "reactivation"):
            terminal_tools.accept_lifecycle_refresh(
                active_refresh,
                monotonic_ms=1_003,
            )
        self.assertIs(terminal_controller.state, terminal_state)

    async def test_stale_or_unavailable_lifecycle_returns_fallback_without_mutation(self):
        controller, tools, _, clock, _, _ = self.make_runtime()
        revision = controller.state.state_revision
        clock[0] = 10_000
        request = tools.build_read_request(
            tool_name="read_interview_state",
            raw_call_id="stale-lease",
        )
        stale = await tools.execute(request)
        self.assertEqual(stale.status, "unavailable")
        self.assertEqual(controller.state.state_revision, revision)

        controller2, tools2, _, _, _, _ = self.make_runtime()
        refresh_request = tools2.build_read_request(
            tool_name="read_interview_clock",
            raw_call_id="refresh-unavailable",
        )
        tools2.mark_lifecycle_refresh_unavailable()
        unavailable = await tools2.execute(refresh_request)
        self.assertEqual(unavailable.status, "unavailable")
        self.assertFalse(controller2.enabled)
        self.assertIsNone(controller2.state)

    async def test_timeout_fallback_speech_and_candidate_persistence_are_independent(self):
        async def slow_barrier(_):
            await asyncio.sleep(0.05)

        controller, tools, _, _, _, directive = self.make_runtime(
            call_timeout_ms=5,
            operation_barrier=slow_barrier,
        )
        items, acceptance = self.authorize_tool_handle(controller, directive)
        revision = controller.state.state_revision
        outcome = await tools.invoke_read(
            tool_name="read_interview_state",
            raw_call_id="fallback-timeout",
            handle_id="speech-1",
            contract_version=INTERVIEWER_TOOL_CONTRACT_VERSION,
        )
        self.assertEqual(outcome.status, "timeout")
        self.assertTrue(controller.tools_fenced_for_current_handle())
        self.assertEqual(controller.state.state_revision, revision)
        self.assertEqual(controller.state.move_ledger, ())

        second = await tools.invoke_read(
            tool_name="read_interview_clock",
            raw_call_id="second-tool-after-timeout",
            handle_id="speech-1",
            contract_version=INTERVIEWER_TOOL_CONTRACT_VERSION,
        )
        self.assertEqual(second.status, "unavailable")
        self.assertEqual(controller.state.state_revision, revision)
        self.assertEqual(controller.state.move_ledger, ())
        self.assertTrue(
            allow_controller_generation(
                controller,
                ReplySuppressionGate(),
                items,
                monotonic_ms=1_003,
            )
        )
        self.assertEqual(len(controller.state.move_ledger), 1)
        self.assertEqual(
            controller.state.move_ledger[-1].reason_code,
            "controller_fallback",
        )
        self.assertEqual(controller.state.move_ledger[-1].stage, "generated")
        fallback_instruction = controller.current_tool_fallback_instruction()
        self.assertIn('"move_type":"probe"', fallback_instruction)
        self.assertNotIn("reason_code", fallback_instruction)
        self.assertNotIn("highest-impact", fallback_instruction)
        self.assertFalse(
            allow_controller_generation(
                controller,
                ReplySuppressionGate(),
                items,
                monotonic_ms=1_003,
            )
        )
        controller.speech_finished(
            handle_id="speech-1",
            completion_acceptance=acceptance,
            scheduled=True,
            interrupted=False,
            has_confirmed_prefix=True,
            assistant_message_ids=("fallback-message",),
            monotonic_ms=1_004,
        )
        self.assertGreater(controller.state.state_revision, revision)
        self.assertEqual(controller.state.move_ledger[-1].stage, "spoken")
        self.assertIsNotNone(controller.state.pending_move_id)

        controller.persisted_transcript(
            {
                "speaker": "user",
                "event_id": "writer-1:turn-1",
                "writer_id": "writer-1",
                "writer_generation": 3,
            },
            source_message_id="turn-1",
            monotonic_ms=1_005,
        )
        self.assertTrue(controller.enabled)
        self.assertNotIn("turn-1", controller._admitted_candidate_revisions)


if __name__ == "__main__":
    unittest.main()
