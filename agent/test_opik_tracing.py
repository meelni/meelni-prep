import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import Event, ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.trace import Status, StatusCode

from shared.opik_tracing import (
    ContentControlledSpanExporter,
    read_opik_tracing_config,
)


class CapturingExporter(SpanExporter):
    def __init__(self) -> None:
        self.spans = []
        self.shutdown_called = False

    def export(self, spans):
        self.spans.extend(spans)
        return SpanExportResult.SUCCESS

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


def private_livekit_span() -> ReadableSpan:
    return ReadableSpan(
        name="llm_request",
        resource=Resource(
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
            Event(
                "gen_ai.user.message",
                {
                    "content": "private answer",
                    "role": "user",
                    "tool_calls": "private tool arguments",
                },
            ),
        ),
        status=Status(StatusCode.ERROR, "private provider error"),
    )


if __name__ == "__main__":
    unittest.main()
