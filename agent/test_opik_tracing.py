import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from shared.opik_tracing import (
    ContentControlledSpanExporter,
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
        self.assertNotIn("lk.participant_identity", exported.attributes)
        self.assertNotIn("lk.room_name", exported.attributes)
        self.assertEqual(len(exported.events), 1)
        self.assertEqual(exported.events[0].attributes["content"], "private answer")
        self.assertNotIn("tool_calls", exported.events[0].attributes)
        self.assertIsNone(exported.status.description)


class FakeResource:
    def __init__(self, attributes):
        self.attributes = attributes


class FakeStatus:
    def __init__(self, status_code, description=None):
        self.status_code = status_code
        self.description = description


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


if __name__ == "__main__":
    unittest.main()
