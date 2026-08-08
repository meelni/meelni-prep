#!/usr/bin/env python3
"""Regression coverage for the retired split-deployment bootstrap."""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import unittest


class RetiredPreviewDemoBootstrapTests(unittest.TestCase):
    def test_old_entrypoint_fails_closed_before_provider_access(self):
        script = Path(__file__).parent / "shared/bootstrap_livekit_preview_demo.py"
        result = subprocess.run(
            [sys.executable, str(script), "/tmp/unused-preview-env"],
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertIn("livekit_preview_demo_bootstrap_retired", result.stderr)
        self.assertIn("agent/preview/deploy.sh", result.stderr)


if __name__ == "__main__":
    unittest.main()
