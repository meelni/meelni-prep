#!/usr/bin/env python3
"""Behavior tests for the provider-free deterministic interview controller."""

import asyncio
import json
import sys
import unittest
from contextvars import copy_context
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent))

from shared.interview_controller import (  # noqa: E402
    MAX_RECENT_DELIVERED_MOVES,
    MAX_SNAPSHOT_BYTES,
    CandidateTurnCompleted,
    ClockObserved,
    ControllerError,
    DeliveryEvidence,
    MoveStageAdvanced,
    PersistedTranscriptEvidence,
    SpeechInterrupted,
    TerminalSettled,
    WriterReconnected,
    create_controller_state,
    parse_controller_state,
    reduce_controller,
)
from shared.interview_controller_adapter import (  # noqa: E402
    CONTROLLER_ADAPTER_CONTRACT_VERSION,
    CONTROLLER_FEATURE_ENV,
    MAX_PENDING_CORRELATIONS,
    MAX_RUNTIME_TRANSCRIPT_CORRELATIONS,
    ReplySuppressionGate,
    allow_controller_generation,
    create_interview_controller_adapter,
    measured_turn_duration_ms,
    put_bounded_correlation,
    resolve_controller_runtime_mode,
)
from shared.transcript_events import create_transcript_event  # noqa: E402
from shared.transcript_ingest import (  # noqa: E402
    IngestResponse,
    TranscriptIngestQueue,
    create_interruption_marker,
    create_runtime_settlement,
)


