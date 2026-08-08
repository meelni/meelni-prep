#!/usr/bin/env python3
"""Fail-together supervisor for Meelni's single-deployment Preview runtime."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).parent.parent))

from shared.dispatch import require_dispatch_name
from shared.worker_runtime import (
    WORKER_HTTP_PORT_ENV,
    WORKER_IDLE_PROCESSES_ENV,
)


PREVIEW_RUNTIME_ENV = "MEELNI_RUNTIME_ENVIRONMENT"
PREVIEW_RUNTIME_VALUE = "preview"
INTERVIEW_PORT = 8081
DEMO_PORT = 8082
IDLE_PROCESSES_PER_WORKER = 1
POLL_INTERVAL_SECONDS = 0.1
SHUTDOWN_TIMEOUT_SECONDS = 20.0


@dataclass(frozen=True)
class ChildSpec:
    label: str
    argv: tuple[str, ...]
    env: dict[str, str]


def build_child_specs(
    env: Mapping[str, str] | None = None,
    *,
    agent_root: Path | None = None,
    python_executable: str | None = None,
) -> tuple[ChildSpec, ChildSpec]:
    """Validate Preview topology and build two isolated worker commands."""
    source = dict(os.environ if env is None else env)
    if source.get(PREVIEW_RUNTIME_ENV) != PREVIEW_RUNTIME_VALUE:
        raise RuntimeError("preview_supervisor_environment_invalid")
    if source.get("LIVEKIT_AGENT_NAME_OVERRIDE"):
        raise RuntimeError("preview_supervisor_agent_name_override_unsupported")

    interview_name = require_dispatch_name("LIVEKIT_INTERVIEW_AGENT_NAME", source)
    demo_name = require_dispatch_name("LIVEKIT_DEMO_AGENT_NAME", source)
    if interview_name == demo_name:
        raise RuntimeError("preview_supervisor_dispatch_names_not_distinct")

    root = (agent_root or Path(__file__).resolve().parents[1]).resolve()
    python = python_executable or sys.executable
    python_path = str(root)
    if source.get("PYTHONPATH"):
        python_path = f"{python_path}{os.pathsep}{source['PYTHONPATH']}"

    def child(label: str, entrypoint: str, port: int) -> ChildSpec:
        child_env = {
            **source,
            "PYTHONPATH": python_path,
            WORKER_HTTP_PORT_ENV: str(port),
            WORKER_IDLE_PROCESSES_ENV: str(IDLE_PROCESSES_PER_WORKER),
        }
        return ChildSpec(
            label=label,
            argv=(python, str(root / entrypoint), "start"),
            env=child_env,
        )

    return (
        child("interview", "interview/agent.py", INTERVIEW_PORT),
        child("demo", "demo/agent.py", DEMO_PORT),
    )


def run_supervisor(
    specs: Sequence[ChildSpec],
    *,
    popen: Callable[..., subprocess.Popen[bytes]] = subprocess.Popen,
    install_signal_handlers: bool = True,
    poll_interval_seconds: float = POLL_INTERVAL_SECONDS,
    shutdown_timeout_seconds: float = SHUTDOWN_TIMEOUT_SECONDS,
) -> int:
    """Run every worker, forwarding shutdown and rejecting partial topology."""
    if len(specs) != 2 or len({spec.label for spec in specs}) != 2:
        raise RuntimeError("preview_supervisor_child_specs_invalid")

    processes: list[subprocess.Popen[bytes]] = []
    received_signal: int | None = None
    previous_handlers: dict[int, object] = {}

    def forward_signal(signum: int, _frame: object) -> None:
        nonlocal received_signal
        received_signal = signum
        _signal_running(processes, signum)

    try:
        if install_signal_handlers:
            for signum in (signal.SIGTERM, signal.SIGINT):
                previous_handlers[signum] = signal.getsignal(signum)
                signal.signal(signum, forward_signal)

        for spec in specs:
            process = popen(spec.argv, env=spec.env)
            processes.append(process)
            print(
                "preview_worker_started"
                f" label={spec.label} pid={process.pid}"
                f" port={spec.env.get(WORKER_HTTP_PORT_ENV, 'unassigned')}",
                flush=True,
            )

        shutdown_deadline: float | None = None
        unexpected_exit_code: int | None = None
        while True:
            statuses = [process.poll() for process in processes]
            if all(status is not None for status in statuses):
                if received_signal is not None:
                    return 0
                if unexpected_exit_code is not None:
                    return unexpected_exit_code if unexpected_exit_code != 0 else 1
                return 1

            if received_signal is not None:
                if shutdown_deadline is None:
                    shutdown_deadline = time.monotonic() + shutdown_timeout_seconds
                elif time.monotonic() >= shutdown_deadline:
                    _kill_running(processes)
            elif unexpected_exit_code is None:
                exited = next((status for status in statuses if status is not None), None)
                if exited is not None:
                    unexpected_exit_code = exited
                    print(
                        f"preview_worker_exited status={exited}; stopping topology",
                        file=sys.stderr,
                        flush=True,
                    )
                    _signal_running(processes, signal.SIGTERM)
                    shutdown_deadline = time.monotonic() + shutdown_timeout_seconds
            elif shutdown_deadline is not None and time.monotonic() >= shutdown_deadline:
                _kill_running(processes)

            time.sleep(poll_interval_seconds)
    except BaseException:
        _signal_running(processes, signal.SIGTERM)
        _wait_then_kill(processes, shutdown_timeout_seconds)
        raise
    finally:
        if install_signal_handlers:
            for signum, handler in previous_handlers.items():
                signal.signal(signum, handler)
        _wait_then_kill(processes, shutdown_timeout_seconds)


def _signal_running(processes: Sequence[subprocess.Popen[bytes]], signum: int) -> None:
    for process in processes:
        if process.poll() is None:
            process.send_signal(signum)


def _kill_running(processes: Sequence[subprocess.Popen[bytes]]) -> None:
    for process in processes:
        if process.poll() is None:
            process.kill()


def _wait_then_kill(
    processes: Sequence[subprocess.Popen[bytes]], timeout_seconds: float
) -> None:
    deadline = time.monotonic() + timeout_seconds
    for process in processes:
        if process.poll() is not None:
            continue
        remaining = max(0.0, deadline - time.monotonic())
        try:
            process.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def main() -> int:
    try:
        return run_supervisor(build_child_specs())
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
