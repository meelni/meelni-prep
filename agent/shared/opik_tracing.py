"""Opt-in Opik export for LiveKit traces with a closed privacy boundary."""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from collections import OrderedDict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from shared.prompt_contracts import FULL_INTERVIEW_PROMPT_CONTRACT

DEFAULT_OPIK_API_URL = "https://www.comet.com/opik/api"

logger = logging.getLogger(__name__)

_SAFE_SPAN_NAMES = {
    "agent_session",
    "agent_speaking",
    "agent_turn",
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
    "meelni.interview.brief_contract_version",
    "meelni.interview.brief_resolution",
    "meelni.interview.policy_contract_version",
    "meelni.interview.prompt_contract_version",
    "meelni.interview.round_pack_contract_version",
}

_CONTENT_ATTRIBUTES = {
    "lk.user_input",
    "lk.instructions",
    "lk.response.text",
    "lk.input_text",
    "lk.user_transcript",
}

_OPIK_INPUT_CONTENT_ATTRIBUTES = (
    "lk.user_input",
    "lk.user_transcript",
    "lk.input_text",
)

_OPIK_OUTPUT_CONTENT_ATTRIBUTES = ("lk.response.text",)

_MAX_ACTIVE_CONVERSATIONS = 256
_MAX_CONVERSATION_MESSAGES = 1_000
_MAX_CONVERSATION_CHARACTERS = 500_000

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


def interview_contract_trace_attributes(
    metadata: Mapping[str, Any],
) -> dict[str, str]:
    """Return content-free version markers for the validated room context."""
    resolution = metadata.get("interview_brief_resolution")
    if resolution not in {
        "brief_v2",
        "absent",
        "unsupported_contract",
        "invalid_payload",
    }:
        resolution = "invalid_payload"
    attributes = {
        "meelni.interview.prompt_contract_version":
            FULL_INTERVIEW_PROMPT_CONTRACT.version,
        "meelni.interview.brief_resolution": resolution,
    }
    brief = metadata.get("interview_brief")
    if (
        isinstance(brief, dict)
        and brief.get("contract_version") == "interview-brief.v2"
        and isinstance(brief.get("policy"), dict)
        and brief["policy"].get("contract_version")
        == "full-interview-policy.v1"
        and isinstance(brief.get("round_pack"), dict)
        and brief["round_pack"].get("contract_version") == "pm-round-pack.v1"
    ):
        attributes.update(
            {
                "meelni.interview.brief_contract_version": brief[
                    "contract_version"
                ],
                "meelni.interview.policy_contract_version": brief["policy"][
                    "contract_version"
                ],
                "meelni.interview.round_pack_contract_version": brief[
                    "round_pack"
                ]["contract_version"],
            }
        )
    return attributes


def set_interview_contract_trace_attributes(metadata: Mapping[str, Any]) -> None:
    """Attach only sanitized contract versions to the current runtime span."""
    from opentelemetry import trace

    span = trace.get_current_span()
    for key, value in interview_contract_trace_attributes(metadata).items():
        span.set_attribute(key, value)


@dataclass(frozen=True)
class OpikTracingConfig:
    api_key: str
    workspace: str
    project_name: str
    traces_endpoint: str
    capture_content: bool
    environment: str
    release: str | None


@dataclass
class _ConversationBuffer:
    messages: list[tuple[str, str]]
    character_count: int = 0


