#!/usr/bin/env python3
"""Provider-free adversarial tests for the first Preview agent deployment."""

from __future__ import annotations

import io
import json
import os
import signal
import stat
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent / "shared"))

from bootstrap_livekit_preview import (  # noqa: E402
    PREVIEW_PROJECT_ALIAS,
    PreviewBootstrapError,
    PreviewBootstrapResult,
    _selected_dockerfile,
    bootstrap_preview_agent,
    main,
)


PREVIEW_URL = "wss://meelni-preview-abc.livekit.cloud"
PRODUCTION_URL = "wss://meelni-production-xyz.livekit.cloud"
AGENT_ID = "CA_PreviewAgent123"


class BootstrapFixture:
    def __init__(self, root: Path, kind: str = "demo") -> None:
        self.root = root.resolve()
        self.repo = self.root / "repo"
        self.agent_root = self.repo / "agent"
        self.operator_root = self.root / "operator"
        (self.agent_root / "demo").mkdir(parents=True)
        (self.agent_root / "interview").mkdir()
        self.operator_root.mkdir()
        os.chmod(self.operator_root, 0o700)
        (self.agent_root / "Dockerfile").write_text("INTERVIEW_DOCKERFILE\n")
        (self.agent_root / "demo" / "Dockerfile").write_text("DEMO_DOCKERFILE\n")
        (self.agent_root / "interview" / "Dockerfile").write_text(
            "INTERVIEW_DOCKERFILE\n"
        )
        self.kind = kind
        self.config_path = self.operator_root / f"{kind}.toml"
        self.secrets_path = self.operator_root / f"{kind}.env"
        self.read_log = self.operator_root / "read.log"
        self.create_log = self.operator_root / "create.log"
        self.dockerfile_log = self.operator_root / "dockerfile.log"
        self.environment_log = self.operator_root / "environment.log"
        self.create_target_log = self.operator_root / "create-target.log"
        self.list_count = self.operator_root / "list-count"
        self.source_home = self.operator_root / "source-home"
        (self.source_home / ".livekit").mkdir(parents=True)
        self.source_registry = self.source_home / ".livekit" / "cli-config.yaml"
        self.source_registry.write_text("source registry before snapshot\n")
        self.source_registry.chmod(0o600)
        self.fake_lk = self.operator_root / "lk"
        self.fake_lk.write_text(self._fake_lk_source())
        self.fake_lk.chmod(0o755)
        self.env = {
            "PATH": os.environ.get("PATH", ""),
            "HOME": str(self.source_home),
            "MEELNI_PREVIEW_LIVEKIT_URL": PREVIEW_URL,
            "MEELNI_PRODUCTION_LIVEKIT_URL": PRODUCTION_URL,
            self.config_env: str(self.config_path),
            self.secrets_env: str(self.secrets_path),
            "FAKE_LK_PROJECTS_JSON": json.dumps(
                [
                    {
                        "Name": PREVIEW_PROJECT_ALIAS,
                        "ProjectId": "p_preview123",
                        "URL": PREVIEW_URL,
                        "APIKey": "API_SHOULD_NEVER_PRINT",
                        "APISecret": "SECRET_SHOULD_NEVER_PRINT",
                    },
                    {
                        "Name": "meelni",
                        "ProjectId": "p_production123",
                        "URL": PRODUCTION_URL,
                        "APIKey": "PROD_API_SHOULD_NEVER_PRINT",
                        "APISecret": "PROD_SECRET_SHOULD_NEVER_PRINT",
                    },
                ]
            ),
            "FAKE_LK_READ_LOG": str(self.read_log),
            "FAKE_LK_CREATE_LOG": str(self.create_log),
            "FAKE_LK_DOCKERFILE_LOG": str(self.dockerfile_log),
            "FAKE_LK_ENVIRONMENT_LOG": str(self.environment_log),
            "FAKE_LK_CREATE_TARGET_LOG": str(self.create_target_log),
            "FAKE_LK_LIST_COUNT": str(self.list_count),
            "FAKE_LK_SOURCE_REGISTRY": str(self.source_registry),
            "FAKE_LK_CREATED_TOML": (
                '[project]\nsubdomain = "meelni-preview-abc"\n'
                f'[agent]\nid = "{AGENT_ID}"\n'
            ),
            "FAKE_LK_CONFIG_PATH": str(self.config_path),
            "FAKE_LK_SECRETS_PATH": str(self.secrets_path),
            "OPENAI_API_KEY": "sk-ambient-must-not-reach-cli",
            "ANTHROPIC_API_KEY": "ambient-must-not-reach-cli",
            "LIVEKIT_API_SECRET": "ambient-must-not-reach-cli",
            "DATABASE_URL": "ambient-must-not-reach-cli",
            "MEELNI_UNKNOWN_CREDENTIAL": "ambient-must-not-reach-cli",
            "SSL_CERT_DIR": "/ambient/trust-root-must-not-reach-cli",
            "SSL_CERT_FILE": "/ambient/trust-root-must-not-reach-cli.pem",
        }
        self.write_valid_secrets()

    @property
    def config_env(self) -> str:
        return f"MEELNI_LIVEKIT_PREVIEW_{self.kind.upper()}_CONFIG"

    @property
    def secrets_env(self) -> str:
        return f"MEELNI_LIVEKIT_PREVIEW_{self.kind.upper()}_SECRETS_FILE"

    @property
    def dispatch_env(self) -> str:
        return (
            "LIVEKIT_DEMO_AGENT_NAME"
            if self.kind == "demo"
            else "LIVEKIT_INTERVIEW_AGENT_NAME"
        )

    @property
    def dispatch_name(self) -> str:
        return f"meelni-preview-{self.kind}"

    def write_valid_secrets(self) -> None:
        self.secrets_path.write_text(
            "MEELNI_ENV_PULL_ENVIRONMENT=preview\n"
            f"MEELNI_PREVIEW_LIVEKIT_URL={PREVIEW_URL}\n"
            f"MEELNI_PRODUCTION_LIVEKIT_URL={PRODUCTION_URL}\n"
            f"{self.dispatch_env}={self.dispatch_name}\n"
            "OPENAI_API_KEY=sk-preview-only-key-1234567890\n"
        )
        self.secrets_path.chmod(0o600)

    def run(self):
        return bootstrap_preview_agent(
            self.kind,
            env=self.env,
            agent_root=self.agent_root,
            lk_executable=self.fake_lk,
            _test_child_environment={
                name: value
                for name, value in self.env.items()
                if name.startswith("FAKE_LK_")
            },
        )

    def create_calls(self) -> list[list[str]]:
        if not self.create_log.exists():
            return []
        return [json.loads(line) for line in self.create_log.read_text().splitlines()]

    def read_calls(self) -> list[list[str]]:
        if not self.read_log.exists():
            return []
        return [json.loads(line) for line in self.read_log.read_text().splitlines()]

    def assert_frozen_create_call(self, testcase: unittest.TestCase) -> None:
        calls = self.create_calls()
        testcase.assertEqual(len(calls), 1)
        arguments = calls[0]
        config_index = arguments.index("--config") + 1
        secrets_index = arguments.index("--secrets-file") + 1
        config_argument = Path(arguments[config_index])
        secrets_path = Path(arguments[secrets_index])
        testcase.assertFalse(config_argument.is_absolute())
        resolved_config = (self.agent_root / config_argument).resolve()
        testcase.assertNotEqual(resolved_config, self.config_path)
        testcase.assertNotEqual(secrets_path, self.secrets_path)
        testcase.assertEqual(resolved_config.parent, secrets_path.parent)
        testcase.assertTrue(
            resolved_config.parent.name.startswith(".meelni-livekit-bootstrap-")
        )
        testcase.assertEqual(
            arguments,
            [
                "--project",
                PREVIEW_PROJECT_ALIAS,
                "--config",
                str(config_argument),
                "agent",
                "create",
                "--region",
                "us-east",
                "--secrets-file",
                str(secrets_path),
                "--silent",
                ".",
            ],
        )

    def create_target(self) -> dict[str, str]:
        return json.loads(self.create_target_log.read_text())

    @staticmethod
    def _fake_lk_source() -> str:
        return f"""#!{sys.executable}
import json
import os
import sys
from pathlib import Path

arguments = sys.argv[1:]
blocked = [
    name
    for name in (
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "LIVEKIT_API_SECRET",
        "DATABASE_URL",
        "MEELNI_UNKNOWN_CREDENTIAL",
        "SSL_CERT_DIR",
        "SSL_CERT_FILE",
    )
    if name in os.environ
]
Path(os.environ["FAKE_LK_ENVIRONMENT_LOG"]).write_text(json.dumps(blocked))
if arguments == ["--version"]:
    print(os.environ.get("FAKE_LK_VERSION", "lk version 2.12.8"))
    raise SystemExit(0)
if arguments == ["--project", "meelni-preview", "project", "list", "--json"]:
    with open(os.environ["FAKE_LK_READ_LOG"], "a", encoding="utf-8") as handle:
        handle.write(json.dumps(arguments) + "\\n")
    count_path = Path(os.environ["FAKE_LK_LIST_COUNT"])
    count = int(count_path.read_text()) if count_path.exists() else 0
    count_path.write_text(str(count + 1))
    if count == 0 and os.environ.get("FAKE_LK_MUTATE_SECRETS_ON_LIST") == "1":
        Path(os.environ["FAKE_LK_SECRETS_PATH"]).write_text("changed\\n")
    if count == 0 and os.environ.get("FAKE_LK_CREATE_CONFIG_ON_LIST") == "1":
        Path(os.environ["FAKE_LK_CONFIG_PATH"]).write_text("raced\\n")
    if count == 0:
        payload = json.loads(os.environ.get("FAKE_LK_PROJECTS_JSON", "[]"))
        if os.environ.get("FAKE_LK_MUTATE_SOURCE_REGISTRY_ON_LIST") == "1":
            Path(os.environ["FAKE_LK_SOURCE_REGISTRY"]).write_text(
                json.dumps({{
                    "default_project": "meelni-preview",
                    "projects": [{{
                        "name": "meelni-preview",
                        "project_id": "p_production123",
                        "url": "{PRODUCTION_URL}",
                        "api_key": "PRODUCTION_KEY",
                        "api_secret": "PRODUCTION_SECRET",
                    }}],
                }})
            )
    else:
        registry = json.loads(
            Path(os.environ["HOME"]).joinpath(".livekit", "cli-config.yaml").read_text()
        )
        payload = [
            {{
                "Name": project["name"],
                "ProjectId": project["project_id"],
                "URL": project["url"],
                "APIKey": project["api_key"],
                "APISecret": project["api_secret"],
            }}
            for project in registry["projects"]
        ]
        if os.environ.get("FAKE_LK_MUTATE_EXTERNAL_SECRETS_ON_BOUND_LIST") == "1":
            Path(os.environ["FAKE_LK_SECRETS_PATH"]).write_text("changed after freeze\\n")
        if os.environ.get("FAKE_LK_RACE_EXTERNAL_CONFIG_ON_BOUND_LIST") == "1":
            Path(os.environ["FAKE_LK_CONFIG_PATH"]).write_text("raced after freeze\\n")
    print(json.dumps(payload))
    raise SystemExit(int(os.environ.get("FAKE_LK_LIST_EXIT", "0")))

with open(os.environ["FAKE_LK_CREATE_LOG"], "a", encoding="utf-8") as handle:
    handle.write(json.dumps(arguments) + "\\n")
if os.environ.get("FAKE_LK_RACE_EXTERNAL_CONFIG_ON_CREATE") == "1":
    Path(os.environ["FAKE_LK_CONFIG_PATH"]).write_text("raced during create\\n")
registry = json.loads(
    Path(os.environ["HOME"]).joinpath(".livekit", "cli-config.yaml").read_text()
)
project = next(item for item in registry["projects"] if item["name"] == "meelni-preview")
secrets_index = arguments.index("--secrets-file") + 1
secrets_text = Path(arguments[secrets_index]).read_text()
Path(os.environ["FAKE_LK_CREATE_TARGET_LOG"]).write_text(
    json.dumps({{
        "project_id": project["project_id"],
        "url": project["url"],
        "validated_secrets_snapshot": (
            "OPENAI_API_KEY=sk-preview-only-key-1234567890" in secrets_text
        ),
    }})
)
Path(os.environ["FAKE_LK_DOCKERFILE_LOG"]).write_text(
    Path.cwd().joinpath("Dockerfile").read_text()
)
exit_code = int(os.environ.get("FAKE_LK_CREATE_EXIT", "0"))
if exit_code == 0:
    config_index = arguments.index("--config") + 1
    Path.cwd().joinpath(arguments[config_index]).write_text(
        os.environ["FAKE_LK_CREATED_TOML"]
    )
raise SystemExit(exit_code)
"""


