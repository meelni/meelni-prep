import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from shared.opik_tracing import (
    ContentControlledSpanExporter,
    interview_contract_trace_attributes,
    read_opik_tracing_config,
)


class CapturingExporter:
    def __init__(self) -> None:
        self.spans = []
        self.shutdown_called = False

    def export(self, spans):
        self.spans.extend(spans)
        return "success"

    def shutdown(self) -> None:
        self.shutdown_called = True

    def force_flush(self, timeout_millis=30000) -> bool:
        return True


class OpikTracingTests(unittest.TestCase):
    def test_interview_contract_trace_metadata_is_version_only(self):
        attributes = interview_contract_trace_attributes(
            {
                "session_id": "private-session",
                "question": {"text": "private question"},
                "interview_brief_resolution": "brief_v2",
                "interview_brief": {
                    "contract_version": "interview-brief.v2",
                    "policy": {
                        "contract_version": "full-interview-policy.v1"
                    },
                    "round_pack": {"contract_version": "pm-round-pack.v1"},
                },
            }
        )

        self.assertEqual(
            attributes,
            {
                "meelni.interview.prompt_contract_version":
                    "full_interview_prompt_v1",
                "meelni.interview.brief_resolution": "brief_v2",
                "meelni.interview.brief_contract_version":
                    "interview-brief.v2",
                "meelni.interview.policy_contract_version":
                    "full-interview-policy.v1",
                "meelni.interview.round_pack_contract_version":
                    "pm-round-pack.v1",
            },
        )
        self.assertNotIn("private-session", json.dumps(attributes))
        self.assertNotIn("private question", json.dumps(attributes))

        self.assertEqual(
            interview_contract_trace_attributes(
                {"interview_brief_resolution": "private question"}
            )["meelni.interview.brief_resolution"],
            "invalid_payload",
        )

    def test_sanitizer_retains_contract_versions_without_private_context(self):
        delegate = CapturingExporter()
        exporter = ContentControlledSpanExporter(delegate, capture_content=False)
        span = private_livekit_span()
        span.attributes.update(
            interview_contract_trace_attributes(
                {
                    "interview_brief_resolution": "brief_v2",
                    "interview_brief": {
                        "contract_version": "interview-brief.v2",
                        "policy": {
                            "contract_version": "full-interview-policy.v1"
                        },
                        "round_pack": {
                            "contract_version": "pm-round-pack.v1"
                        },
                    },
                }
            )
        )

        exporter.export([span])

        exported = delegate.spans[0]
        self.assertEqual(
            exported.attributes["meelni.interview.prompt_contract_version"],
            "full_interview_prompt_v1",
        )
        self.assertEqual(
            exported.attributes["meelni.interview.policy_contract_version"],
            "full-interview-policy.v1",
        )
        self.assertEqual(
            exported.attributes["meelni.interview.round_pack_contract_version"],
            "pm-round-pack.v1",
        )
        self.assertNotIn("lk.user_transcript", exported.attributes)

    def test_config_is_opt_in_and_requires_all_credentials(self):
        self.assertIsNone(read_opik_tracing_config({}))
        self.assertIsNone(
            read_opik_tracing_config({"OPIK_TRACING_ENABLED": "true"})
        )
        self.assertIsNone(
            read_opik_tracing_config(
                {
                    "OPIK_TRACING_ENABLED": "true",
                    "OPIK_API_KEY": "secret",
                    "OPIK_WORKSPACE": "meelni-workspace",
                    "OPIK_PROJECT_NAME": "meelni",
                    "OPIK_URL_OVERRIDE": "http://untrusted.example.test/opik",
                }
            )
        )

        config = read_opik_tracing_config(
            {
                "OPIK_TRACING_ENABLED": "true",
                "OPIK_API_KEY": "secret",
                "OPIK_WORKSPACE": "meelni-workspace",
                "OPIK_PROJECT_NAME": "meelni",
                "OPIK_CAPTURE_CONTENT": "true",
                "VERCEL_ENV": "preview",
                "VERCEL_GIT_COMMIT_SHA": "a" * 40,
            }
        )

        self.assertIsNotNone(config)
        assert config is not None
        self.assertTrue(config.capture_content)
        self.assertEqual(config.environment, "preview")
        self.assertEqual(
            config.traces_endpoint,
            "https://www.comet.com/opik/api/v1/private/otel/v1/traces",
        )

    def test_metadata_only_export_removes_content_and_identity(self):
        delegate = CapturingExporter()
        exporter = ContentControlledSpanExporter(delegate, capture_content=False)

        exporter.export([private_livekit_span()])

        exported = delegate.spans[0]
        self.assertEqual(exported.name, "llm_request")
        self.assertEqual(exported.attributes["gen_ai.request.model"], "gpt-4.1-mini")
        self.assertEqual(exported.attributes["gen_ai.usage.input_tokens"], 42)
        self.assertNotIn("lk.user_transcript", exported.attributes)
        self.assertNotIn("lk.participant_identity", exported.attributes)
        self.assertEqual(exported.events, ())
        self.assertIsNone(exported.status.description)
        self.assertEqual(
            dict(exported.resource.attributes),
            {
                "service.name": "meelni-interview-agent",
                "deployment.environment.name": "preview",
            },
        )

    def test_content_export_keeps_transcript_but_not_identifiers_or_raw_errors(self):
        delegate = CapturingExporter()
        exporter = ContentControlledSpanExporter(delegate, capture_content=True)

        exporter.export([private_livekit_span()])

        exported = delegate.spans[0]
        self.assertEqual(exported.attributes["lk.user_transcript"], "private answer")
        self.assertEqual(exported.attributes["input"], "private answer")
        self.assertNotIn("lk.participant_identity", exported.attributes)
        self.assertNotIn("lk.room_name", exported.attributes)
        self.assertEqual(len(exported.events), 1)
        self.assertEqual(exported.events[0].attributes["content"], "private answer")
        self.assertNotIn("tool_calls", exported.events[0].attributes)
        self.assertIsNone(exported.status.description)

    def test_content_export_projects_agent_turn_to_opik_input_and_output(self):
        delegate = CapturingExporter()
        exporter = ContentControlledSpanExporter(delegate, capture_content=True)

        exporter.export([private_agent_turn_span()])

        exported = delegate.spans[0]
        self.assertEqual(exported.name, "agent_turn")
        self.assertEqual(exported.attributes["input"], "candidate answer")
        self.assertEqual(exported.attributes["output"], "interviewer follow-up")
        self.assertEqual(exported.attributes["lk.user_input"], "candidate answer")
        self.assertEqual(
            exported.attributes["lk.response.text"], "interviewer follow-up"
        )
        self.assertNotIn("lk.participant_identity", exported.attributes)

    def test_metadata_only_export_does_not_create_opik_content_fields(self):
        delegate = CapturingExporter()
        exporter = ContentControlledSpanExporter(delegate, capture_content=False)
        context = FakeSpanContext(trace_id=123)

        exporter.export([private_agent_turn_span(context=context)])
        exporter.export([private_agent_session_span(context=context)])

        exported_turn, exported_root = delegate.spans
        self.assertEqual(exported_turn.name, "agent_turn")
        self.assertNotIn("input", exported_turn.attributes)
        self.assertNotIn("output", exported_turn.attributes)
        self.assertNotIn("lk.user_input", exported_turn.attributes)
        self.assertNotIn("lk.response.text", exported_turn.attributes)
        self.assertEqual(exported_root.name, "agent_session")
        self.assertNotIn("input", exported_root.attributes)
        self.assertNotIn("output", exported_root.attributes)

    def test_metadata_only_semantic_span_keeps_only_closed_safe_attributes(self):
        delegate = CapturingExporter()
        exporter = ContentControlledSpanExporter(delegate, capture_content=False)

        exporter.export([private_interviewer_semantic_span()])

        exported = delegate.spans[0]
        self.assertEqual(exported.name, "interviewer_semantic_event")
        self.assertEqual(
            exported.attributes["meelni.interviewer.event_kind"], "tool"
        )
        self.assertEqual(
            exported.attributes["meelni.interviewer.tool_outcome"], "timeout"
        )
        self.assertNotIn("transcript", exported.attributes)
        self.assertNotIn("tool_payload", exported.attributes)
        self.assertNotIn("candidate_identity", exported.attributes)
        self.assertNotIn("provider_identity", exported.attributes)
        self.assertNotIn("gen_ai.provider.name", exported.attributes)
        self.assertNotIn("gen_ai.request.model", exported.attributes)
        self.assertNotIn("hidden_reasoning", exported.attributes)

    def test_content_mode_never_adds_content_to_semantic_spans(self):
        delegate = CapturingExporter()
        exporter = ContentControlledSpanExporter(delegate, capture_content=True)

        exporter.export(
            [private_agent_turn_span(), private_interviewer_semantic_span()]
        )

        exported_turn, exported_semantic = delegate.spans
        self.assertEqual(exported_turn.attributes["input"], "candidate answer")
        self.assertEqual(
            exported_turn.attributes["output"], "interviewer follow-up"
        )
        self.assertNotIn("input", exported_semantic.attributes)
        self.assertNotIn("output", exported_semantic.attributes)
        self.assertNotIn("lk.user_input", exported_semantic.attributes)
        self.assertNotIn("lk.response.text", exported_semantic.attributes)

    def test_content_export_projects_conversation_onto_root_trace(self):
        delegate = CapturingExporter()
        exporter = ContentControlledSpanExporter(delegate, capture_content=True)
        context = FakeSpanContext(trace_id=123)

        exporter.export(
            [
                private_agent_turn_span(
                    context=context,
                    user_input=None,
                    response_text="opening question",
                ),
                private_user_turn_span(context=context),
                private_agent_turn_span(context=context),
            ]
        )
        exporter.export(
            [
                private_agent_session_span(
                    context=context,
                    parent=FakeSpanContext(trace_id=123),
                )
            ]
        )
        exporter.export([private_job_entrypoint_span(context=context)])

        exported_session, exported_root = delegate.spans[-2:]
        self.assertEqual(exported_session.name, "agent_session")
        self.assertEqual(
            exported_session.attributes["output"], "interviewer follow-up"
        )
        self.assertEqual(exported_root.name, "job_entrypoint")
        self.assertEqual(exported_root.attributes["output"], "interviewer follow-up")
        self.assertEqual(
            json.loads(exported_root.attributes["input"]),
            {
                "conversation": [
                    {"role": "assistant", "content": "opening question"},
                    {"role": "user", "content": "candidate answer"},
                    {
                        "role": "assistant",
                        "content": "interviewer follow-up",
                    },
                ]
            },
        )
        self.assertNotIn("lk.participant_identity", exported_root.attributes)


