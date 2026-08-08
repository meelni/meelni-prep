"""Validated runtime overrides for colocated LiveKit worker processes."""

from __future__ import annotations

from collections.abc import Mapping
import os
import re


WORKER_HTTP_PORT_ENV = "MEELNI_LIVEKIT_WORKER_HTTP_PORT"
WORKER_IDLE_PROCESSES_ENV = "MEELNI_LIVEKIT_WORKER_IDLE_PROCESSES"
MIN_WORKER_HTTP_PORT = 1024
MAX_WORKER_HTTP_PORT = 65535
MAX_IDLE_PROCESSES = 4


def resolve_worker_runtime_options(
    env: Mapping[str, str] | None = None,
) -> dict[str, int]:
    """Return only explicit, validated SDK worker overrides."""
    source = os.environ if env is None else env
    options: dict[str, int] = {}

    if WORKER_HTTP_PORT_ENV in source:
        port = _canonical_integer(source.get(WORKER_HTTP_PORT_ENV), WORKER_HTTP_PORT_ENV)
        if port < MIN_WORKER_HTTP_PORT or port > MAX_WORKER_HTTP_PORT:
            raise RuntimeError("livekit_worker_http_port_invalid")
        options["port"] = port

    if WORKER_IDLE_PROCESSES_ENV in source:
        idle_processes = _canonical_integer(
            source.get(WORKER_IDLE_PROCESSES_ENV),
            WORKER_IDLE_PROCESSES_ENV,
        )
        if idle_processes < 1 or idle_processes > MAX_IDLE_PROCESSES:
            raise RuntimeError("livekit_worker_idle_processes_invalid")
        options["num_idle_processes"] = idle_processes

    return options


def _canonical_integer(value: object, variable: str) -> int:
    if not isinstance(value, str) or not re.fullmatch(r"[1-9][0-9]*", value):
        if variable == WORKER_HTTP_PORT_ENV:
            raise RuntimeError("livekit_worker_http_port_invalid")
        raise RuntimeError("livekit_worker_idle_processes_invalid")
    return int(value)