class ContentControlledSpanExporter:
    """Sanitize spans and make approved conversation content visible in Opik."""

    def __init__(self, delegate: Any, capture_content: bool) -> None:
        self._delegate = delegate
        self._capture_content = capture_content
        self._conversations: OrderedDict[int, _ConversationBuffer] = OrderedDict()
        self._conversation_lock = threading.Lock()

    def export(self, spans: Sequence[Any]):
        trace_content = (
            self._capture_and_project_trace_content(spans)
            if self._capture_content
            else {}
        )
        sanitized_spans = []
        for span in spans:
            sanitized_span = sanitize_livekit_span(span, self._capture_content)
            trace_id = livekit_trace_id(span)
            content = (
                trace_content.get((trace_id, span.name))
                if trace_id is not None
                else None
            )
            if content is not None:
                sanitized_span = copy_span_with_attributes(
                    sanitized_span,
                    {
                        **sanitized_span.attributes,
                        **content,
                    },
                )
            sanitized_spans.append(sanitized_span)
        sanitized = tuple(sanitized_spans)
        return self._delegate.export(sanitized)

    def shutdown(self) -> None:
        with self._conversation_lock:
            self._conversations.clear()
        self._delegate.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._delegate.force_flush(timeout_millis)

    def _capture_and_project_trace_content(
        self, spans: Sequence[Any]
    ) -> dict[tuple[int, str], dict[str, str]]:
        """Project content because Opik derives trace fields from the root span."""
        trace_content: dict[tuple[int, str], dict[str, str]] = {}
        with self._conversation_lock:
            for span in spans:
                trace_id = livekit_trace_id(span)
                if trace_id is None:
                    continue
                if span.name == "user_turn":
                    self._append_message(
                        trace_id,
                        "user",
                        span.attributes.get("lk.user_transcript"),
                    )
                elif span.name == "agent_turn":
                    self._append_message(
                        trace_id,
                        "user",
                        span.attributes.get("lk.user_input"),
                    )
                    self._append_message(
                        trace_id,
                        "assistant",
                        span.attributes.get("lk.response.text"),
                    )

            content_targets = []
            for span in spans:
                trace_id = livekit_trace_id(span)
                if (
                    span.name not in {"agent_session", "job_entrypoint"}
                    or trace_id is None
                ):
                    continue
                conversation = self._conversations.get(trace_id)
                if conversation is None or not conversation.messages:
                    continue
                content_targets.append((span, trace_id, conversation))

            for span, trace_id, conversation in content_targets:
                messages = [
                    {"role": role, "content": content}
                    for role, content in conversation.messages
                ]
                trace_content[(trace_id, span.name)] = {
                    "input": json.dumps(
                        {"conversation": messages},
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                    **last_assistant_output(conversation.messages),
                }
            for span, trace_id, _ in content_targets:
                if span.parent is None:
                    self._conversations.pop(trace_id, None)
        return trace_content

    def _append_message(self, trace_id: int, role: str, value: Any) -> None:
        if not isinstance(value, str) or not value.strip():
            return
        conversation = self._conversations.get(trace_id)
        if conversation is None:
            conversation = _ConversationBuffer(messages=[])
            self._conversations[trace_id] = conversation
            while len(self._conversations) > _MAX_ACTIVE_CONVERSATIONS:
                self._conversations.popitem(last=False)
        else:
            self._conversations.move_to_end(trace_id)

        message = (role, value)
        if conversation.messages and conversation.messages[-1] == message:
            return
        if len(conversation.messages) >= _MAX_CONVERSATION_MESSAGES:
            return
        if (
            conversation.character_count + len(value)
            > _MAX_CONVERSATION_CHARACTERS
        ):
            return
        conversation.messages.append(message)
        conversation.character_count += len(value)


def setup_opik_tracing(
    service_name: str,
    env: Mapping[str, str] | None = None,
) -> bool:
    """Install the Opik exporter once when all opt-in configuration is present."""
    config = read_opik_tracing_config(env if env is not None else os.environ)
    if config is None:
        logger.info(
            "Opik tracing is disabled or configuration is incomplete for %s",
            normalize_service_name(service_name),
        )
        return False

    try:
        from livekit.agents.telemetry import set_tracer_provider
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        normalized_service_name = normalize_service_name(service_name)
        resource_attributes: dict[str, str] = {
            "service.name": normalized_service_name,
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
        logger.info(
            "Opik tracing enabled for %s (content_capture=%s)",
            normalized_service_name,
            config.capture_content,
        )
        return True
    except Exception:  # noqa: BLE001 - tracing must never take down a voice worker
        # Observability configuration cannot make a voice worker unavailable.
        logger.warning(
            "Opik tracing setup failed for %s; trace export is disabled",
            normalize_service_name(service_name),
        )
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
    span: Any, capture_content: bool
) -> Any:
    allowed_attributes = set(_SAFE_ATTRIBUTES)
    if capture_content:
        allowed_attributes.update(_CONTENT_ATTRIBUTES)

    attributes = {
        key: value
        for key, value in span.attributes.items()
        if key in allowed_attributes
    }
    if capture_content:
        attributes = project_opik_content(attributes)
    resource = type(span.resource)(
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

    return type(span)(
        name=span.name if span.name in _SAFE_SPAN_NAMES else "livekit_operation",
        context=span.context,
        parent=span.parent,
        resource=resource,
        attributes=attributes,
        events=events,
        links=(),
        kind=span.kind,
        status=type(span.status)(span.status.status_code),
        start_time=span.start_time,
        end_time=span.end_time,
        instrumentation_scope=span.instrumentation_scope,
    )


def project_opik_content(attributes: Mapping[str, Any]) -> dict[str, Any]:
    """Add provider-neutral fields that Opik renders as span input/output."""
    projected = dict(attributes)
    input_content = first_nonblank_content(
        attributes, _OPIK_INPUT_CONTENT_ATTRIBUTES
    )
    output_content = first_nonblank_content(
        attributes, _OPIK_OUTPUT_CONTENT_ATTRIBUTES
    )
    if input_content is not None:
        projected["input"] = input_content
    if output_content is not None:
        projected["output"] = output_content
    return projected


def first_nonblank_content(
    attributes: Mapping[str, Any], keys: Sequence[str]
) -> str | None:
    for key in keys:
        value = attributes.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return None


def livekit_trace_id(span: Any) -> int | None:
    trace_id = getattr(getattr(span, "context", None), "trace_id", None)
    return trace_id if isinstance(trace_id, int) and trace_id > 0 else None


def last_assistant_output(messages: Sequence[tuple[str, str]]) -> dict[str, str]:
    for role, content in reversed(messages):
        if role == "assistant":
            return {"output": content}
    return {}


def copy_span_with_attributes(span: Any, attributes: Mapping[str, Any]) -> Any:
    return type(span)(
        name=span.name,
        context=span.context,
        parent=span.parent,
        resource=span.resource,
        attributes=dict(attributes),
        events=span.events,
        links=span.links,
        kind=span.kind,
        status=span.status,
        start_time=span.start_time,
        end_time=span.end_time,
        instrumentation_scope=span.instrumentation_scope,
    )


def sanitize_content_event(event: Any) -> Any:
    attributes = event.attributes or {}
    return type(event)(
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
