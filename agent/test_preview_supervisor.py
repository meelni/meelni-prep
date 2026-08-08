#!/usr/bin/env python3
"""Tests for the single-deployment Preview worker topology."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(Path(__file__).parent))

from preview.supervisor import (
    DEMO_PORT,
    INTERVIEW_PORT,
    build_child_specs,
    run_supervisor,
    ChildSpec,
)
from shared.worker_runtime import resolve_worker_runtime_options


BASE_ENV = {
    "MEELNI_RUNTIME_ENVIRONMENT": "preview",
    "LIVEKIT_INTERVIEW_AGENT_NAME": "meelni-preview-interview",
    "LIVEKIT_DEMO_AGENT_NAME": "meelni-preview-demo",
}


class PreviewSupervisorTests(unittest.TestCase):
    def test_builds_distinct_workers_with_separate_ports(self):
        root = Path("/tmp/agent-root").resolve()
        interview, demo = build_child_specs(
            BASE_ENV,
            agent_root=root,
            python_executable="/usr/bin/python3",
        )

        self.assertEqual(interview.label, "interview")
        self.assertEqual(demo.label, "demo")
        self.assertEqual(interview.argv[-2:], (str(root / "interview/agent.py"), "start"))
        self.assertEqual(demo.argv[-2:], (str(root / "demo/agent.py"), "start"))
        self.assertEqual(interview.env["MEELNI_LIVEKIT_WORKER_HTTP_PORT"], str(INTERVIEW_PORT))
        self.assertEqual(demo.env["MEELNI_LIVEKIT_WORKER_HTTP_PORT"], str(DEMO_PORT))
        self.assertEqual(interview.env["MEELNI_LIVEKIT_WORKER_IDLE_PROCESSES"], "1")
        self.assertEqual(demo.env["MEELNI_LIVEKIT_WORKER_IDLE_PROCESSES"], "1")

    def test_rejects_non_preview_duplicate_or_overridden_dispatch(self):
        cases = [
            ({**BASE_ENV, "MEELNI_RUNTIME_ENVIRONMENT": "production"}, "preview_supervisor_environment_invalid"),
            ({**BASE_ENV, "LIVEKIT_DEMO_AGENT_NAME": "meelni-preview-interview"}, "preview_supervisor_dispatch_names_not_distinct"),
            ({**BASE_ENV, "LIVEKIT_AGENT_NAME_OVERRIDE": "provider-name"}, "preview_supervisor_agent_name_override_unsupported"),
        ]
        for env, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(RuntimeError, message):
                build_child_specs(env)

    def test_worker_runtime_overrides_are_bounded(self):
        self.assertEqual(
            resolve_worker_runtime_options(
                {
                    "MEELNI_LIVEKIT_WORKER_HTTP_PORT": "8082",
                    "MEELNI_LIVEKIT_WORKER_IDLE_PROCESSES": "1",
                }
            ),
            {"port": 8082, "num_idle_processes": 1},
        )
        for env in (
            {"MEELNI_LIVEKIT_WORKER_HTTP_PORT": ""},
            {"MEELNI_LIVEKIT_WORKER_HTTP_PORT": "80"},
            {"MEELNI_LIVEKIT_WORKER_HTTP_PORT": "1e4"},
            {"MEELNI_LIVEKIT_WORKER_IDLE_PROCESSES": "0"},
            {"MEELNI_LIVEKIT_WORKER_IDLE_PROCESSES": "5"},
        ):
            with self.subTest(env=env), self.assertRaises(RuntimeError):
                resolve_worker_runtime_options(env)

    def test_unexpected_child_exit_terminates_sibling_and_propagates_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            marker = Path(temporary) / "sibling-terminated"
            failing = ChildSpec(
                label="failing",
                argv=(
                    sys.executable,
                    "-c",
                    "import sys,time; time.sleep(0.1); sys.exit(7)",
                ),
                env=dict(os.environ),
            )
            sibling = ChildSpec(
                label="sibling",
                argv=(
                    sys.executable,
                    "-c",
                    (
                        "import pathlib,signal,time; "
                        f"p=pathlib.Path({str(marker)!r}); "
                        "signal.signal(signal.SIGTERM, lambda *_: (p.write_text('terminated'), exit(0))); "
                        "time.sleep(30)"
                    ),
                ),
                env=dict(os.environ),
            )

            started_at = time.monotonic()
            result = run_supervisor(
                (sibling, failing),
                install_signal_handlers=False,
                poll_interval_seconds=0.01,
                shutdown_timeout_seconds=1.0,
            )

            self.assertEqual(result, 7)
            self.assertLess(time.monotonic() - started_at, 2.0)
            self.assertEqual(marker.read_text(), "terminated")


if __name__ == "__main__":
    unittest.main()
