#!/usr/bin/env python3
"""Provider-free tests for the one-time Preview demo bootstrap."""

from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "shared"))

from bootstrap_livekit_preview_demo import (  # noqa: E402
    PREVIEW_INTERVIEW_AGENT_ID,
    PreviewDemoBootstrapError,
    _classify_create_failure,
    bootstrap_preview_demo,
)


DEMO_AGENT_ID = "CA_PreviewDemo123"
PREVIEW_URL = "wss://meelni-preview-dk7443ua.livekit.cloud"


class BootstrapFixture:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.agent_root = root / "repo" / "agent"
        self.home = root / "home"
        self.operator = root / "operator"
        self.source_env = root / "source.env"
        self.output_config = self.operator / "livekit-preview-demo.toml"
        self.receipt = self.operator / "livekit-preview-demo-attempt.json"
        self.state = root / "state.json"
        self.call_log = root / "calls.jsonl"
        self.observation = root / "observation.json"
        self.lk = root / "lk"

        (self.agent_root / "demo").mkdir(parents=True)
        (self.agent_root / "shared").mkdir()
        (self.home / ".livekit").mkdir(parents=True)
        self.operator.mkdir(mode=0o700)
        (self.agent_root / "Dockerfile").write_text("INTERVIEW\n")
        (self.agent_root / "requirements.txt").write_text("dependency\n")
        (self.agent_root / "demo" / "Dockerfile").write_text("DEMO\n")
        (self.agent_root / "demo" / "agent.py").write_text("print('demo')\n")
        (self.agent_root / "shared" / "helper.py").write_text("VALUE = 1\n")
        self.source_env.write_text(
            "UNRELATED_SECRET=must-not-upload\n"
            "OPENAI_API_KEY=sk-preview-openai-1234567890\n"
        )
        self.source_env.chmod(0o600)
        registry = self.home / ".livekit" / "cli-config.yaml"
        registry.write_text("private-registry-production-and-preview\n")
        registry.chmod(0o600)
        self.state.write_text(json.dumps({"agents": [PREVIEW_INTERVIEW_AGENT_ID]}))
        self.lk.write_text(self._fake_lk_source())
        self.lk.chmod(0o755)

    def run(self) -> str:
        return bootstrap_preview_demo(
            source_env_path=self.source_env,
            operation_root=self.operator,
            agent_root=self.agent_root,
            lk_executable=self.lk,
            home=self.home,
        )

    def _fake_lk_source(self) -> str:
        return f"""#!{sys.executable}
import json
import os
import sys
from pathlib import Path

state_path = Path({str(self.state)!r})
call_log = Path({str(self.call_log)!r})
observation = Path({str(self.observation)!r})
arguments = sys.argv[1:]
with call_log.open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(arguments) + "\\n")

if arguments == ["--version"]:
    print("lk version 2.12.8")
    raise SystemExit(0)
if arguments == ["--project", "meelni-preview", "project", "list", "--json"]:
    print(json.dumps([{{
        "Name": "meelni-preview",
        "ProjectId": "p_16unz4e48is",
        "URL": "{PREVIEW_URL}",
        "APIKey": "not-printed-key",
        "APISecret": "not-printed-secret",
    }}]))
    raise SystemExit(0)
if arguments == ["agent", "list"]:
    assert os.environ["LIVEKIT_URL"] == "{PREVIEW_URL}"
    assert os.environ["LIVEKIT_API_KEY"] == "not-printed-key"
    assert os.environ["LIVEKIT_API_SECRET"] == "not-printed-secret"
    for agent_id in json.loads(state_path.read_text())["agents"]:
        print(f"| {{agent_id}} | us-east | version |")
    raise SystemExit(0)
if "agent" in arguments and "create" in arguments:
    assert arguments[:2] == ["--project", "meelni-preview"]
    secrets_path = Path(arguments[arguments.index("--secrets-file") + 1])
    config_argument = Path(arguments[arguments.index("--config") + 1])
    build_context = Path(arguments[-1])
    secrets = secrets_path.read_text()
    context_text = "\\n".join(
        path.read_text(errors="ignore")
        for path in build_context.rglob("*")
        if path.is_file()
    )
    isolated_registry = Path(os.environ["HOME"]) / ".livekit" / "cli-config.yaml"
    registry_text = isolated_registry.read_text()
    observation.write_text(json.dumps({{
        "context_files": sorted(
            str(path.relative_to(build_context))
            for path in build_context.rglob("*")
            if path.is_file()
        ),
        "context_has_no_secrets": (
            "sk-preview-openai" not in context_text
            and "private-registry" not in context_text
            and "UNRELATED_SECRET" not in context_text
        ),
        "demo_dockerfile": build_context.joinpath("Dockerfile").read_text() == "DEMO\\n",
        "dispatch_present": "LIVEKIT_DEMO_AGENT_NAME=meelni-preview-demo" in secrets,
        "openai_present": "OPENAI_API_KEY=sk-preview-openai-1234567890" in secrets,
        "unrelated_absent": "UNRELATED_SECRET" not in secrets,
        "preview_livekit_secret_selected": os.environ.get("LIVEKIT_API_SECRET") == "not-printed-secret",
        "ambient_database_absent": "DATABASE_URL" not in os.environ,
        "home_is_isolated": Path(os.environ["HOME"]) != Path({str(self.home)!r}),
        "registry_is_preview_only": (
            isolated_registry.stat().st_mode & 0o777 == 0o600
            and registry_text.count("project_id:") == 1
            and "p_16unz4e48is" in registry_text
            and "meelni-preview" in registry_text
            and "private-registry-production-and-preview" not in registry_text
        ),
    }}))
    if Path({str(self.root / "fail-before-remote")!r}).exists():
        raise SystemExit(1)
    state_path.write_text(json.dumps({{"agents": [
        "{PREVIEW_INTERVIEW_AGENT_ID}", "{DEMO_AGENT_ID}"
    ]}}))
    if not Path({str(self.root / "skip-config")!r}).exists():
        config_path = Path.cwd() / config_argument
        config_path.write_text(
            '[project]\\nsubdomain = "meelni-preview-dk7443ua"\\n'
            '[agent]\\nid = "{DEMO_AGENT_ID}"\\n'
        )
        config_path.chmod(0o600)
    if Path({str(self.root / "fail-after-remote")!r}).exists():
        raise SystemExit(1)
    raise SystemExit(0)
raise SystemExit(2)
"""