class InterviewControllerTests(unittest.TestCase):
    def make_state(self, *, observed_at: str = "2026-08-19T12:00:00.000Z"):
        return create_controller_state(
            session_id="session-471",
            brief_id="brief:471",
            writer_id="writer-1",
            writer_generation=1,
            lifecycle_state="active",
            lifecycle_version=1,
            started_at="2026-08-19T12:00:00.000Z",
            deadline_at="2026-08-19T12:30:00.000Z",
            observed_at=observed_at,
            monotonic_anchor_ms=1_000,
            round_objectives=(
                "clarify_product_goal",
                "prioritize_target_user",
                "identify_core_problem",
            ),
            topic_catalog=(
                "objective_and_scope",
                "user_segmentation",
                "problem_evidence",
            ),
            active_question_id="question-471",
        )

    def make_brief(self):
        return {
            "contract_version": "interview-brief.v2",
            "brief_id": "brief:471",
            "session_id": "session-471",
            "deadline_at": "2026-08-19T12:30:00.000Z",
            "duration_minutes": 30,
            "selected_question": {"id": "question-471"},
            "round_pack": {
                "objectives": [
                    "clarify_product_goal",
                    "prioritize_target_user",
                ],
                "probe_families": [
                    "objective_and_scope",
                    "user_segmentation",
                ],
            },
        }

    def make_adapter(
        self,
        *,
        observed_at="2026-08-19T12:00:00.000Z",
        monotonic_ms=1_000,
    ):
        return create_interview_controller_adapter(
            env={CONTROLLER_FEATURE_ENV: "true"},
            session_id="session-471",
            deadline_at="2026-08-19T12:30:00.000Z",
            writer_id="writer-1",
            writer_generation=1,
            interview_brief=self.make_brief(),
            lifecycle_state="active",
            lifecycle_version=7,
            observed_at=datetime.strptime(
                observed_at, "%Y-%m-%dT%H:%M:%S.%fZ"
            ).replace(tzinfo=timezone.utc),
            monotonic_ms=monotonic_ms,
        )

    def authorize_pending(
        self,
        adapter,
        *,
        turn_id: str = "turn-1",
        monotonic_ms: int,
    ):
        return adapter.authorize_generation(
            finalized_turn_id=turn_id,
            move_id=adapter.state.pending_move_id,
            monotonic_ms=monotonic_ms,
        )

    def complete_turn(
        self,
        state,
        *,
        turn: int,
        text: str = "I would start with a clearly defined target user and product goal.",
        duration_ms: int = 8_000,
        requested_clarification: bool = False,
        requested_exit: bool = False,
    ):
        return reduce_controller(
            state,
            CandidateTurnCompleted(
                expected_state_revision=state.state_revision,
                turn_id=f"turn-{turn}",
                transcript_revision=f"revision-{turn}",
                text=text,
                duration_ms=duration_ms,
                monotonic_ms=state.clock.monotonic_anchor_ms + 1,
                requested_clarification=requested_clarification,
                requested_exit=requested_exit,
            ),
        )

    def advance(self, state, move_id: str, stage: str):
        return reduce_controller(
            state,
            MoveStageAdvanced(
                expected_state_revision=state.state_revision,
                move_id=move_id,
                stage=stage,
                monotonic_ms=state.clock.monotonic_anchor_ms + 1,
            ),
        ).state

    def transcript_evidence(
        self,
        state,
        *,
        sequence: int,
        delivery_state: str = "delivered",
    ):
        return DeliveryEvidence(
            evidence_type="transcript_event",
            event_id=f"event:{state.writer_id}:{sequence}",
            writer_id=state.writer_id,
            writer_generation=state.writer_generation,
            sequence=sequence,
            delivery_state=delivery_state,
        )

    def deliver(self, state, move_id: str, *, sequence: int):
        for stage in ("generated", "scheduled", "spoken"):
            state = self.advance(state, move_id, stage)
        evidence = self.transcript_evidence(state, sequence=sequence)
        return reduce_controller(
            state,
            PersistedTranscriptEvidence(
                expected_state_revision=state.state_revision,
                move_id=move_id,
                evidence=evidence,
                monotonic_ms=state.clock.monotonic_anchor_ms + 1,
            ),
        ).state

    def test_state_round_trips_and_projects_the_accepted_runtime_contract(self):
        state = self.make_state()
        parsed = parse_controller_state(json.dumps(state.to_wire()))

        self.assertEqual(parsed, state)
        runtime = parsed.to_runtime_state()
        self.assertEqual(runtime["contract_version"], "interview-runtime-state.v1")
        self.assertEqual(runtime["clock"]["remaining_ms"], 1_800_000)
        self.assertEqual(runtime["allowed_moves"], [
            "probe",
            "clarify",
            "challenge",
            "transition",
            "close",
        ])

    def test_short_silence_and_intentional_clarification_are_explicit(self):
        short = self.complete_turn(self.make_state(), turn=1, text="Not sure.")
        self.assertEqual(short.state.move_ledger[-1].move_type, "clarify")
        self.assertTrue(short.state.move_ledger[-1].intentional_clarification)

        silence = self.complete_turn(self.make_state(), turn=1, text="", duration_ms=0)
        self.assertEqual(silence.state.move_ledger[-1].reason_code, "resolve_ambiguity")
        self.assertEqual(silence.snapshot.payload["candidate_turn"]["answer_shape"], "silence")

        explicit = self.complete_turn(
            self.make_state(),
            turn=1,
            text="Could you clarify what you mean?",
            requested_clarification=True,
        )
        self.assertTrue(
            explicit.snapshot.payload["constraints"]["intentional_clarification"]
        )

    def test_long_answer_challenges_only_after_a_delivered_probe(self):
        long_answer = " ".join(f"word{index}" for index in range(90))
        first = self.complete_turn(
            self.make_state(), turn=1, text=long_answer, duration_ms=65_000
        )
        self.assertEqual(first.state.move_ledger[-1].move_type, "probe")
        state = self.deliver(first.state, first.state.pending_move_id, sequence=1)

        second = self.complete_turn(
            state, turn=2, text=f"{long_answer} additional", duration_ms=65_000
        )
        self.assertEqual(second.state.move_ledger[-1].move_type, "challenge")
        self.assertEqual(second.state.move_ledger[-1].reason_code, "test_tradeoff")

    def test_repeated_answer_is_an_intentional_clarification_not_a_repeated_probe(self):
        answer = "I would prioritize new managers because their unmet need is most acute."
        first = self.complete_turn(self.make_state(), turn=1, text=answer)
        state = self.deliver(first.state, first.state.pending_move_id, sequence=1)

        repeated = self.complete_turn(state, turn=2, text=answer)
        move = repeated.state.move_ledger[-1]
        self.assertEqual(move.move_type, "clarify")
        self.assertTrue(move.intentional_clarification)
        self.assertEqual(move.clarifies_move_id, first.state.pending_move_id)
        self.assertNotEqual(move.move_id, first.state.pending_move_id)

    def test_only_one_move_is_admitted_per_completed_turn(self):
        transition = self.complete_turn(self.make_state(), turn=1)
        snapshot = transition.snapshot.payload
        self.assertEqual(snapshot["constraints"]["substantive_question_budget"], 1)
        self.assertEqual(len(transition.state.move_ledger), 1)
        with self.assertRaisesRegex(ControllerError, "pending_move") as failure:
            self.complete_turn(transition.state, turn=2)
        self.assertEqual(failure.exception.code, "pending_move")

    def test_lifecycle_does_not_commit_before_persisted_transcript_evidence(self):
        planned = self.complete_turn(self.make_state(), turn=1)
        move_id = planned.state.pending_move_id
        self.assertEqual(planned.state.move_ledger[-1].stage, "admitted")

        state = planned.state
        for stage in ("generated", "scheduled", "spoken"):
            state = self.advance(state, move_id, stage)
            self.assertEqual(state.move_ledger[-1].stage, stage)
            self.assertIsNone(state.move_ledger[-1].delivery_evidence)

        evidence = self.transcript_evidence(state, sequence=7)
        committed = reduce_controller(
            state,
            PersistedTranscriptEvidence(
                expected_state_revision=state.state_revision,
                move_id=move_id,
                evidence=evidence,
                monotonic_ms=state.clock.monotonic_anchor_ms + 1,
            ),
        ).state
        self.assertEqual(committed.move_ledger[-1].stage, "canonically_delivered")
        self.assertEqual(committed.move_ledger[-1].delivery_evidence, evidence)

    def test_interruption_before_delivery_is_recoverable_without_committing_history(self):
        planned = self.complete_turn(self.make_state(), turn=1)
        move_id = planned.state.pending_move_id
        generated = self.advance(planned.state, move_id, "generated")
        scheduled = self.advance(generated, move_id, "scheduled")
        interrupted = reduce_controller(
            scheduled,
            SpeechInterrupted(
                expected_state_revision=scheduled.state_revision,
                move_id=move_id,
                monotonic_ms=scheduled.clock.monotonic_anchor_ms + 1,
            ),
        ).state

        self.assertEqual(interrupted.move_ledger[-1].stage, "aborted")
        self.assertIsNone(interrupted.move_ledger[-1].delivery_evidence)
        self.assertEqual(interrupted.interruption_state, "recovery_pending")
        recovered = self.complete_turn(
            interrupted,
            turn=2,
            text="Let me finish the answer I had started with more detail.",
        )
        self.assertEqual(recovered.state.move_ledger[-1].move_type, "probe")
        self.assertEqual(recovered.state.move_ledger[-1].recovery_of_move_id, move_id)
        self.assertEqual(
            len(
                [
                    move
                    for move in recovered.state.move_ledger
                    if move.stage == "canonically_delivered"
                ]
            ),
            0,
        )

    def test_persisted_interruption_marker_is_distinct_from_delivery(self):
        planned = self.complete_turn(self.make_state(), turn=1)
        move_id = planned.state.pending_move_id
        marker = DeliveryEvidence(
            evidence_type="interruption_marker",
            event_id="event:writer-1:marker",
            writer_id="writer-1",
            writer_generation=1,
            sequence=9,
            reason="no_provider_confirmed_prefix",
        )
        interrupted = reduce_controller(
            planned.state,
            SpeechInterrupted(
                expected_state_revision=planned.state.state_revision,
                move_id=move_id,
                monotonic_ms=planned.state.clock.monotonic_anchor_ms + 1,
                persisted_marker=marker,
            ),
        ).state
        self.assertEqual(interrupted.move_ledger[-1].stage, "interrupted")
        self.assertEqual(interrupted.move_ledger[-1].delivery_evidence, marker)
        self.assertFalse(
            any(
                move.stage == "canonically_delivered"
                for move in interrupted.move_ledger
            )
        )
        self.assertEqual(
            interrupted.to_runtime_state()["probe_ledger"][-1]["delivery_state"],
            "interrupted",
        )
        round_tripped = parse_controller_state(interrupted.to_wire())
        self.assertEqual(round_tripped, interrupted)
        self.assertEqual(
            round_tripped.move_ledger[-1].delivery_evidence.evidence_type,
            "interruption_marker",
        )

    def test_interruption_after_persisted_delivery_cannot_uncommit_the_move(self):
        planned = self.complete_turn(self.make_state(), turn=1)
        move_id = planned.state.pending_move_id
        delivered = self.deliver(planned.state, move_id, sequence=1)
        after = reduce_controller(
            delivered,
            SpeechInterrupted(
                expected_state_revision=delivered.state_revision,
                move_id=move_id,
                monotonic_ms=delivered.clock.monotonic_anchor_ms + 1,
            ),
        ).state
        self.assertIs(after, delivered)
        self.assertEqual(after.state_revision, delivered.state_revision)
        self.assertEqual(after.clock, delivered.clock)
        self.assertEqual(after.move_ledger[-1].stage, "canonically_delivered")
        self.assertEqual(after.move_ledger[-1].delivery_evidence.event_id, "event:writer-1:1")

        evidence = delivered.move_ledger[-1].delivery_evidence
        replayed = reduce_controller(
            delivered,
            PersistedTranscriptEvidence(
                expected_state_revision=delivered.state_revision,
                move_id=move_id,
                evidence=evidence,
                monotonic_ms=delivered.clock.monotonic_anchor_ms + 50_000,
            ),
        ).state
        self.assertIs(replayed, delivered)
        self.assertEqual(replayed.state_revision, delivered.state_revision)
        self.assertEqual(replayed.clock, delivered.clock)

    def test_warning_transition_and_pre_deadline_close_are_deterministic(self):
        warning_state = self.make_state(observed_at="2026-08-19T12:28:30.000Z")
        warning = self.complete_turn(warning_state, turn=1)
        self.assertEqual(warning.state.clock.band, "warning")
        self.assertEqual(warning.state.move_ledger[-1].move_type, "transition")
        self.assertTrue(warning.state.move_ledger[-1].includes_warning)
        self.assertTrue(warning.snapshot.payload["constraints"]["include_time_warning"])

        closing_state = self.make_state(observed_at="2026-08-19T12:29:30.000Z")
        closing = self.complete_turn(closing_state, turn=1)
        self.assertEqual(closing.state.clock.band, "closing")
        self.assertEqual(closing.state.move_ledger[-1].move_type, "close")
        self.assertEqual(closing.state.move_ledger[-1].reason_code, "deadline_close")
        self.assertEqual(closing.snapshot.payload["constraints"]["substantive_question_budget"], 0)

    def test_catalog_tail_closes_after_its_final_delivered_transition(self):
        state = replace(
            self.make_state(),
            round_objectives=("only_objective",),
            topic_catalog=("only_topic",),
        )
        probe = self.complete_turn(state, turn=1)
        state = self.deliver(probe.state, probe.state.pending_move_id, sequence=1)
        final_transition = self.complete_turn(
            state,
            turn=2,
            text="I would next compare evidence quality and execution tradeoffs.",
        )
        self.assertEqual(
            final_transition.state.move_ledger[-1].move_type,
            "transition",
        )
        state = self.deliver(
            final_transition.state,
            final_transition.state.pending_move_id,
            sequence=2,
        )

        close = self.complete_turn(state, turn=3)
        self.assertEqual(close.state.move_ledger[-1].move_type, "close")
        self.assertEqual(close.state.move_ledger[-1].reason_code, "catalog_exhausted")
        self.assertEqual(
            close.snapshot.payload["constraints"]["substantive_question_budget"],
            0,
        )

        warning = replace(
            self.make_state(observed_at="2026-08-19T12:28:30.000Z"),
            round_objectives=("only_objective",),
            topic_catalog=("only_topic",),
        )
        warned_transition = self.complete_turn(warning, turn=1)
        warning = self.deliver(
            warned_transition.state,
            warned_transition.state.pending_move_id,
            sequence=1,
        )
        warned_close = self.complete_turn(warning, turn=2)
        self.assertEqual(warned_close.state.move_ledger[-1].move_type, "close")
        self.assertNotEqual(
            warned_close.state.move_ledger[-1].move_type,
            "transition",
        )

    def test_elapsed_deadline_admits_no_move_or_snapshot(self):
        state = self.make_state(observed_at="2026-08-19T12:30:00.000Z")
        self.assertTrue(state.terminal)
        self.assertEqual(state.allowed_moves, ())

        transition = self.complete_turn(state, turn=1)
        self.assertIsNone(transition.snapshot)
        self.assertEqual(transition.state.move_ledger, ())
        self.assertEqual(transition.state.close_state, "speech_fenced")

    def test_clock_crossing_elapsed_never_admits_close(self):
        state = self.make_state(observed_at="2026-08-19T12:29:30.000Z")
        elapsed = reduce_controller(
            state,
            ClockObserved(
                expected_state_revision=state.state_revision,
                monotonic_ms=state.clock.monotonic_anchor_ms + 30_000,
            ),
        )
        self.assertTrue(elapsed.state.terminal)
        self.assertEqual(elapsed.state.move_ledger, ())
        self.assertIsNone(elapsed.snapshot)

    def test_elapsed_clock_aborts_pending_move_before_terminal_fence(self):
        state = self.make_state(observed_at="2026-08-19T12:29:30.000Z")
        planned = self.complete_turn(state, turn=1).state
        self.assertEqual(planned.move_ledger[-1].stage, "admitted")
        elapsed = reduce_controller(
            planned,
            ClockObserved(
                expected_state_revision=planned.state_revision,
                monotonic_ms=(
                    planned.clock.monotonic_anchor_ms
                    + planned.clock.remaining_ms
                ),
            ),
        ).state
        self.assertTrue(elapsed.terminal)
        self.assertIsNone(elapsed.pending_move_id)
        self.assertEqual(elapsed.move_ledger[-1].stage, "aborted")
        self.assertIsNone(elapsed.move_ledger[-1].delivery_evidence)

    def test_clock_bands_are_exact_at_millisecond_thresholds(self):
        cases = (
            ("2026-08-19T12:27:59.999Z", 120_001, "normal"),
            ("2026-08-19T12:28:00.000Z", 120_000, "warning"),
            ("2026-08-19T12:28:00.001Z", 119_999, "warning"),
            ("2026-08-19T12:29:14.999Z", 45_001, "warning"),
            ("2026-08-19T12:29:15.000Z", 45_000, "closing"),
            ("2026-08-19T12:29:15.001Z", 44_999, "closing"),
            ("2026-08-19T12:30:00.000Z", 0, "elapsed"),
        )
        for observed_at, expected_remaining, expected_band in cases:
            with self.subTest(observed_at=observed_at):
                state = self.make_state(observed_at=observed_at)
                self.assertEqual(state.clock.remaining_ms, expected_remaining)
                self.assertEqual(state.clock.band, expected_band)

    def test_explicit_exit_admits_graceful_close_then_post_close_is_silent(self):
        closing = self.complete_turn(
            self.make_state(), turn=1, text="I would like to stop now.", requested_exit=True
        )
        move_id = closing.state.pending_move_id
        self.assertIsNotNone(closing.snapshot)
        self.assertFalse(closing.state.terminal)
        self.assertEqual(
            closing.state.move_ledger[-1].reason_code,
            "candidate_requested_close",
        )
        closed_state = self.deliver(closing.state, move_id, sequence=1)
        self.assertTrue(closed_state.terminal)
        self.assertEqual(closed_state.phase, "closed")
        self.assertEqual(closed_state.allowed_moves, ())
        self.assertEqual(
            closed_state.move_ledger[-1].stage,
            "canonically_delivered",
        )

        closed_wire = json.dumps(closed_state.to_wire(), sort_keys=True)
        after = self.complete_turn(closed_state, turn=2, text="Are you still there?")
        self.assertIsNone(after.snapshot)
        self.assertIs(after.state, closed_state)
        self.assertEqual(json.dumps(after.state.to_wire(), sort_keys=True), closed_wire)
        self.assertEqual(after.state.move_ledger, closed_state.move_ledger)

    def test_every_event_is_an_exact_no_op_after_terminal(self):
        initial = self.make_state()
        terminal = reduce_controller(
            initial,
            TerminalSettled(
                expected_state_revision=initial.state_revision,
                monotonic_ms=initial.clock.monotonic_anchor_ms + 1,
            ),
        ).state
        revision = terminal.state_revision
        monotonic_ms = terminal.clock.monotonic_anchor_ms + 50_000
        transcript = DeliveryEvidence(
            evidence_type="transcript_event",
            event_id="event:terminal:transcript",
            writer_id=terminal.writer_id,
            writer_generation=terminal.writer_generation,
            sequence=7,
            delivery_state="delivered",
        )
        marker = DeliveryEvidence(
            evidence_type="interruption_marker",
            event_id="event:terminal:marker",
            writer_id=terminal.writer_id,
            writer_generation=terminal.writer_generation,
            sequence=8,
            reason="no_provider_confirmed_prefix",
        )
        events = [
            CandidateTurnCompleted(
                expected_state_revision=revision,
                turn_id="turn-terminal",
                transcript_revision="revision-terminal",
                text="This late turn must remain transcript-only.",
                duration_ms=3_000,
                monotonic_ms=monotonic_ms,
            ),
            ClockObserved(revision, monotonic_ms),
            WriterReconnected(
                revision,
                "writer-2",
                2,
                2,
                monotonic_ms,
            ),
            TerminalSettled(revision, monotonic_ms),
            SpeechInterrupted(revision, "move:terminal:1", monotonic_ms),
            SpeechInterrupted(
                revision,
                "move:terminal:1",
                monotonic_ms,
                persisted_marker=marker,
            ),
            PersistedTranscriptEvidence(
                revision,
                "move:terminal:1",
                transcript,
                monotonic_ms,
            ),
            *[
                MoveStageAdvanced(
                    revision,
                    "move:terminal:1",
                    stage,
                    monotonic_ms,
                )
                for stage in ("generated", "scheduled", "spoken")
            ],
        ]
        terminal_wire = json.dumps(terminal.to_wire(), sort_keys=True)
        for event in events:
            with self.subTest(event=type(event).__name__, stage=getattr(event, "stage", None)):
                result = reduce_controller(terminal, event)
                self.assertIs(result.state, terminal)
                self.assertIsNone(result.snapshot)
                self.assertEqual(json.dumps(result.state.to_wire(), sort_keys=True), terminal_wire)

        with self.assertRaises(ControllerError) as invalid:
            reduce_controller(
                terminal,
                CandidateTurnCompleted(
                    revision,
                    "turn-invalid",
                    "revision-invalid",
                    "Stop.",
                    1_000,
                    monotonic_ms,
                    requested_exit="true",
                ),
            )
        self.assertEqual(invalid.exception.code, "invalid_turn")

    def test_reconnect_aborts_only_pending_move_and_preserves_delivered_history(self):
        first = self.complete_turn(self.make_state(), turn=1)
        delivered = self.deliver(first.state, first.state.pending_move_id, sequence=1)
        pending = self.complete_turn(
            delivered,
            turn=2,
            text="I would compare the impact and implementation cost before choosing.",
        ).state
        pending_id = pending.pending_move_id

        reconnected = reduce_controller(
            pending,
            WriterReconnected(
                expected_state_revision=pending.state_revision,
                writer_id="writer-2",
                writer_generation=2,
                lifecycle_version=2,
                monotonic_ms=pending.clock.monotonic_anchor_ms + 1,
            ),
        ).state
        self.assertEqual(reconnected.writer_id, "writer-2")
        self.assertEqual(reconnected.move_ledger[0].stage, "canonically_delivered")
        self.assertEqual(reconnected.move_ledger[-1].move_id, pending_id)
        self.assertEqual(reconnected.move_ledger[-1].stage, "aborted")
        self.assertEqual(reconnected.interruption_state, "recovery_pending")

        recovered = self.complete_turn(
            reconnected,
            turn=3,
            text="I can continue now with the same comparison.",
        )
        self.assertEqual(recovered.state.move_ledger[-1].recovery_of_move_id, pending_id)

    def test_snapshots_are_bounded_and_include_only_recent_delivery_identities(self):
        state = self.make_state()
        snapshot = None
        for index in range(1, 13):
            transition = self.complete_turn(
                state,
                turn=index,
                text=f"Please clarify this part for turn {index} with more detail.",
                requested_clarification=True,
            )
            snapshot = transition.snapshot
            self.assertLessEqual(len(snapshot.to_json().encode("utf-8")), MAX_SNAPSHOT_BYTES)
            state = self.deliver(
                transition.state,
                transition.state.pending_move_id,
                sequence=index,
            )

        final = self.complete_turn(
            state,
            turn=13,
            text="Please clarify one final distinct part in more detail.",
            requested_clarification=True,
        )
        recent = final.snapshot.payload["recent_canonically_delivered_moves"]
        self.assertEqual(len(recent), MAX_RECENT_DELIVERED_MOVES)
        self.assertEqual(recent[0]["move_id"], "move:session-471:5")
        self.assertEqual(recent[-1]["move_id"], "move:session-471:12")

    def test_stale_invalid_and_monotonic_regression_have_stable_failures(self):
        state = self.make_state()
        with self.assertRaises(ControllerError) as stale:
            reduce_controller(
                state,
                ClockObserved(expected_state_revision=99, monotonic_ms=1_001),
            )
        self.assertEqual(stale.exception.code, "stale_state")

        invalid = replace(state, allowed_moves=("close",))
        with self.assertRaises(ControllerError) as malformed:
            reduce_controller(
                invalid,
                ClockObserved(expected_state_revision=0, monotonic_ms=1_001),
            )
        self.assertEqual(malformed.exception.code, "invalid_state")

        with self.assertRaises(ControllerError) as regressed:
            reduce_controller(
                state,
                ClockObserved(expected_state_revision=0, monotonic_ms=999),
            )
        self.assertEqual(regressed.exception.code, "monotonic_regression")

        with self.assertRaises(ControllerError) as non_integer_monotonic:
            reduce_controller(
                state,
                ClockObserved(expected_state_revision=0, monotonic_ms=1_001.0),
            )
        self.assertEqual(non_integer_monotonic.exception.code, "invalid_event")

        with self.assertRaises(ControllerError) as non_integer_duration:
            reduce_controller(
                state,
                CandidateTurnCompleted(
                    expected_state_revision=0,
                    turn_id="turn-float",
                    transcript_revision="revision-float",
                    text="A complete answer with enough words to be considered normal.",
                    duration_ms=8_000.0,
                    monotonic_ms=1_001,
                ),
            )
        self.assertEqual(non_integer_duration.exception.code, "invalid_turn")

        for field in ("requested_clarification", "requested_exit"):
            event = CandidateTurnCompleted(
                expected_state_revision=0,
                turn_id=f"turn-{field}",
                transcript_revision=f"revision-{field}",
                text="A complete answer with enough words to be considered normal.",
                duration_ms=8_000,
                monotonic_ms=1_001,
                **{field: "true"},
            )
            with self.subTest(field=field), self.assertRaises(ControllerError) as intent:
                reduce_controller(state, event)
            self.assertEqual(intent.exception.code, "invalid_turn")

        wire = state.to_wire()
        wire["contract_version"] = "deterministic-interview-controller.v2"
        with self.assertRaises(ControllerError) as unsupported:
            parse_controller_state(wire)
        self.assertEqual(unsupported.exception.code, "unsupported_contract")

        invalid_phase = state.to_wire()
        invalid_phase["phase"] = "paused"
        with self.assertRaises(ControllerError) as closed_vocabulary:
            parse_controller_state(invalid_phase)
        self.assertEqual(closed_vocabulary.exception.code, "invalid_state")

        invalid_interrupted = state.to_wire()
        invalid_interrupted["move_ledger"] = [
            {
                "move_id": "move:session-471:1",
                "move_type": "probe",
                "reason_code": "deepen_reasoning",
                "question_id": "question-471",
                "topic": "objective_and_scope",
                "source_turn_id": "turn-1",
                "target_turn_ids": ["turn-1"],
                "stage": "interrupted",
                "updated_at": "2026-08-19T12:00:01.000Z",
                "delivery_evidence": {
                    "evidence_type": "transcript_event",
                    "event_id": "event:writer-1:1",
                    "writer_id": "writer-1",
                    "writer_generation": 1,
                    "sequence": 1,
                    "delivery_state": "partially_delivered",
                    "reason": None,
                },
                "recovery_of_move_id": None,
                "clarifies_move_id": None,
                "intentional_clarification": False,
                "includes_warning": False,
            }
        ]
        invalid_interrupted["move_ordinal"] = 1
        with self.assertRaises(ControllerError) as transcript_on_interruption:
            parse_controller_state(invalid_interrupted)
        self.assertEqual(transcript_on_interruption.exception.code, "invalid_state")

        invalid_interrupted["move_ledger"][0]["delivery_evidence"] = None
        with self.assertRaises(ControllerError) as missing_interruption_marker:
            parse_controller_state(invalid_interrupted)
        self.assertEqual(missing_interruption_marker.exception.code, "invalid_state")

        planned = self.complete_turn(state, turn=20).state
        orphan = replace(
            planned,
            pending_move_id=None,
            allowed_moves=("probe", "clarify", "challenge", "transition", "close"),
        )
        with self.assertRaises(ControllerError) as orphan_active:
            parse_controller_state(orphan.to_wire())
        self.assertEqual(orphan_active.exception.code, "invalid_state")

        extra_move = replace(planned.move_ledger[-1], move_id="move:session-471:2")
        multiple = replace(
            planned,
            move_ledger=(*planned.move_ledger, extra_move),
            move_ordinal=2,
        )
        with self.assertRaises(ControllerError) as multiple_active:
            parse_controller_state(multiple.to_wire())
        self.assertEqual(multiple_active.exception.code, "invalid_state")

    def test_terminal_settlement_fences_without_admitting_speech(self):
        state = self.make_state()
        settled = reduce_controller(
            state,
            TerminalSettled(
                expected_state_revision=state.state_revision,
                monotonic_ms=state.clock.monotonic_anchor_ms + 1,
            ),
        )
        self.assertTrue(settled.state.speech_fenced)
        self.assertEqual(settled.state.move_ledger, ())
        self.assertIsNone(settled.snapshot)

    def test_terminal_settlement_aborts_pending_move_before_fence(self):
        planned = self.complete_turn(self.make_state(), turn=1).state
        settled = reduce_controller(
            planned,
            TerminalSettled(
                expected_state_revision=planned.state_revision,
                monotonic_ms=planned.clock.monotonic_anchor_ms + 1,
            ),
        ).state
        self.assertTrue(settled.terminal)
        self.assertIsNone(settled.pending_move_id)
        self.assertEqual(settled.move_ledger[-1].stage, "aborted")
        self.assertIsNone(settled.move_ledger[-1].delivery_evidence)

    def test_adapter_flag_is_exact_and_disabled_path_constructs_no_state(self):
        for value in (None, "", "TRUE", " true ", "false"):
            env = {} if value is None else {CONTROLLER_FEATURE_ENV: value}
            adapter = create_interview_controller_adapter(
                env=env,
                session_id="session-471",
                deadline_at=None,
                writer_id="writer-1",
                writer_generation=1,
                interview_brief=None,
                monotonic_ms=1_000,
            )
            self.assertFalse(adapter.enabled)
            self.assertIsNone(adapter.state)
            self.assertEqual(adapter.status.failure_reason, "flag_disabled")

        enabled_but_invalid = create_interview_controller_adapter(
            env={CONTROLLER_FEATURE_ENV: "true"},
            session_id="session-471",
            deadline_at="2026-08-19T12:30:00.000Z",
            writer_id="writer-1",
            writer_generation=1,
            interview_brief=None,
            monotonic_ms=1_000,
        )
        self.assertFalse(enabled_but_invalid.enabled)
        self.assertEqual(enabled_but_invalid.status.failure_reason, "brief_unavailable")

        lifecycle_fenced = create_interview_controller_adapter(
            env={CONTROLLER_FEATURE_ENV: "true"},
            session_id="session-471",
            deadline_at="2026-08-19T12:30:00.000Z",
            writer_id="writer-1",
            writer_generation=1,
            interview_brief=self.make_brief(),
            observed_at=datetime(2026, 8, 19, 12, 0, tzinfo=timezone.utc),
            monotonic_ms=1_000,
        )
        self.assertFalse(lifecycle_fenced.enabled)
        self.assertIsNone(lifecycle_fenced.state)
        self.assertEqual(
            lifecycle_fenced.status.failure_reason,
            "lifecycle_snapshot_unavailable",
        )

    def test_adapter_emits_one_turn_local_directive_and_tracks_speech_without_commit(self):
        adapter = self.make_adapter()
        directive = adapter.complete_user_turn(
            message_id="turn-1",
            transcript_revision="writer-1:turn-1",
            text="I would begin with the primary user and their unmet need.",
            duration_ms=8_000,
            monotonic_ms=1_001,
        )
        self.assertEqual(directive.contract_version, CONTROLLER_ADAPTER_CONTRACT_VERSION)
        self.assertIn("CONTROLLER_SNAPSHOT", directive.instruction)
        self.assertFalse(directive.suppress_reply)
        move_id = directive.move_id
        self.assertEqual(adapter.state.move_ledger[-1].stage, "admitted")

        adapter.speech_created(handle_id="speech-1", monotonic_ms=1_002)
        self.assertTrue(self.authorize_pending(adapter, monotonic_ms=1_002))
        self.assertEqual(adapter.state.move_ledger[-1].stage, "generated")
        adapter.speech_finished(
            handle_id="speech-1",
            scheduled=True,
            interrupted=False,
            has_confirmed_prefix=True,
            assistant_message_ids=("assistant-1",),
            monotonic_ms=1_003,
        )
        self.assertEqual(adapter.state.move_ledger[-1].stage, "spoken")
        self.assertEqual(adapter.state.pending_move_id, move_id)
        self.assertIsNone(adapter.state.move_ledger[-1].delivery_evidence)

        adapter.persisted_transcript(
            {
                "speaker": "user",
                "event_id": "event:user:1",
                "writer_id": "writer-1",
                "writer_generation": 1,
                "sequence": 1,
                "delivery_state": "delivered",
            },
            monotonic_ms=1_004,
        )
        self.assertEqual(adapter.state.move_ledger[-1].stage, "spoken")

    def test_stale_preemptive_context_cannot_consume_finalized_move(self):
        adapter = self.make_adapter()
        gate = ReplySuppressionGate()

        # Pinned LiveKit creates and starts this handle before the finalized
        # on_user_turn_completed message and controller directive exist.
        adapter.speech_created(handle_id="speech-preemptive", monotonic_ms=1_000)
        directive = adapter.complete_user_turn(
            message_id="turn-finalized",
            transcript_revision="writer-1:turn-finalized",
            text="I would focus on the primary user's highest-impact need.",
            duration_ms=8_000,
            monotonic_ms=1_001,
        )
        admitted = adapter.state
        self.assertEqual(admitted.move_ledger[-1].stage, "admitted")

        stale_items = [
            SimpleNamespace(role="user", id="turn-preemptive-hypothesis"),
        ]
        self.assertFalse(
            allow_controller_generation(
                adapter,
                gate,
                stale_items,
                monotonic_ms=1_002,
            )
        )
        self.assertIs(adapter.state, admitted)
        self.assertTrue(adapter.enabled)

        wrong_snapshot_items = [
            SimpleNamespace(role="user", id="turn-finalized"),
            SimpleNamespace(role="system", id="controller:move:session-471:stale"),
        ]
        self.assertFalse(
            allow_controller_generation(
                adapter,
                gate,
                wrong_snapshot_items,
                monotonic_ms=1_002,
            )
        )
        self.assertIs(adapter.state, admitted)

        intended_items = [
            SimpleNamespace(role="user", id="turn-finalized"),
            SimpleNamespace(role="system", id=f"controller:{directive.move_id}"),
        ]
        adapter.speech_created(handle_id="speech-intended", monotonic_ms=1_003)
        self.assertTrue(
            allow_controller_generation(
                adapter,
                gate,
                intended_items,
                monotonic_ms=1_003,
            )
        )
        generated = adapter.state
        self.assertEqual(generated.move_ledger[-1].stage, "generated")

        self.assertFalse(
            allow_controller_generation(
                adapter,
                gate,
                intended_items,
                monotonic_ms=1_004,
            )
        )
        self.assertIs(adapter.state, generated)
        self.assertTrue(adapter.enabled)

    def test_public_speech_event_context_is_inherited_by_its_generation_task(self):
        async def exercise():
            adapter = self.make_adapter()
            stale_release = asyncio.Event()
            intended_release = asyncio.Event()

            # Pinned LiveKit 1.6.5 emits public speech_created synchronously,
            # then creates the pipeline task in that callback context.
            adapter.speech_created(
                handle_id="speech-preemptive",
                source="generate_reply",
                monotonic_ms=1_000,
            )

            async def authorize_after(release, items, monotonic_ms):
                await release.wait()
                return allow_controller_generation(
                    adapter,
                    ReplySuppressionGate(),
                    items,
                    monotonic_ms=monotonic_ms,
                )

            stale_task = asyncio.create_task(
                authorize_after(
                    stale_release,
                    [SimpleNamespace(role="user", id="turn-preemptive")],
                    1_002,
                )
            )
            directive = adapter.complete_user_turn(
                message_id="turn-finalized",
                transcript_revision="writer-1:turn-finalized",
                text="I would prioritize the highest-impact user need.",
                duration_ms=8_000,
                monotonic_ms=1_001,
            )
            admitted = adapter.state

            adapter.speech_created(
                handle_id="speech-intended",
                source="generate_reply",
                monotonic_ms=1_003,
            )
            intended_task = asyncio.create_task(
                authorize_after(
                    intended_release,
                    [
                        SimpleNamespace(role="user", id="turn-finalized"),
                        SimpleNamespace(
                            role="system",
                            id=f"controller:{directive.move_id}",
                        ),
                    ],
                    1_004,
                )
            )

            stale_release.set()
            self.assertFalse(await stale_task)
            self.assertIs(adapter.state, admitted)
            intended_release.set()
            self.assertTrue(await intended_task)
            self.assertEqual(adapter.state.move_ledger[-1].stage, "generated")

        asyncio.run(exercise())

    def test_denied_generation_handles_cannot_mutate_or_correlate_move(self):
        completion_cases = (
            {
                "name": "scheduled",
                "scheduled": True,
                "interrupted": False,
                "has_confirmed_prefix": True,
            },
            {
                "name": "aborted",
                "scheduled": False,
                "interrupted": True,
                "has_confirmed_prefix": False,
            },
            {
                "name": "interrupted",
                "scheduled": True,
                "interrupted": True,
                "has_confirmed_prefix": False,
            },
        )

        for case in completion_cases:
            with self.subTest(case=case["name"]):
                adapter = self.make_adapter()
                directive = adapter.complete_user_turn(
                    message_id="turn-finalized",
                    transcript_revision="writer-1:turn-finalized",
                    text="I would prioritize the highest-impact user need.",
                    duration_ms=8_000,
                    monotonic_ms=1_001,
                )
                admitted = adapter.state
                handle_id = f"speech-denied-{case['name']}"
                assistant_id = f"assistant-denied-{case['name']}"

                adapter.speech_created(
                    handle_id=handle_id,
                    source="generate_reply",
                    monotonic_ms=1_002,
                )
                handle_context = copy_context()
                self.assertFalse(
                    handle_context.run(
                        lambda: allow_controller_generation(
                            adapter,
                            ReplySuppressionGate(),
                            [
                                SimpleNamespace(
                                    role="user",
                                    id="turn-finalized",
                                ),
                                SimpleNamespace(
                                    role="system",
                                    id="controller:move:session-471:wrong",
                                ),
                            ],
                            monotonic_ms=1_003,
                        )
                    )
                )
                self.assertIs(adapter.state, admitted)

                adapter.speech_finished(
                    handle_id=handle_id,
                    scheduled=case["scheduled"],
                    interrupted=case["interrupted"],
                    has_confirmed_prefix=case["has_confirmed_prefix"],
                    assistant_message_ids=(assistant_id,),
                    monotonic_ms=1_004,
                )
                self.assertIs(adapter.state, admitted)
                self.assertNotIn(
                    f"writer-1:{assistant_id}",
                    adapter._transcript_move_ids,
                )
                self.assertNotIn(
                    f"writer-1:{handle_id}:unavailable",
                    adapter._interruption_move_ids,
                )

                adapter.persisted_transcript(
                    {
                        "speaker": "interviewer",
                        "event_id": f"writer-1:{assistant_id}",
                        "writer_id": "writer-1",
                        "writer_generation": 1,
                        "sequence": 2,
                        "delivery_state": "delivered",
                    },
                    monotonic_ms=1_005,
                )
                adapter.persisted_interruption_marker(
                    {
                        "speaker": "interviewer",
                        "reason": "no_provider_confirmed_prefix",
                        "event_id": f"writer-1:{handle_id}:unavailable",
                        "writer_id": "writer-1",
                        "writer_generation": 1,
                        "sequence": 3,
                    },
                    monotonic_ms=1_006,
                )
                self.assertIs(adapter.state, admitted)
                self.assertEqual(adapter.state.pending_move_id, directive.move_id)
                self.assertTrue(adapter.enabled)

    def test_replayed_handle_cannot_consume_authorized_handle_evidence(self):
        adapter = self.make_adapter()
        directive = adapter.complete_user_turn(
            message_id="turn-finalized",
            transcript_revision="writer-1:turn-finalized",
            text="I would prioritize the highest-impact user need.",
            duration_ms=8_000,
            monotonic_ms=1_001,
        )
        exact_items = [
            SimpleNamespace(role="user", id="turn-finalized"),
            SimpleNamespace(role="system", id=f"controller:{directive.move_id}"),
        ]

        adapter.speech_created(
            handle_id="speech-intended",
            source="generate_reply",
            monotonic_ms=1_002,
        )
        intended_context = copy_context()
        self.assertTrue(
            intended_context.run(
                lambda: allow_controller_generation(
                    adapter,
                    ReplySuppressionGate(),
                    exact_items,
                    monotonic_ms=1_003,
                )
            )
        )
        generated = adapter.state

        adapter.speech_created(
            handle_id="speech-replay",
            source="generate_reply",
            monotonic_ms=1_004,
        )
        replay_context = copy_context()
        self.assertFalse(
            replay_context.run(
                lambda: allow_controller_generation(
                    adapter,
                    ReplySuppressionGate(),
                    exact_items,
                    monotonic_ms=1_005,
                )
            )
        )
        adapter.speech_finished(
            handle_id="speech-replay",
            scheduled=True,
            interrupted=False,
            has_confirmed_prefix=True,
            assistant_message_ids=("assistant-replay",),
            monotonic_ms=1_006,
        )
        self.assertIs(adapter.state, generated)
        self.assertNotIn(
            "writer-1:assistant-replay",
            adapter._transcript_move_ids,
        )

        adapter.speech_finished(
            handle_id="speech-intended",
            scheduled=True,
            interrupted=False,
            has_confirmed_prefix=True,
            assistant_message_ids=("assistant-intended",),
            monotonic_ms=1_007,
        )
        self.assertEqual(adapter.state.move_ledger[-1].stage, "spoken")
        adapter.persisted_transcript(
            {
                "speaker": "interviewer",
                "event_id": "writer-1:assistant-intended",
                "writer_id": "writer-1",
                "writer_generation": 1,
                "sequence": 2,
                "delivery_state": "delivered",
            },
            monotonic_ms=1_008,
        )
        self.assertEqual(
            adapter.state.move_ledger[-1].stage,
            "canonically_delivered",
        )
        self.assertTrue(adapter.enabled)

    def test_speech_and_runtime_correlations_are_bounded(self):
        adapter = self.make_adapter()
        adapter.complete_user_turn(
            message_id="turn-finalized",
            transcript_revision="writer-1:turn-finalized",
            text="I would prioritize the highest-impact user need.",
            duration_ms=8_000,
            monotonic_ms=1_001,
        )
        admitted = adapter.state

        for index in range(MAX_PENDING_CORRELATIONS + 3):
            adapter.speech_created(
                handle_id=f"speech-{index}",
                source="generate_reply",
                monotonic_ms=1_002 + index,
            )
        self.assertEqual(
            len(adapter._created_speech_handles),
            MAX_PENDING_CORRELATIONS,
        )
        self.assertEqual(len(adapter._speech_move_ids), 0)
        self.assertEqual(
            tuple(adapter._created_speech_handles),
            tuple(
                f"speech-{index}"
                for index in range(3, MAX_PENDING_CORRELATIONS + 3)
            ),
        )

        for index in range(MAX_PENDING_CORRELATIONS + 3):
            adapter.speech_finished(
                handle_id=f"speech-{index}",
                scheduled=bool(index % 2),
                interrupted=not bool(index % 2),
                has_confirmed_prefix=bool(index % 2),
                assistant_message_ids=(f"assistant-{index}",),
                monotonic_ms=1_020 + index,
            )
        self.assertIs(adapter.state, admitted)
        self.assertEqual(len(adapter._created_speech_handles), 0)
        self.assertEqual(len(adapter._speech_move_ids), 0)
        self.assertLessEqual(
            len(adapter._retired_speech_handles),
            MAX_PENDING_CORRELATIONS,
        )

        runtime_correlations = {}
        evicted = ()
        for index in range(MAX_RUNTIME_TRANSCRIPT_CORRELATIONS + 3):
            evicted = put_bounded_correlation(
                runtime_correlations,
                f"event-{index}",
                f"message-{index}",
                limit=MAX_RUNTIME_TRANSCRIPT_CORRELATIONS,
            )
        self.assertEqual(
            len(runtime_correlations),
            MAX_RUNTIME_TRANSCRIPT_CORRELATIONS,
        )
        self.assertEqual(evicted, ("event-2",))
        self.assertEqual(
            tuple(runtime_correlations),
            tuple(
                f"event-{index}"
                for index in range(3, MAX_RUNTIME_TRANSCRIPT_CORRELATIONS + 3)
            ),
        )

    def test_adapter_exit_intent_policy_is_bounded_and_graceful(self):
        positive_phrases = (
            "I would like to stop now.",
            "Please stop the interview.",
            "Can we end the interview?",
            "Could you finish the session now?",
            "Let's end here.",
            "I think we should finish the interview.",
        )
        negative_phrases = (
            "I think we should stop.",
            "We should end.",
            "Can we finish?",
            "I need to finish.",
            "I would stop investing in this segment.",
            "Please stop users from abandoning checkout.",
            "Can we end the roadmap discussion with next steps?",
            "I want to finish defining the success metrics.",
            "At the end, I would compare the tradeoffs.",
            "We should stop churn before it starts.",
            "We should end the experiment after the next cohort.",
            "Can we finish the prioritization exercise first?",
            "Do not stop the interview.",
        )

        for phrase in positive_phrases:
            with self.subTest(phrase=phrase):
                adapter = self.make_adapter()
                directive = adapter.complete_user_turn(
                    message_id="turn-exit",
                    transcript_revision="writer-1:turn-exit",
                    text=phrase,
                    duration_ms=1_000,
                    monotonic_ms=1_001,
                )
                move = adapter.state.move_ledger[-1]
                self.assertEqual(move.move_type, "close")
                self.assertEqual(move.reason_code, "candidate_requested_close")
                self.assertFalse(directive.suppress_reply)

        for phrase in negative_phrases:
            with self.subTest(phrase=phrase):
                adapter = self.make_adapter()
                adapter.complete_user_turn(
                    message_id="turn-content",
                    transcript_revision="writer-1:turn-content",
                    text=phrase,
                    duration_ms=8_000,
                    monotonic_ms=1_001,
                )
                self.assertNotEqual(adapter.state.move_ledger[-1].move_type, "close")
                self.assertTrue(adapter.enabled)

        adapter = self.make_adapter()
        directive = adapter.complete_user_turn(
            message_id="turn-exit",
            transcript_revision="writer-1:turn-exit",
            text="Please stop the interview.",
            duration_ms=1_000,
            monotonic_ms=1_001,
        )
        adapter.speech_created(handle_id="speech-close", monotonic_ms=1_002)
        self.assertTrue(
            allow_controller_generation(
                adapter,
                ReplySuppressionGate(),
                [
                    SimpleNamespace(
                        role="system",
                        id=f"controller:{directive.move_id}",
                    ),
                    SimpleNamespace(role="user", id="turn-exit"),
                ],
                monotonic_ms=1_002,
            )
        )
        adapter.speech_finished(
            handle_id="speech-close",
            scheduled=True,
            interrupted=False,
            has_confirmed_prefix=True,
            assistant_message_ids=("assistant-close",),
            monotonic_ms=1_003,
        )
        adapter.persisted_transcript(
            {
                "speaker": "interviewer",
                "event_id": "writer-1:assistant-close",
                "writer_id": "writer-1",
                "writer_generation": 1,
                "sequence": 2,
                "delivery_state": "delivered",
            },
            monotonic_ms=1_004,
        )
        self.assertTrue(adapter.state.terminal)
        self.assertEqual(adapter.state.close_state, "speech_fenced")
        self.assertEqual(
            adapter.state.move_ledger[-1].stage,
            "canonically_delivered",
        )

    def test_adapter_rechecks_clock_before_provider_generation(self):
        crossing_closing = self.make_adapter(
            observed_at="2026-08-19T12:29:14.900Z"
        )
        directive = crossing_closing.complete_user_turn(
            message_id="turn-1",
            transcript_revision="writer-1:turn-1",
            text="I would compare the highest-impact user needs first.",
            duration_ms=8_000,
            monotonic_ms=1_001,
        )
        self.assertEqual(
            crossing_closing.state.move_ledger[-1].move_type,
            "transition",
        )
        crossing_closing.speech_created(
            handle_id="speech-warning",
            monotonic_ms=1_002,
        )
        self.assertFalse(
            self.authorize_pending(crossing_closing, monotonic_ms=1_101)
        )
        self.assertEqual(crossing_closing.state.clock.band, "closing")
        self.assertEqual(crossing_closing.state.move_ledger[-1].stage, "aborted")
        self.assertIsNone(crossing_closing.state.pending_move_id)
        self.assertEqual(crossing_closing.state.allowed_moves, ("close",))
        self.assertIsNotNone(directive.instruction)

        crossing_elapsed = self.make_adapter(
            observed_at="2026-08-19T12:29:59.900Z"
        )
        close = crossing_elapsed.complete_user_turn(
            message_id="turn-1",
            transcript_revision="writer-1:turn-1",
            text="My final recommendation focuses on the primary user.",
            duration_ms=8_000,
            monotonic_ms=1_001,
        )
        self.assertEqual(crossing_elapsed.state.move_ledger[-1].move_type, "close")
        crossing_elapsed.speech_created(
            handle_id="speech-close",
            monotonic_ms=1_002,
        )
        self.assertFalse(
            self.authorize_pending(crossing_elapsed, monotonic_ms=1_100)
        )
        self.assertTrue(crossing_elapsed.state.terminal)
        self.assertEqual(crossing_elapsed.state.move_ledger[-1].stage, "aborted")
        self.assertIsNotNone(close.instruction)

        predeadline_close = self.make_adapter(
            observed_at="2026-08-19T12:29:30.000Z"
        )
        predeadline_close.complete_user_turn(
            message_id="turn-1",
            transcript_revision="writer-1:turn-1",
            text="My final recommendation is intentionally narrow.",
            duration_ms=8_000,
            monotonic_ms=1_001,
        )
        predeadline_close.speech_created(
            handle_id="speech-close",
            monotonic_ms=1_002,
        )
        self.assertTrue(
            self.authorize_pending(predeadline_close, monotonic_ms=1_002)
        )
        self.assertEqual(predeadline_close.state.move_ledger[-1].stage, "generated")

    def test_adapter_commits_only_the_persisted_interviewer_transcript(self):
        adapter = self.make_adapter()
        directive = adapter.complete_user_turn(
            message_id="turn-1",
            transcript_revision="writer-1:turn-1",
            text="I would define the target segment before proposing a solution.",
            duration_ms=8_000,
            monotonic_ms=1_001,
        )
        adapter.speech_created(handle_id="speech-1", monotonic_ms=1_002)
        self.assertTrue(self.authorize_pending(adapter, monotonic_ms=1_002))
        adapter.speech_finished(
            handle_id="speech-1",
            scheduled=True,
            interrupted=False,
            has_confirmed_prefix=True,
            assistant_message_ids=("assistant-1",),
            monotonic_ms=1_003,
        )
        adapter.persisted_transcript(
            {
                "speaker": "interviewer",
                "event_id": "writer-1:assistant-1",
                "writer_id": "writer-1",
                "writer_generation": 1,
                "sequence": 2,
                "delivery_state": "partially_delivered",
            },
            monotonic_ms=1_004,
        )
        move = adapter.state.move_ledger[-1]
        self.assertEqual(move.move_id, directive.move_id)
        self.assertEqual(move.stage, "canonically_delivered")
        self.assertEqual(move.delivery_evidence.event_id, "writer-1:assistant-1")
        self.assertEqual(move.delivery_evidence.delivery_state, "partially_delivered")

    def test_adapter_interruption_without_prefix_recovers_and_never_commits(self):
        adapter = self.make_adapter()
        directive = adapter.complete_user_turn(
            message_id="turn-1",
            transcript_revision="writer-1:turn-1",
            text="I would start from the user's goal and current alternatives.",
            duration_ms=8_000,
            monotonic_ms=1_001,
        )
        adapter.speech_created(handle_id="speech-1", monotonic_ms=1_002)
        self.assertTrue(self.authorize_pending(adapter, monotonic_ms=1_002))
        adapter.speech_finished(
            handle_id="speech-1",
            scheduled=True,
            interrupted=True,
            has_confirmed_prefix=False,
            monotonic_ms=1_003,
        )
        self.assertEqual(adapter.state.move_ledger[-1].stage, "aborted")
        self.assertIsNone(adapter.state.move_ledger[-1].delivery_evidence)

        recovered = adapter.complete_user_turn(
            message_id="turn-2",
            transcript_revision="writer-1:turn-2",
            text="I can continue that answer with the specific tradeoffs.",
            duration_ms=7_000,
            monotonic_ms=1_004,
        )
        self.assertEqual(
            adapter.state.move_ledger[-1].recovery_of_move_id,
            directive.move_id,
        )
        self.assertEqual(recovered.move_id, adapter.state.pending_move_id)

    def test_adapter_failure_disables_controller_and_returns_existing_path(self):
        adapter = self.make_adapter()
        adapter._state = replace(adapter.state, allowed_moves=("close",))
        directive = adapter.complete_user_turn(
            message_id="turn-1",
            transcript_revision="writer-1:turn-1",
            text="I would start with a clearly bounded target user.",
            duration_ms=8_000,
            monotonic_ms=1_001,
        )
        self.assertIsNone(directive)
        self.assertFalse(adapter.enabled)
        self.assertEqual(adapter.status.failure_reason, "invalid_state")

    def test_adapter_close_delivery_suppresses_only_later_replies(self):
        adapter = self.make_adapter(observed_at="2026-08-19T12:29:30.000Z")
        directive = adapter.complete_user_turn(
            message_id="turn-1",
            transcript_revision="writer-1:turn-1",
            text="My final recommendation is to focus on the primary segment.",
            duration_ms=7_000,
            monotonic_ms=1_001,
        )
        self.assertEqual(adapter.state.move_ledger[-1].move_type, "close")
        self.assertFalse(directive.suppress_reply)
        adapter.speech_created(handle_id="speech-close", monotonic_ms=1_002)
        self.assertTrue(self.authorize_pending(adapter, monotonic_ms=1_002))
        adapter.speech_finished(
            handle_id="speech-close",
            scheduled=True,
            interrupted=False,
            has_confirmed_prefix=True,
            assistant_message_ids=("assistant-close",),
            monotonic_ms=1_003,
        )
        adapter.persisted_transcript(
            {
                "speaker": "interviewer",
                "event_id": "writer-1:assistant-close",
                "writer_id": "writer-1",
                "writer_generation": 1,
                "sequence": 2,
                "delivery_state": "delivered",
            },
            monotonic_ms=1_004,
        )
        self.assertTrue(adapter.state.terminal)
        closed_state = adapter.state
        later = adapter.complete_user_turn(
            message_id="turn-2",
            transcript_revision="writer-1:turn-2",
            text="Are you still there?",
            duration_ms=3_000,
            monotonic_ms=1_005,
        )
        self.assertTrue(later.suppress_reply)
        self.assertIsNone(later.instruction)
        self.assertIs(adapter.state, closed_state)

    def test_measured_turn_duration_is_bounded_to_valid_runtime_metrics(self):
        self.assertEqual(
            measured_turn_duration_ms(
                {"started_speaking_at": 10.125, "stopped_speaking_at": 12.5}
            ),
            2_375,
        )
        self.assertEqual(measured_turn_duration_ms({}), 0)
        self.assertEqual(
            measured_turn_duration_ms(
                {"started_speaking_at": 12.5, "stopped_speaking_at": 10.0}
            ),
            0,
        )

    def test_unrelated_persisted_interviewer_event_cannot_commit_pending_move(self):
        adapter = self.make_adapter()
        directive = adapter.complete_user_turn(
            message_id="turn-1",
            transcript_revision="writer-1:turn-1",
            text="I would prioritize the most underserved user segment first.",
            duration_ms=8_000,
            monotonic_ms=1_001,
        )
        adapter.persisted_transcript(
            {
                "speaker": "interviewer",
                "event_id": "writer-1:unrelated-opening",
                "writer_id": "writer-1",
                "writer_generation": 1,
                "sequence": 1,
                "delivery_state": "delivered",
            },
            monotonic_ms=1_002,
        )
        self.assertEqual(adapter.state.move_ledger[-1].stage, "admitted")
        self.assertEqual(adapter.state.pending_move_id, directive.move_id)

        adapter.speech_created(handle_id="speech-1", monotonic_ms=1_003)
        self.assertTrue(self.authorize_pending(adapter, monotonic_ms=1_003))
        adapter.speech_finished(
            handle_id="speech-1",
            scheduled=True,
            interrupted=False,
            has_confirmed_prefix=True,
            assistant_message_ids=("assistant-1",),
            monotonic_ms=1_004,
        )
        self.assertEqual(adapter.state.move_ledger[-1].stage, "spoken")
        adapter.persisted_transcript(
            {
                "speaker": "interviewer",
                "event_id": "writer-1:assistant-1",
                "writer_id": "writer-1",
                "writer_generation": 1,
                "sequence": 2,
                "delivery_state": "delivered",
            },
            monotonic_ms=1_005,
        )
        self.assertEqual(adapter.state.move_ledger[-1].stage, "canonically_delivered")

    def test_first_correlated_assistant_item_is_the_only_move_commit(self):
        adapter = self.make_adapter()
        adapter.complete_user_turn(
            message_id="turn-1",
            transcript_revision="writer-1:turn-1",
            text="I would start by identifying the primary user and their goal.",
            duration_ms=8_000,
            monotonic_ms=1_001,
        )
        adapter.speech_created(handle_id="speech-1", monotonic_ms=1_002)
        self.assertTrue(self.authorize_pending(adapter, monotonic_ms=1_002))
        adapter.speech_finished(
            handle_id="speech-1",
            scheduled=True,
            interrupted=False,
            has_confirmed_prefix=True,
            assistant_message_ids=("assistant-1a", "assistant-1b"),
            monotonic_ms=1_003,
        )
        first_event = {
            "speaker": "interviewer",
            "event_id": "writer-1:assistant-1a",
            "writer_id": "writer-1",
            "writer_generation": 1,
            "sequence": 2,
            "delivery_state": "delivered",
        }
        adapter.persisted_transcript(first_event, monotonic_ms=1_004)
        delivered = adapter.state
        second_event = {
            **first_event,
            "event_id": "writer-1:assistant-1b",
            "sequence": 3,
        }
        adapter.persisted_transcript(second_event, monotonic_ms=1_005)
        self.assertTrue(adapter.enabled)
        self.assertIs(adapter.state, delivered)
        self.assertEqual(
            adapter.state.move_ledger[-1].delivery_evidence.event_id,
            "writer-1:assistant-1a",
        )

    def test_candidate_revision_is_explicit_then_reconciled_on_persistence(self):
        adapter = self.make_adapter()
        directive = adapter.complete_user_turn(
            message_id="turn-1",
            transcript_revision="writer-1:turn-1",
            text="I would define the target user and goal before ideating.",
            duration_ms=8_000,
            monotonic_ms=1_001,
        )
        self.assertIsNotNone(directive)
        adapter.persisted_transcript(
            {
                "speaker": "user",
                "event_id": "writer-1:turn-1",
                "writer_id": "writer-1",
                "writer_generation": 1,
                "sequence": 1,
                "delivery_state": "delivered",
            },
            source_message_id="turn-1",
            monotonic_ms=1_002,
        )
        self.assertTrue(adapter.enabled)

    def test_persisted_no_prefix_marker_upgrades_aborted_move(self):
        adapter = self.make_adapter()
        adapter.complete_user_turn(
            message_id="turn-1",
            transcript_revision="writer-1:turn-1",
            text="I would start by understanding the user's current workflow.",
            duration_ms=8_000,
            monotonic_ms=1_001,
        )
        adapter.speech_created(handle_id="speech-1", monotonic_ms=1_002)
        self.assertTrue(self.authorize_pending(adapter, monotonic_ms=1_002))
        adapter.speech_finished(
            handle_id="speech-1",
            scheduled=True,
            interrupted=True,
            has_confirmed_prefix=False,
            monotonic_ms=1_003,
        )
        self.assertEqual(adapter.state.move_ledger[-1].stage, "aborted")
        adapter.persisted_interruption_marker(
            {
                "event_id": "writer-1:speech-1:unavailable",
                "writer_id": "writer-1",
                "writer_generation": 1,
                "sequence": 2,
                "speaker": "interviewer",
                "reason": "no_provider_confirmed_prefix",
            },
            monotonic_ms=1_004,
        )
        self.assertEqual(adapter.state.move_ledger[-1].stage, "interrupted")
        self.assertEqual(
            adapter.state.move_ledger[-1].delivery_evidence.evidence_type,
            "interruption_marker",
        )

    def test_ingest_queue_observes_marker_only_after_successful_persistence(self):
        observed = []

        async def exercise():
            async def transport(_url, _body, _headers):
                return IngestResponse(200)

            async def publisher(_event):
                return None

            async def observe_marker(marker):
                observed.append(marker)

            queue = TranscriptIngestQueue(
                ingest_url="https://meelni.com/api/internal/transcript",
                livekit_api_secret="livekit-secret",
                transport=transport,
                publisher=publisher,
                persisted_interruption_observer=observe_marker,
                now=lambda: 1787112000,
            )
            marker = create_interruption_marker(
                event_id="writer-1:speech-1:unavailable",
                writer_id="writer-1",
                writer_generation=1,
                sequence=2,
                session_id="session-471",
                room_name="room-471",
                speaker="interviewer",
                reason="no_provider_confirmed_prefix",
                occurred_at=1787112000,
            )
            queue.enqueue_interruption_marker(marker)
            self.assertEqual(observed, [])
            result = await queue.flush(0.5)
            self.assertTrue(result.settled)
            self.assertEqual(observed, [marker])

        asyncio.run(exercise())

    def test_pinned_suppression_keeps_exactly_one_user_persistence_path(self):
        persisted_event_ids = []
        transport_event_ids = []
        conversation_callbacks = {}

        async def exercise():
            adapter = self.make_adapter(
                observed_at="2026-08-19T12:29:59.999Z"
            )
            gate = ReplySuppressionGate()
            source_message_ids = {}

            async def transport(_url, body, _headers):
                envelope = json.loads(body)
                transport_event_ids.append(envelope["event"]["event_id"])
                return IngestResponse(200)

            async def publisher(event):
                event_id = str(event["event_id"])
                persisted_event_ids.append(event_id)
                adapter.persisted_transcript(
                    event,
                    source_message_id=source_message_ids[event_id],
                )

            queue = TranscriptIngestQueue(
                ingest_url="https://meelni.com/api/internal/transcript",
                livekit_api_secret="livekit-secret",
                transport=transport,
                publisher=publisher,
                now=lambda: 1787112000,
            )

            async def simulate_pinned_turn(message_id, text, sequence):
                directive = adapter.complete_user_turn(
                    message_id=message_id,
                    transcript_revision=f"writer-1:{message_id}",
                    text=text,
                    duration_ms=1_000,
                    monotonic_ms=1_000 + sequence,
                )
                self.assertTrue(directive.suppress_reply)
                self.assertIsNone(directive.instruction)

                gate.arm(message_id)
                turn_items = [
                    SimpleNamespace(role="user", id=message_id),
                    SimpleNamespace(
                        role="system",
                        id=f"controller:suppress:{message_id}",
                    ),
                ]
                # LiveKit schedules the empty generation before committing the
                # same finalized item through conversation_item_added.
                llm_result = (
                    "provider"
                    if allow_controller_generation(adapter, gate, turn_items)
                    else None
                )
                self.assertIsNone(llm_result)
                self.assertFalse(gate.consume_for_items(turn_items))

                conversation_callbacks[message_id] = (
                    conversation_callbacks.get(message_id, 0) + 1
                )
                event_id = f"writer-1:{message_id}"
                source_message_ids[event_id] = message_id
                event = create_transcript_event(
                    event_id=event_id,
                    writer_id="writer-1",
                    writer_generation=1,
                    sequence=sequence,
                    session_id="session-471",
                    room_name="room-471",
                    speaker="user",
                    text=text,
                    started_at=1787112000 + sequence * 10,
                    ended_at=1787112001 + sequence * 10,
                    audio_duration_ms=1_000,
                    section="product_sense",
                )
                self.assertTrue(queue.enqueue_transcript(event))
                result = await queue.flush(0.5)
                self.assertTrue(result.settled)

            await simulate_pinned_turn(
                "turn-crossed-elapsed",
                "One final candidate detail.",
                1,
            )
            terminal_state = adapter.state
            self.assertTrue(terminal_state.terminal)
            await simulate_pinned_turn("turn-after-terminal", "Are you there?", 2)
            self.assertIs(adapter.state, terminal_state)

        asyncio.run(exercise())
        expected = [
            "writer-1:turn-crossed-elapsed",
            "writer-1:turn-after-terminal",
        ]
        self.assertEqual(transport_event_ids, expected)
        self.assertEqual(persisted_event_ids, expected)
        self.assertEqual(
            conversation_callbacks,
            {"turn-crossed-elapsed": 1, "turn-after-terminal": 1},
        )

    def test_throwing_marker_observer_cannot_retry_or_fail_settlement(self):
        attempts = []

        async def exercise():
            async def transport(_url, body, _headers):
                envelope = json.loads(body)
                attempts.append(
                    "marker" if "interruptionMarker" in envelope else "settlement"
                )
                return IngestResponse(200)

            async def publisher(_event):
                return None

            async def throwing_observer(_marker):
                raise RuntimeError("controller observer unavailable")

            queue = TranscriptIngestQueue(
                ingest_url="https://meelni.com/api/internal/transcript",
                livekit_api_secret="livekit-secret",
                transport=transport,
                publisher=publisher,
                persisted_interruption_observer=throwing_observer,
                now=lambda: 1787112000,
            )
            marker = create_interruption_marker(
                event_id="writer-1:speech-1:unavailable",
                writer_id="writer-1",
                writer_generation=1,
                sequence=2,
                session_id="session-471",
                room_name="room-471",
                speaker="interviewer",
                reason="no_provider_confirmed_prefix",
                occurred_at=1787112000,
            )
            queue.enqueue_interruption_marker(marker)
            queue.seal_and_enqueue_runtime_settlement(
                create_runtime_settlement(
                    session_id="session-471",
                    room_name="room-471",
                    writer_id="writer-1",
                    writer_generation=1,
                    state="settled",
                    settled_at=1787112000,
                )
            )

            result = await queue.flush(0.5)
            self.assertTrue(result.settled)
            self.assertEqual(result.complete, 2)
            self.assertEqual(result.pending, 0)
            self.assertEqual(result.permanent, 0)
            self.assertTrue(queue.runtime_settlement_complete)
            self.assertCountEqual(attempts, ["marker", "settlement"])

            completed_attempts = list(attempts)
            repeated = await queue.flush(0.5)
            self.assertTrue(repeated.settled)
            self.assertEqual(attempts, completed_attempts)

        asyncio.run(exercise())

    def test_runtime_mode_keeps_existing_interviewer_off_and_emits_directive_on(self):
        disabled_adapter = create_interview_controller_adapter(
            env={},
            session_id="session-471",
            deadline_at=None,
            writer_id="writer-1",
            writer_generation=1,
            interview_brief=None,
            monotonic_ms=1_000,
        )
        self.assertEqual(
            resolve_controller_runtime_mode(disabled_adapter),
            "existing_interviewer",
        )

        adapter = self.make_adapter()
        self.assertEqual(
            resolve_controller_runtime_mode(adapter),
            "controlled_interviewer",
        )
        directive = adapter.complete_user_turn(
            message_id="turn-1",
            transcript_revision="writer-1:turn-1",
            text="I would define the target user and product goal first.",
            duration_ms=8_000,
            monotonic_ms=1_001,
        )
        self.assertIn("CONTROLLER_SNAPSHOT", directive.instruction)
        self.assertEqual(adapter.state.move_ledger[-1].stage, "admitted")


if __name__ == "__main__":
    unittest.main()