class LiveKitPreviewBootstrapTests(unittest.TestCase):
    def test_local_denials_invoke_no_livekit_command(self):
        def missing_preview(fixture: BootstrapFixture) -> None:
            fixture.env.pop("MEELNI_PREVIEW_LIVEKIT_URL")

        def same_project(fixture: BootstrapFixture) -> None:
            fixture.env["MEELNI_PREVIEW_LIVEKIT_URL"] = PRODUCTION_URL

        def missing_config_env(fixture: BootstrapFixture) -> None:
            fixture.env.pop(fixture.config_env)

        def relative_config(fixture: BootstrapFixture) -> None:
            fixture.env[fixture.config_env] = "preview.toml"

        def existing_config(fixture: BootstrapFixture) -> None:
            fixture.config_path.write_text("existing")

        def symlink_config(fixture: BootstrapFixture) -> None:
            fixture.config_path.symlink_to(fixture.operator_root / "missing.toml")

        def config_in_repo(fixture: BootstrapFixture) -> None:
            fixture.env[fixture.config_env] = str(fixture.agent_root / "new.toml")

        def missing_secrets_env(fixture: BootstrapFixture) -> None:
            fixture.env.pop(fixture.secrets_env)

        def symlink_secrets(fixture: BootstrapFixture) -> None:
            target = fixture.operator_root / "real.env"
            fixture.secrets_path.rename(target)
            fixture.secrets_path.symlink_to(target)

        def public_secrets(fixture: BootstrapFixture) -> None:
            fixture.secrets_path.chmod(0o644)

        def public_parent(fixture: BootstrapFixture) -> None:
            fixture.operator_root.chmod(0o755)

        def extra_secret(fixture: BootstrapFixture) -> None:
            fixture.secrets_path.write_text(
                fixture.secrets_path.read_text() + "ANTHROPIC_API_KEY=forbidden\n"
            )

        def missing_openai(fixture: BootstrapFixture) -> None:
            fixture.secrets_path.write_text(
                "\n".join(
                    line
                    for line in fixture.secrets_path.read_text().splitlines()
                    if not line.startswith("OPENAI_API_KEY=")
                )
                + "\n"
            )

        def wrong_environment(fixture: BootstrapFixture) -> None:
            fixture.secrets_path.write_text(
                fixture.secrets_path.read_text().replace(
                    "MEELNI_ENV_PULL_ENVIRONMENT=preview",
                    "MEELNI_ENV_PULL_ENVIRONMENT=production",
                )
            )

        def wrong_anchor(fixture: BootstrapFixture) -> None:
            fixture.secrets_path.write_text(
                fixture.secrets_path.read_text().replace(PREVIEW_URL, PRODUCTION_URL, 1)
            )

        def wrong_dispatch(fixture: BootstrapFixture) -> None:
            fixture.secrets_path.write_text(
                fixture.secrets_path.read_text().replace(
                    fixture.dispatch_name, "meelni-preview-wrong"
                )
            )

        def invalid_openai(fixture: BootstrapFixture) -> None:
            fixture.secrets_path.write_text(
                fixture.secrets_path.read_text().replace(
                    "sk-preview-only-key-1234567890", "placeholder"
                )
            )

        def duplicate_name(fixture: BootstrapFixture) -> None:
            fixture.secrets_path.write_text(
                fixture.secrets_path.read_text()
                + "MEELNI_ENV_PULL_ENVIRONMENT=preview\n"
            )

        cases = {
            "missing Preview anchor": missing_preview,
            "same Production and Preview": same_project,
            "missing config env": missing_config_env,
            "relative config": relative_config,
            "existing config": existing_config,
            "symlink config": symlink_config,
            "config inside repo": config_in_repo,
            "missing secrets env": missing_secrets_env,
            "symlink secrets": symlink_secrets,
            "public secrets": public_secrets,
            "public operator directory": public_parent,
            "extra Anthropic secret": extra_secret,
            "missing OpenAI secret": missing_openai,
            "Production marker": wrong_environment,
            "wrong Preview secret anchor": wrong_anchor,
            "wrong dispatch name": wrong_dispatch,
            "invalid OpenAI key": invalid_openai,
            "duplicate secret name": duplicate_name,
        }

        for name, mutate in cases.items():
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                fixture = BootstrapFixture(Path(temp))
                mutate(fixture)
                with self.assertRaises(PreviewBootstrapError):
                    fixture.run()
                self.assertEqual(fixture.read_calls(), [])
                self.assertEqual(fixture.create_calls(), [])

    def test_inventory_denials_never_invoke_agent_create_or_leak_credentials(self):
        cases = {
            "list failure": ("[]", "1"),
            "invalid json": ("not-json", "0"),
            "missing alias": (
                json.dumps(
                    [{"Name": "other", "ProjectId": "p_other", "URL": PREVIEW_URL}]
                ),
                "0",
            ),
            "duplicate alias": (
                json.dumps(
                    [
                        {
                            "Name": PREVIEW_PROJECT_ALIAS,
                            "ProjectId": "p_one",
                            "URL": PREVIEW_URL,
                        },
                        {
                            "Name": PREVIEW_PROJECT_ALIAS,
                            "ProjectId": "p_two",
                            "URL": PREVIEW_URL,
                        },
                    ]
                ),
                "0",
            ),
            "wrong URL": (
                json.dumps(
                    [
                        {
                            "Name": PREVIEW_PROJECT_ALIAS,
                            "ProjectId": "p_preview",
                            "URL": PRODUCTION_URL,
                            "APISecret": "SECRET_SHOULD_NEVER_PRINT",
                        }
                    ]
                ),
                "0",
            ),
            "invalid project ID": (
                json.dumps(
                    [
                        {
                            "Name": PREVIEW_PROJECT_ALIAS,
                            "ProjectId": "not-a-project-id",
                            "URL": PREVIEW_URL,
                        }
                    ]
                ),
                "0",
            ),
            "missing project credentials": (
                json.dumps(
                    [
                        {
                            "Name": PREVIEW_PROJECT_ALIAS,
                            "ProjectId": "p_preview",
                            "URL": PREVIEW_URL,
                        }
                    ]
                ),
                "0",
            ),
            "newline project credential": (
                json.dumps(
                    [
                        {
                            "Name": PREVIEW_PROJECT_ALIAS,
                            "ProjectId": "p_preview",
                            "URL": PREVIEW_URL,
                            "APIKey": "preview-key\nwrong",
                            "APISecret": "preview-secret",
                        }
                    ]
                ),
                "0",
            ),
        }
        for name, (payload, exit_code) in cases.items():
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                fixture = BootstrapFixture(Path(temp))
                fixture.env["FAKE_LK_PROJECTS_JSON"] = payload
                fixture.env["FAKE_LK_LIST_EXIT"] = exit_code
                with self.assertRaises(PreviewBootstrapError) as caught:
                    fixture.run()
                self.assertEqual(fixture.create_calls(), [])
                self.assertNotIn("SECRET_SHOULD_NEVER_PRINT", str(caught.exception))

    def test_inventory_races_are_denied_before_agent_create(self):
        for race in ("FAKE_LK_MUTATE_SECRETS_ON_LIST", "FAKE_LK_CREATE_CONFIG_ON_LIST"):
            with self.subTest(race=race), tempfile.TemporaryDirectory() as temp:
                fixture = BootstrapFixture(Path(temp))
                fixture.env[race] = "1"
                with self.assertRaises(PreviewBootstrapError):
                    fixture.run()
                self.assertEqual(fixture.create_calls(), [])

    def test_unpinned_livekit_cli_is_denied_before_inventory(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = BootstrapFixture(Path(temp))
            fixture.env["FAKE_LK_VERSION"] = "lk version 2.17.0"

            with self.assertRaisesRegex(
                PreviewBootstrapError, "livekit_cli_version_unverified"
            ):
                fixture.run()

            self.assertEqual(fixture.read_calls(), [])
            self.assertEqual(fixture.create_calls(), [])

    def test_interview_success_uses_exact_scoped_create_and_private_config(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = BootstrapFixture(Path(temp), kind="interview")
            before = (fixture.agent_root / "Dockerfile").read_bytes()
            result = fixture.run()
            self.assertEqual(result.agent_id, AGENT_ID)
            self.assertEqual(
                result.next_anchor, "MEELNI_LIVEKIT_PREVIEW_INTERVIEW_AGENT_ID"
            )
            self.assertEqual(
                fixture.read_calls(),
                [
                    ["--project", PREVIEW_PROJECT_ALIAS, "project", "list", "--json"],
                    ["--project", PREVIEW_PROJECT_ALIAS, "project", "list", "--json"],
                ],
            )
            fixture.assert_frozen_create_call(self)
            self.assertEqual(
                fixture.create_target(),
                {
                    "project_id": "p_preview123",
                    "url": PREVIEW_URL,
                    "validated_secrets_snapshot": True,
                },
            )
            self.assertEqual(json.loads(fixture.environment_log.read_text()), [])
            self.assertEqual(
                stat.S_IMODE(os.lstat(fixture.config_path).st_mode), 0o600
            )
            self.assertEqual(
                fixture.config_path.read_text(), fixture.env["FAKE_LK_CREATED_TOML"]
            )
            self.assertEqual(
                list(fixture.operator_root.glob(".meelni-livekit-bootstrap-*")),
                [],
            )
            self.assertEqual((fixture.agent_root / "Dockerfile").read_bytes(), before)
            self.assertFalse(
                (fixture.agent_root / ".livekit-preview-bootstrap.lock").exists()
            )

    def test_registry_alias_change_after_inventory_cannot_retarget_create(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = BootstrapFixture(Path(temp), kind="interview")
            fixture.env["FAKE_LK_MUTATE_SOURCE_REGISTRY_ON_LIST"] = "1"

            result = fixture.run()

            self.assertEqual(result.agent_id, AGENT_ID)
            fixture.assert_frozen_create_call(self)
            self.assertEqual(
                fixture.create_target(),
                {
                    "project_id": "p_preview123",
                    "url": PREVIEW_URL,
                    "validated_secrets_snapshot": True,
                },
            )
            self.assertIn("p_production123", fixture.source_registry.read_text())

    def test_external_secret_change_after_freeze_never_reaches_create(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = BootstrapFixture(Path(temp), kind="interview")
            fixture.env["FAKE_LK_MUTATE_EXTERNAL_SECRETS_ON_BOUND_LIST"] = "1"

            result = fixture.run()

            self.assertEqual(result.agent_id, AGENT_ID)
            fixture.assert_frozen_create_call(self)
            self.assertEqual(
                fixture.secrets_path.read_text(), "changed after freeze\n"
            )
            self.assertTrue(
                fixture.create_target()["validated_secrets_snapshot"]
            )

    def test_external_config_race_before_create_causes_zero_mutation(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = BootstrapFixture(Path(temp), kind="interview")
            fixture.env["FAKE_LK_RACE_EXTERNAL_CONFIG_ON_BOUND_LIST"] = "1"

            with self.assertRaisesRegex(
                PreviewBootstrapError, "livekit_preview_config_already_exists"
            ):
                fixture.run()

            self.assertEqual(fixture.create_calls(), [])
            self.assertEqual(fixture.config_path.read_text(), "raced after freeze\n")

    def test_external_config_race_during_create_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = BootstrapFixture(Path(temp), kind="interview")
            fixture.env["FAKE_LK_RACE_EXTERNAL_CONFIG_ON_CREATE"] = "1"

            with self.assertRaisesRegex(
                PreviewBootstrapError, "livekit_preview_config_install_conflict"
            ):
                fixture.run()

            fixture.assert_frozen_create_call(self)
            self.assertEqual(fixture.config_path.read_text(), "raced during create\n")
            self.assertEqual(
                list(fixture.operator_root.glob(".meelni-livekit-bootstrap-*")),
                [],
            )

    def test_atomic_publish_failure_leaves_operator_target_absent(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = BootstrapFixture(Path(temp), kind="interview")

            with patch(
                "bootstrap_livekit_preview.os.link",
                side_effect=OSError("simulated publish failure"),
            ), self.assertRaisesRegex(
                PreviewBootstrapError, "livekit_preview_config_install_failed"
            ):
                fixture.run()

            fixture.assert_frozen_create_call(self)
            self.assertFalse(fixture.config_path.exists())
            self.assertEqual(
                list(fixture.operator_root.glob(".meelni-livekit-bootstrap-*")),
                [],
            )

    def test_demo_success_swaps_only_during_create_and_restores_everything(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = BootstrapFixture(Path(temp), kind="demo")
            before = (fixture.agent_root / "Dockerfile").read_bytes()
            result = fixture.run()
            self.assertEqual(result.agent_id, AGENT_ID)
            fixture.assert_frozen_create_call(self)
            self.assertEqual(json.loads(fixture.environment_log.read_text()), [])
            self.assertEqual(fixture.dockerfile_log.read_text(), "DEMO_DOCKERFILE\n")
            self.assertEqual((fixture.agent_root / "Dockerfile").read_bytes(), before)
            self.assertEqual(
                list(fixture.agent_root.glob(".Dockerfile.bootstrap-*")), []
            )
            self.assertEqual(
                list(fixture.operator_root.glob(".meelni-livekit-bootstrap-*")),
                [],
            )
            self.assertFalse(
                (fixture.agent_root / ".livekit-preview-bootstrap.lock").exists()
            )

    def test_demo_restores_after_create_and_post_create_failures(self):
        for failure in ("create", "generated config"):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temp:
                fixture = BootstrapFixture(Path(temp), kind="demo")
                before = (fixture.agent_root / "Dockerfile").read_bytes()
                if failure == "create":
                    fixture.env["FAKE_LK_CREATE_EXIT"] = "1"
                else:
                    fixture.env["FAKE_LK_CREATED_TOML"] = (
                        '[project]\nsubdomain = "meelni-preview-abc"\n'
                        '[agent]\nid = "invalid"\n'
                    )
                with self.assertRaises(PreviewBootstrapError):
                    fixture.run()
                self.assertEqual((fixture.agent_root / "Dockerfile").read_bytes(), before)
                self.assertEqual(
                    list(fixture.agent_root.glob(".Dockerfile.bootstrap-*")), []
                )
                self.assertFalse(
                    (fixture.agent_root / ".livekit-preview-bootstrap.lock").exists()
                )

    def test_livekit_commands_have_bounded_timeouts(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = BootstrapFixture(Path(temp), kind="interview")
            with patch(
                "bootstrap_livekit_preview.subprocess.run",
                side_effect=subprocess.TimeoutExpired("lk", 60),
            ) as run:
                with self.assertRaisesRegex(
                    PreviewBootstrapError, "livekit_cli_execution_timed_out"
                ):
                    fixture.run()
            self.assertEqual(run.call_args.kwargs["timeout"], 15)
            self.assertEqual(run.call_args.kwargs["umask"], 0o077)

        with tempfile.TemporaryDirectory() as temp:
            fixture = BootstrapFixture(Path(temp), kind="demo")
            before = (fixture.agent_root / "Dockerfile").read_bytes()
            inventory = subprocess.CompletedProcess(
                args=[],
                returncode=0,
                stdout=fixture.env["FAKE_LK_PROJECTS_JSON"],
                stderr="",
            )
            version = subprocess.CompletedProcess(
                args=[],
                returncode=0,
                stdout="lk version 2.12.8\n",
                stderr="",
            )
            with patch(
                "bootstrap_livekit_preview.subprocess.run",
                side_effect=[
                    version,
                    inventory,
                    inventory,
                    subprocess.TimeoutExpired("lk", 900),
                ],
            ) as run:
                with self.assertRaisesRegex(
                    PreviewBootstrapError, "livekit_cli_execution_timed_out"
                ):
                    fixture.run()
            self.assertEqual(run.call_args.kwargs["timeout"], 900)
            self.assertEqual(run.call_args.kwargs["umask"], 0o077)
            self.assertEqual((fixture.agent_root / "Dockerfile").read_bytes(), before)
            self.assertEqual(
                list(fixture.agent_root.glob(".Dockerfile.bootstrap-*")), []
            )
            self.assertEqual(
                list(fixture.operator_root.glob(".meelni-livekit-bootstrap-*")),
                [],
            )

    def test_demo_dockerfile_restores_on_handled_termination(self):
        with tempfile.TemporaryDirectory() as temp:
            fixture = BootstrapFixture(Path(temp), kind="demo")
            before = (fixture.agent_root / "Dockerfile").read_bytes()
            with self.assertRaisesRegex(
                PreviewBootstrapError, "livekit_preview_bootstrap_interrupted"
            ):
                with _selected_dockerfile("demo", fixture.agent_root):
                    self.assertEqual(
                        (fixture.agent_root / "Dockerfile").read_text(),
                        "DEMO_DOCKERFILE\n",
                    )
                    os.kill(os.getpid(), signal.SIGTERM)
            self.assertEqual((fixture.agent_root / "Dockerfile").read_bytes(), before)
            self.assertEqual(
                list(fixture.agent_root.glob(".Dockerfile.bootstrap-*")), []
            )

    def test_cli_prints_only_safe_agent_id_and_next_anchor(self):
        stdout = io.StringIO()
        stderr = io.StringIO()
        result = PreviewBootstrapResult(
            kind="demo",
            agent_id=AGENT_ID,
            next_anchor="MEELNI_LIVEKIT_PREVIEW_DEMO_AGENT_ID",
        )
        with patch(
            "bootstrap_livekit_preview.bootstrap_preview_agent", return_value=result
        ), redirect_stdout(stdout), redirect_stderr(stderr):
            self.assertEqual(main(["demo"]), 0)
        self.assertEqual(stderr.getvalue(), "")
        self.assertEqual(
            stdout.getvalue(),
            f"Created Preview demo agent {AGENT_ID}.\n"
            f"Set MEELNI_LIVEKIT_PREVIEW_DEMO_AGENT_ID={AGENT_ID}.\n",
        )
        self.assertNotIn("API_SHOULD_NEVER_PRINT", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