class LiveKitPreviewDemoBootstrapTests(unittest.TestCase):
    def test_classifies_create_failures_without_persisting_provider_text(self):
        cases = {
            "huh: could not open a new TTY": "pre_provider_confirmation",
            "package livekit-agents version ==0.1 is too old": "pre_provider_validation",
            "unable to create agent: plan limit reached": "create_rpc_rejected",
            "multipart upload failed: denied": "post_registration_upload",
            "remote build failed": "post_registration_build",
            "unrecognized provider response": "unknown",
        }
        for stderr, expected in cases.items():
            with self.subTest(expected=expected):
                error = subprocess.CalledProcessError(1, ["lk"], stderr=stderr)
                self.assertEqual(_classify_create_failure(error), expected)

    def test_uses_a_minimal_secret_free_build_context(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = BootstrapFixture(Path(temporary))
            os.environ["LIVEKIT_API_SECRET"] = "ambient-must-not-reach-child"
            os.environ["DATABASE_URL"] = "ambient-database-must-not-reach-child"
            try:
                agent_id = fixture.run()
            finally:
                os.environ.pop("LIVEKIT_API_SECRET", None)
                os.environ.pop("DATABASE_URL", None)

            self.assertEqual(agent_id, DEMO_AGENT_ID)
            self.assertEqual(
                (fixture.agent_root / "Dockerfile").read_text(), "INTERVIEW\n"
            )
            observation = json.loads(fixture.observation.read_text())
            self.assertTrue(observation.pop("context_has_no_secrets"))
            self.assertEqual(
                observation,
                {
                    "context_files": [
                        ".dockerignore",
                        "Dockerfile",
                        "demo/agent.py",
                        "requirements.txt",
                        "shared/helper.py",
                    ],
                    "demo_dockerfile": True,
                    "dispatch_present": True,
                    "openai_present": True,
                    "unrelated_absent": True,
                    "preview_livekit_secret_selected": True,
                    "ambient_database_absent": True,
                    "home_is_isolated": True,
                    "registry_is_preview_only": True,
                },
            )
            self.assertEqual(
                stat.S_IMODE(os.stat(fixture.output_config).st_mode), 0o600
            )
            receipt = json.loads(fixture.receipt.read_text())
            self.assertEqual(receipt["state"], "complete")
            self.assertEqual(receipt["agent_id"], DEMO_AGENT_ID)

    def test_reconciles_remote_success_when_create_reports_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = BootstrapFixture(Path(temporary))
            (fixture.root / "fail-after-remote").touch()
            (fixture.root / "skip-config").touch()
            self.assertEqual(fixture.run(), DEMO_AGENT_ID)
            self.assertIn(DEMO_AGENT_ID, fixture.output_config.read_text())
            self.assertEqual(
                json.loads(fixture.receipt.read_text())["state"], "complete"
            )

    def test_rerun_reconciles_an_attempted_receipt_without_creating_again(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = BootstrapFixture(Path(temporary))
            fixture.state.write_text(
                json.dumps(
                    {"agents": [PREVIEW_INTERVIEW_AGENT_ID, DEMO_AGENT_ID]}
                )
            )
            fixture.receipt.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "operation": "livekit-preview-demo",
                        "project_alias": "meelni-preview",
                        "project_id": "p_16unz4e48is",
                        "project_host": "meelni-preview-dk7443ua.livekit.cloud",
                        "dispatch_name": "meelni-preview-demo",
                        "state": "attempted",
                    }
                )
            )
            fixture.receipt.chmod(0o600)
            self.assertEqual(fixture.run(), DEMO_AGENT_ID)
            calls = [
                json.loads(line) for line in fixture.call_log.read_text().splitlines()
            ]
            self.assertFalse(any("create" in call for call in calls))

    def test_refuses_an_unexpected_existing_agent_without_a_receipt(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = BootstrapFixture(Path(temporary))
            fixture.state.write_text(
                json.dumps(
                    {"agents": [PREVIEW_INTERVIEW_AGENT_ID, "CA_Unexpected"]}
                )
            )
            with self.assertRaisesRegex(
                PreviewDemoBootstrapError,
                "livekit_preview_receipt_invalid|livekit_preview_agent_inventory_unexpected",
            ):
                fixture.run()
            self.assertFalse(fixture.output_config.exists())

    def test_provider_failure_without_visible_remote_agent_blocks_retry(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = BootstrapFixture(Path(temporary))
            marker = fixture.root / "fail-before-remote"
            marker.touch()
            with self.assertRaisesRegex(
                PreviewDemoBootstrapError,
                "livekit_preview_demo_reconciliation_pending",
            ):
                fixture.run()
            self.assertEqual(
                json.loads(fixture.receipt.read_text())["state"],
                "attempted",
            )
            self.assertEqual(
                json.loads(fixture.receipt.read_text())["failure_stage"],
                "unknown",
            )
            marker.unlink()
            with self.assertRaisesRegex(
                PreviewDemoBootstrapError,
                "livekit_preview_demo_attempt_pending",
            ):
                fixture.run()

    def test_only_an_acknowledged_preflight_failure_allows_a_retry(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = BootstrapFixture(Path(temporary))
            base_receipt = {
                "version": 1,
                "operation": "livekit-preview-demo",
                "project_alias": "meelni-preview",
                "project_id": "p_16unz4e48is",
                "project_host": "meelni-preview-dk7443ua.livekit.cloud",
                "dispatch_name": "meelni-preview-demo",
            }
            fixture.receipt.write_text(
                json.dumps({**base_receipt, "state": "preflight_failed"})
            )
            fixture.receipt.chmod(0o600)
            self.assertEqual(fixture.run(), DEMO_AGENT_ID)

            fixture.state.write_text(json.dumps({"agents": [PREVIEW_INTERVIEW_AGENT_ID]}))
            fixture.output_config.unlink()
            fixture.receipt.write_text(
                json.dumps({**base_receipt, "state": "complete"})
            )
            fixture.receipt.chmod(0o600)
            with self.assertRaisesRegex(
                PreviewDemoBootstrapError,
                "livekit_preview_demo_completed_agent_missing",
            ):
                fixture.run()

    def test_refuses_insecure_or_in_repo_operation_paths(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = BootstrapFixture(Path(temporary))
            fixture.source_env.chmod(0o644)
            with self.assertRaisesRegex(
                PreviewDemoBootstrapError,
                "livekit_preview_source_env_permissions",
            ):
                fixture.run()
            fixture.source_env.chmod(0o600)
            with self.assertRaisesRegex(
                PreviewDemoBootstrapError,
                "livekit_preview_operation_root_inside_repo",
            ):
                bootstrap_preview_demo(
                    source_env_path=fixture.source_env,
                    operation_root=fixture.agent_root / "operator",
                    agent_root=fixture.agent_root,
                    lk_executable=fixture.lk,
                    home=fixture.home,
                )


if __name__ == "__main__":
    unittest.main()
