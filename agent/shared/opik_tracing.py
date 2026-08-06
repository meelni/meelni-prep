"""Opt-in Opik export for LiveKit traces with a closed privacy boundary."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Mapping, Sequence
from urllib.parse import urlparse

from livekit.agents.telemetry import set_tracer_provider
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import Event, ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter
from opentelemetry.trace import Status

DEFAULT_OPIK_API_URL = "https://www.comet.com/opik/api"

_SAFE_SPAN_NAMES = {
    "agent_session",
    "agent_speaking",
    "amd",
    "drain_agent_activity",
    "eou_detection",
    "function_tool",
    "job_entrypoint",
    "judge_evaluation",
    "llm_fallback_adapter",
    "llm_node",
    "llm_request",
    "llm_request_run",
    "realtime_metrics",
    "tts_fallback_adapter",
    "tts_node",
    "tts_request",
    "tts_request_run",
    "tts_stream_adapter",
    "user_speaking",
    "user_turn",
}

_SAFE_ATTRIBUTES = {
    "gen_ai.operation.name",
    "gen_ai.provider.name",
    "gen_ai.request.model",
    "gen_ai.usage.input_tokens",
    "gen_ai.usage.output_tokens",
    "gen_ai.usage.input_text_tokens",
    "gen_ai.usage.input_audio_tokens",
    "gen_ai.usage.input_cached_tokens",
    "gen_ai.usage.output_text_tokens",
    "gen_ai.usage.output_audio_tokens",
    "lk.retry_count",
    "lk.interrupted",
    "lk.response.ttft",
    "lk.response.ttfb",
    "lk.e2e_latency",
}

_CONTENT_ATTRIBUTES = {
    "lk.user_input",
    "lk.instructions",
    "lk.response.text",
    "lk.input_text",
    "lk.user_transcript",
}

_CONTENT_EVENT_NAMES = {
    "gen_ai.system.message",
    "gen_ai.user.message",
    "gen_ai.assistant.message",
    "gen_ai.tool.message",
    "gen_ai.choice",
}

_SAFE_RESOURCE_ATTRIBUTES = {
    "service.name",
    "service.version",
    "deployment.environment.name",
}


@dataclass(frozen=True)
class OpikTracingConfig:
    api_key: str
    workspace: str
    project_name: str
    traces_endpoint: str
    capture_content: bool
    environment: str
    release: str | None


class ContentControlledSpanExporter(SpanExporter):
    """Export copies of spans after removing identities and unsafe payloads."""

    def __init__(self, delegate: SpanExporter, capture_content: bool) -> None:
        self._delegate = delegate
        self._capture_content = capture_content

    def export(self, spans: Sequence[ReadableSpan]):
        sanitized = tuple(
            sanitize_livekit_span(span, self._capture_content) for span in spans
        )
        return self._delegate.export(sanitized)

    def shutdown(self) -> None:
        self._delegate.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._delegate.force_flush(timeout_millis)


def setup_opik_tracing(
    service_name: str,
    env: Mapping[str, str] | None = None,
) -> bool:
    """Install the Opik exporter once when all opt-in configuration is present."""
    config = read_opik_tracing_config(env if env is not None else os.environ)
    if config is None:
        return False

    try:
        resource_attributes: dict[str, str] = {
            "service.name": normalize_service_name(service_name),
            "deployment.environment.name": config.environment,
        }
        if config.release:
            resource_attributes["service.version"] = config.release

        exporter = OTLPSpanExporter(
            endpoint=config.traces_endpoint,
            headers={
                "Authorization": config.api_key,
                "Comet-Workspace": config.workspace,
                "projectName": config.project_name,
            },
            timeout=5,
        )
        provider = TracerProvider(resource=Resource(resource_attributes))
        provider.add_span_processor(
            BatchSpanProcessor(
                ContentControlledSpanExporter(exporter, config.capture_content)
            )
        )
        set_tracer_provider(provider)
        return True
    except Exception:
        # Observability configuration cannot make a voice worker unavailable.
        return False


def read_opik_tracing_config(
    env: Mapping[str, str],
) -> OpikTracingConfig | None:
    if not is_true(env.get("OPIK_TRACING_ENABLED")):
        return None

    api_key = normalize_secret(env.get("OPIK_API_KEY"))
    workspace = clean(env.get("OPIK_WORKSPACE"))
    project_name = clean(env.get("OPIK_PROJECT_NAME"))
    if not api_key or not workspace or not project_name:
        return None

    raw_api_url = clean(env.get("OPIK_URL_OVERRIDE"))
    api_url = normalize_api_url(raw_api_url)
    if raw_api_url and api_url is None:
        return None
    api_url = api_url or DEFAULT_OPIK_API_URL

    normalized_workspace = optional_bounded_label(workspace)
    normalized_project_name = optional_bounded_label(project_name)
    if normalized_workspace is None or normalized_project_name is None:
        return None

    return OpikTracingConfig(
        api_key=api_key,
        workspace=normalized_workspace,
        project_name=normalized_project_name,
        traces_endpoint=f"{api_url.rstrip('/')}/v1/private/otel/v1/traces",
        capture_content=is_true(env.get("OPIK_CAPTURE_CONTENT")),
        environment=normalize_environment(env),
        release=normalize_release(env.get("VERCEL_GIT_COMMIT_SHA")),
    )


def sanitize_livekit_span(
    span: ReadableSpan, capture_content: bool
) -> ReadableSpan:
    allowed_attributes = set(_SAFE_ATTRIBUTES)
    if capture_content:
        allowed_attributes.update(_CONTENT_ATTRIBUTES)

    attributes = {
        key: value
        for key, value in span.attributes.items()
        if key in allowed_attributes
    }
    resource = Resource(
        {
            key: value
            for key, value in span.resource.attributes.items()
            if key in _SAFE_RESOURCE_ATTRIBUTES
        }
    )
    events = tuple(
        sanitize_content_event(event)
        for event in span.events
        if capture_content and event.name in _CONTENT_EVENT_NAMES
    )

    return ReadableSpan(
        name=span.name if span.name in _SAFE_SPAN_NAMES else "livekit_operation",
        context=span.context,
        parent=span.parent,
        resource=resource,
        attributes=attributes,
        events=events,
        links=(),
        kind=span.kind,
        status=Status(span.status.status_code),
        start_time=span.start_time,
        end_time=span.end_time,
        instrumentation_scope=span.instrumentation_scope,
    )


def sanitize_content_event(event: Event) -> Event:
    attributes = event.attributes or {}
    return Event(
        event.name,
        attributes={
            key: value
            for key, value in attributes.items()
            if key in {"content", "role", "name"}
        },
        timestamp=event.timestamp,
    )


def normalize_environment(env: Mapping[str, str]) -> str:
    value = clean(env.get("VERCEL_ENV") or env.get("NODE_ENV")).lower()
    return (
        value
        if value in {"production", "preview", "development", "test"}
        else "unknown"
    )


def normalize_release(value: str | None) -> str | None:
    candidate = clean(value)
    return candidate if re.fullmatch(r"[0-9a-fA-F]{7,64}", candidate) else None


def normalize_service_name(value: str) -> str:
    return bounded_label(value, "meelni-voice-agent")


def bounded_label(value: str, fallback: str) -> str:
    candidate = clean(value)
    return (
        candidate
        if re.fullmatch(r"[a-zA-Z0-9._:/-]{1,120}", candidate)
        else fallback
    )


def optional_bounded_label(value: str) -> str | None:
    candidate = clean(value)
    return (
        candidate
        if re.fullmatch(r"[a-zA-Z0-9._:/-]{1,120}", candidate)
        else None
    )


def normalize_api_url(value: str | None) -> str | None:
    candidate = clean(value)
    if not candidate:
        return None
    parsed = urlparse(candidate)
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        return None
    if parsed.scheme == "https" and parsed.netloc:
        return candidate.rstrip("/")
    if parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}:
        return candidate.rstrip("/")
    return None


def is_true(value: str | None) -> bool:
    return clean(value).lower() == "true"


def normalize_secret(value: str | None) -> str:
    candidate = clean(value)
    return (
        candidate
        if candidate
        and len(candidate) <= 4096
        and "\n" not in candidate
        and "\r" not in candidate
        else ""
    )


def clean(value: str | None) -> str:
    return value.strip() if value else ""