class FakeResource:
    def __init__(self, attributes):
        self.attributes = attributes


class FakeStatus:
    def __init__(self, status_code, description=None):
        self.status_code = status_code
        self.description = description


class FakeSpanContext:
    def __init__(self, trace_id):
        self.trace_id = trace_id


class FakeEvent:
    def __init__(self, name, attributes, timestamp=None):
        self.name = name
        self.attributes = attributes
        self.timestamp = timestamp


class FakeReadableSpan:
    def __init__(
        self,
        *,
        name,
        context=None,
        parent=None,
        resource,
        attributes,
        events=(),
        links=(),
        kind=None,
        status=None,
        start_time=None,
        end_time=None,
        instrumentation_scope=None,
    ):
        self.name = name
        self.context = context
        self.parent = parent
        self.resource = resource
        self.attributes = attributes
        self.events = events
        self.links = links
        self.kind = kind
        self.status = status or FakeStatus("unset")
        self.start_time = start_time
        self.end_time = end_time
        self.instrumentation_scope = instrumentation_scope


def private_livekit_span() -> FakeReadableSpan:
    return FakeReadableSpan(
        name="llm_request",
        resource=FakeResource(
            {
                "service.name": "meelni-interview-agent",
                "deployment.environment.name": "preview",
                "host.name": "private-host",
            }
        ),
        attributes={
            "gen_ai.request.model": "gpt-4.1-mini",
            "gen_ai.usage.input_tokens": 42,
            "lk.user_transcript": "private answer",
            "lk.participant_identity": "private-user-id",
            "lk.room_name": "private-room",
            "exception.stacktrace": "private traceback",
        },
        events=(
            FakeEvent(
                "gen_ai.user.message",
                {
                    "content": "private answer",
                    "role": "user",
                    "tool_calls": "private tool arguments",
                },
            ),
        ),
        status=FakeStatus("error", "private provider error"),
    )


def private_agent_turn_span(
    *,
    context=None,
    user_input="candidate answer",
    response_text="interviewer follow-up",
) -> FakeReadableSpan:
    attributes = {
        "input": "unapproved generic input",
        "output": "unapproved generic output",
        "lk.participant_identity": "private-user-id",
    }
    if user_input is not None:
        attributes["lk.user_input"] = user_input
    if response_text is not None:
        attributes["lk.response.text"] = response_text
    return FakeReadableSpan(
        name="agent_turn",
        context=context,
        resource=FakeResource(
            {
                "service.name": "meelni-interview-agent",
                "deployment.environment.name": "preview",
            }
        ),
        attributes=attributes,
        status=FakeStatus("unset"),
    )


def private_user_turn_span(*, context=None) -> FakeReadableSpan:
    return FakeReadableSpan(
        name="user_turn",
        context=context,
        resource=FakeResource(
            {
                "service.name": "meelni-interview-agent",
                "deployment.environment.name": "preview",
            }
        ),
        attributes={
            "lk.user_transcript": "candidate answer",
            "lk.participant_identity": "private-user-id",
        },
        status=FakeStatus("unset"),
    )


def private_agent_session_span(*, context=None, parent=None) -> FakeReadableSpan:
    return FakeReadableSpan(
        name="agent_session",
        context=context,
        parent=parent,
        resource=FakeResource(
            {
                "service.name": "meelni-interview-agent",
                "deployment.environment.name": "preview",
            }
        ),
        attributes={"lk.room_name": "private-room"},
        status=FakeStatus("unset"),
    )


def private_job_entrypoint_span(*, context=None) -> FakeReadableSpan:
    return FakeReadableSpan(
        name="job_entrypoint",
        context=context,
        resource=FakeResource(
            {
                "service.name": "meelni-interview-agent",
                "deployment.environment.name": "preview",
            }
        ),
        attributes={
            "lk.job_id": "private-job",
            "lk.room_name": "private-room",
        },
        status=FakeStatus("unset"),
    )


def private_interviewer_semantic_span() -> FakeReadableSpan:
    return FakeReadableSpan(
        name="interviewer_semantic_event",
        resource=FakeResource(
            {
                "service.name": "meelni-interview-agent",
                "deployment.environment.name": "preview",
            }
        ),
        attributes={
            "meelni.interviewer.contract_version": (
                "interviewer-observability.v1"
            ),
            "meelni.interviewer.event_kind": "tool",
            "meelni.interviewer.runtime_correlation_id": "run:synthetic",
            "meelni.interviewer.turn_correlation_id": "turn:synthetic",
            "meelni.interviewer.runtime_version": "director-shadow.v1",
            "meelni.interviewer.rollout_cohort": "shadow",
            "meelni.interviewer.emitted_at": "2026-08-19T01:20:00.000Z",
            "meelni.interviewer.tool_contract_version": "interviewer-tools.v1",
            "meelni.interviewer.tool_name": "read_interview_state",
            "meelni.interviewer.tool_outcome": "timeout",
            "meelni.interviewer.latency_ms": 100,
            "transcript": "synthetic candidate answer",
            "tool_payload": "synthetic tool result",
            "candidate_identity": "candidate@example.test",
            "provider_identity": "provider-request-123",
            "gen_ai.provider.name": "synthetic-provider",
            "gen_ai.request.model": "synthetic-model",
            "hidden_reasoning": "private plan",
            "lk.user_input": "synthetic candidate answer",
            "lk.response.text": "synthetic interviewer response",
        },
        status=FakeStatus("unset"),
    )


if __name__ == "__main__":
    unittest.main()
