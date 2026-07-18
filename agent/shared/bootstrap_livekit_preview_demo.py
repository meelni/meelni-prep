#!/usr/bin/env python3
"""Fail-closed one-time bootstrap for Meelni's Preview demo agent."""

from __future__ import annotations

import json
import os
import re
import shutil
import stat
import subprocess
import tempfile
import tomllib
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Mapping, Sequence


PREVIEW_PROJECT_ALIAS = "meelni-preview"
PREVIEW_PROJECT_ID = "p_16unz4e48is"
PREVIEW_PROJECT_HOST = "meelni-preview-dk7443ua.livekit.cloud"
PREVIEW_INTERVIEW_AGENT_ID = "CA_ZbGxFjfEYwsD"
PREVIEW_DEMO_DISPATCH_NAME = "meelni-preview-demo"
PINNED_LK_VERSION = "lk version 2.12.8"
RECEIPT_VERSION = 1
OPERATION_NAME = "livekit-preview-demo"


class PreviewDemoBootstrapError(RuntimeError):
    """Raised before or after the provider call with a stable redacted code."""

    def __init__(self, code: str, *, failure_stage: str | None = None) -> None:
        super().__init__(code)
        self.failure_stage = failure_stage


def bootstrap_preview_demo(
    *,
    source_env_path: Path,
    operation_root: Path,
    agent_root: Path,
    lk_executable: Path,
    home: Path | None = None,
) -> str:
    agent_root = agent_root.resolve()
    source_env_path = _secure_existing_file(source_env_path, "source_env")
    operation_root = _prepare_operation_root(operation_root, agent_root)
    lk_executable = _secure_executable(lk_executable)
    source_home = (home or Path.home()).expanduser().resolve()
    output_config = operation_root / f"{OPERATION_NAME}.toml"
    receipt_path = operation_root / f"{OPERATION_NAME}-attempt.json"
    openai_key = _read_openai_key(source_env_path)

    with _operation_lock(operation_root):
        with tempfile.TemporaryDirectory(
            prefix=f".{OPERATION_NAME}-", dir=operation_root
        ) as temporary:
            staging = Path(temporary)
            staging.chmod(0o700)
            private = staging / "private"
            private.mkdir(mode=0o700)
            build_context = staging / "build-context"
            _prepare_demo_build_context(agent_root, build_context)
            discovery_env = _base_environment(source_home)
            _verify_cli_version(lk_executable, discovery_env, operation_root)
            credentials = _read_preview_credentials(
                lk_executable, discovery_env, operation_root
            )
            isolated_home = private / "home"
            isolated_home.mkdir(mode=0o700)
            _write_isolated_project_registry(isolated_home, credentials)
            child_env = _provider_environment(isolated_home, credentials)
            before = _agent_inventory(lk_executable, child_env, operation_root)
            if before != {PREVIEW_INTERVIEW_AGENT_ID}:
                return _reconcile_existing(
                    before=before,
                    output_config=output_config,
                    receipt_path=receipt_path,
                )
            if output_config.exists():
                raise PreviewDemoBootstrapError(
                    "livekit_preview_demo_config_without_agent"
                )
            receipt = _read_receipt(receipt_path) if receipt_path.exists() else None
            if receipt and receipt.get("state") == "attempted":
                raise PreviewDemoBootstrapError(
                    "livekit_preview_demo_attempt_pending"
                )
            if receipt and receipt.get("state") == "complete":
                raise PreviewDemoBootstrapError(
                    "livekit_preview_demo_completed_agent_missing"
                )

            secrets_path = private / "demo.env"
            secrets_path.write_text(
                f"LIVEKIT_DEMO_AGENT_NAME={PREVIEW_DEMO_DISPATCH_NAME}\n"
                f"OPENAI_API_KEY={openai_key}\n",
                encoding="utf-8",
            )
            secrets_path.chmod(0o600)
            _write_receipt(receipt_path, state="attempted")
            config_argument = os.path.relpath(output_config, operation_root)

            create_error: PreviewDemoBootstrapError | None = None
            try:
                _run(
                    [
                        str(lk_executable),
                        "--project",
                        PREVIEW_PROJECT_ALIAS,
                        "--config",
                        config_argument,
                        "agent",
                        "create",
                        "--region",
                        "us-east",
                        "--secrets-file",
                        str(secrets_path),
                        "--silent",
                        str(build_context),
                    ],
                    env=child_env,
                    cwd=operation_root,
                    error_code="livekit_preview_demo_create_failed",
                    timeout=1200,
                )
            except PreviewDemoBootstrapError as error:
                create_error = error
                _write_receipt(
                    receipt_path,
                    state="attempted",
                    failure_stage=error.failure_stage or "unknown",
                )

            try:
                after = _agent_inventory(lk_executable, child_env, operation_root)
            except PreviewDemoBootstrapError:
                # The attempted receipt and any CLI-written config remain durable for
                # a later read-only reconciliation; never issue a second create here.
                raise PreviewDemoBootstrapError(
                    "livekit_preview_demo_reconciliation_pending"
                ) from create_error

            new_agents = after - {PREVIEW_INTERVIEW_AGENT_ID}
            if after == {PREVIEW_INTERVIEW_AGENT_ID}:
                raise PreviewDemoBootstrapError(
                    "livekit_preview_demo_reconciliation_pending"
                ) from create_error
            if len(new_agents) != 1 or len(after) != 2:
                raise PreviewDemoBootstrapError(
                    "livekit_preview_demo_postcreate_inventory_mismatch"
                )

            agent_id = next(iter(new_agents))
            _converge_config(output_config, agent_id)
            _write_receipt(receipt_path, state="complete", agent_id=agent_id)
            return agent_id


def _reconcile_existing(
    *, before: set[str], output_config: Path, receipt_path: Path
) -> str:
    if PREVIEW_INTERVIEW_AGENT_ID not in before or len(before) != 2:
        raise PreviewDemoBootstrapError("livekit_preview_agent_inventory_unexpected")
    if not receipt_path.exists():
        raise PreviewDemoBootstrapError("livekit_preview_agent_inventory_unexpected")
    receipt = _read_receipt(receipt_path)
    if receipt.get("state") not in {"attempted", "complete"}:
        raise PreviewDemoBootstrapError("livekit_preview_agent_inventory_unexpected")
    new_agents = before - {PREVIEW_INTERVIEW_AGENT_ID}
    if len(new_agents) != 1:
        raise PreviewDemoBootstrapError("livekit_preview_agent_inventory_unexpected")
    agent_id = next(iter(new_agents))
    recorded_id = receipt.get("agent_id")
    if recorded_id and recorded_id != agent_id:
        raise PreviewDemoBootstrapError("livekit_preview_demo_receipt_mismatch")
    _converge_config(output_config, agent_id)
    _write_receipt(receipt_path, state="complete", agent_id=agent_id)
    return agent_id


def _read_openai_key(path: Path) -> str:
    values: list[str] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, raw_value = line.split("=", 1)
        if name.strip() != "OPENAI_API_KEY":
            continue
        value = raw_value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        values.append(value)
    if len(values) != 1 or not re.fullmatch(r"sk-\S{16,}", values[0]):
        raise PreviewDemoBootstrapError("livekit_preview_openai_key_invalid")
    return values[0]


def _secure_existing_file(path: Path, label: str) -> Path:
    expanded = path.expanduser()
    if expanded.is_symlink():
        raise PreviewDemoBootstrapError(f"livekit_preview_{label}_invalid")
    resolved = expanded.resolve(strict=True)
    info = os.lstat(resolved)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
        raise PreviewDemoBootstrapError(f"livekit_preview_{label}_invalid")
    if stat.S_IMODE(info.st_mode) & 0o077:
        raise PreviewDemoBootstrapError(f"livekit_preview_{label}_permissions")
    return resolved


def _secure_executable(path: Path) -> Path:
    resolved = path.expanduser().resolve(strict=True)
    info = os.stat(resolved)
    if (
        not stat.S_ISREG(info.st_mode)
        or info.st_uid not in {0, os.getuid()}
        or stat.S_IMODE(info.st_mode) & 0o022
        or not os.access(resolved, os.X_OK)
    ):
        raise PreviewDemoBootstrapError("livekit_preview_lk_executable_invalid")
    return resolved


def _prepare_operation_root(path: Path, agent_root: Path) -> Path:
    expanded = path.expanduser()
    if expanded.is_symlink():
        raise PreviewDemoBootstrapError("livekit_preview_operation_root_invalid")
    resolved = expanded.resolve()
    if resolved == agent_root or agent_root in resolved.parents:
        raise PreviewDemoBootstrapError("livekit_preview_operation_root_inside_repo")
    if resolved.exists():
        if not resolved.is_dir():
            raise PreviewDemoBootstrapError("livekit_preview_operation_root_invalid")
    else:
        resolved.mkdir(parents=True, mode=0o700)
        resolved.chmod(0o700)
    info = os.stat(resolved)
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise PreviewDemoBootstrapError("livekit_preview_operation_root_permissions")
    return resolved


@contextmanager
def _operation_lock(operation_root: Path) -> Iterator[None]:
    lock_path = operation_root / f".{OPERATION_NAME}.lock"
    try:
        descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as error:
        raise PreviewDemoBootstrapError("livekit_preview_operation_locked") from error
    try:
        os.close(descriptor)
        yield
    finally:
        lock_path.unlink(missing_ok=True)


def _prepare_demo_build_context(agent_root: Path, destination: Path) -> None:
    destination.mkdir(mode=0o700)
    (destination / "demo").mkdir()
    shutil.copyfile(agent_root / "demo" / "Dockerfile", destination / "Dockerfile")
    shutil.copyfile(agent_root / "requirements.txt", destination / "requirements.txt")
    shutil.copyfile(agent_root / "demo" / "agent.py", destination / "demo" / "agent.py")
    shutil.copytree(
        agent_root / "shared",
        destination / "shared",
        ignore=shutil.ignore_patterns(
            "__pycache__", "*.pyc", ".DS_Store", "bootstrap_livekit_preview_demo.py"
        ),
    )
    (destination / ".dockerignore").write_text(
        "__pycache__/\n*.pyc\n", encoding="utf-8"
    )


def _base_environment(home: Path) -> dict[str, str]:
    environment = {
        "HOME": str(home),
        "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
    }
    for name in ("LANG", "LC_ALL", "TMPDIR"):
        if os.environ.get(name):
            environment[name] = os.environ[name]
    return environment


def _provider_environment(
    home: Path, credentials: Mapping[str, str]
) -> dict[str, str]:
    return {
        **_base_environment(home),
        "LIVEKIT_URL": credentials["url"],
        "LIVEKIT_API_KEY": credentials["api_key"],
        "LIVEKIT_API_SECRET": credentials["api_secret"],
    }


def _write_isolated_project_registry(
    home: Path, credentials: Mapping[str, str]
) -> None:
    """Bind non-interactive agent creation to the one validated Preview project."""
    registry_directory = home / ".livekit"
    registry_directory.mkdir(mode=0o700)
    quote = json.dumps
    contents = (
        f"default_project: {quote(PREVIEW_PROJECT_ALIAS)}\n"
        "projects:\n"
        f"  - name: {quote(PREVIEW_PROJECT_ALIAS)}\n"
        f"    project_id: {quote(PREVIEW_PROJECT_ID)}\n"
        f"    url: {quote(credentials['url'])}\n"
        f"    api_key: {quote(credentials['api_key'])}\n"
        f"    api_secret: {quote(credentials['api_secret'])}\n"
    )
    _atomic_private_write(registry_directory / "cli-config.yaml", contents)


def _verify_cli_version(executable: Path, env: Mapping[str, str], cwd: Path) -> None:
    result = _run(
        [str(executable), "--version"],
        env=env,
        cwd=cwd,
        error_code="livekit_preview_lk_version_unreadable",
    )
    if result.stdout.strip() != PINNED_LK_VERSION:
        raise PreviewDemoBootstrapError("livekit_preview_lk_version_mismatch")


def _read_preview_credentials(
    executable: Path, env: Mapping[str, str], cwd: Path
) -> dict[str, str]:
    result = _run(
        [
            str(executable),
            "--project",
            PREVIEW_PROJECT_ALIAS,
            "project",
            "list",
            "--json",
        ],
        env=env,
        cwd=cwd,
        error_code="livekit_preview_project_unreadable",
    )
    try:
        projects = json.loads(result.stdout)
        matches = [
            item for item in projects if item.get("Name") == PREVIEW_PROJECT_ALIAS
        ]
    except (json.JSONDecodeError, TypeError, AttributeError) as error:
        raise PreviewDemoBootstrapError(
            "livekit_preview_project_inventory_invalid"
        ) from error
    if len(matches) != 1:
        raise PreviewDemoBootstrapError("livekit_preview_project_missing")
    project = matches[0]
    if (
        project.get("ProjectId") != PREVIEW_PROJECT_ID
        or project.get("URL") != f"wss://{PREVIEW_PROJECT_HOST}"
        or not isinstance(project.get("APIKey"), str)
        or not project.get("APIKey")
        or not isinstance(project.get("APISecret"), str)
        or not project.get("APISecret")
    ):
        raise PreviewDemoBootstrapError("livekit_preview_project_identity_mismatch")
    return {
        "url": project["URL"],
        "api_key": project["APIKey"],
        "api_secret": project["APISecret"],
    }


def _agent_inventory(
    executable: Path, env: Mapping[str, str], cwd: Path
) -> set[str]:
    result = _run(
        [str(executable), "agent", "list"],
        env=env,
        cwd=cwd,
        error_code="livekit_preview_agent_inventory_unreadable",
    )
    return set(re.findall(r"\bCA_[A-Za-z0-9_-]+\b", result.stdout))


def _converge_config(path: Path, agent_id: str) -> None:
    expected = (
        '[project]\nsubdomain = "meelni-preview-dk7443ua"\n'
        f'[agent]\nid = "{agent_id}"\n'
    )
    if path.exists():
        found_id = _validate_created_config(path)
        if found_id != agent_id:
            raise PreviewDemoBootstrapError("livekit_preview_demo_config_mismatch")
        path.chmod(0o600)
        return
    _atomic_private_write(path, expected)


def _validate_created_config(path: Path) -> str:
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
        subdomain = data["project"]["subdomain"]
        agent_id = data["agent"]["id"]
    except (OSError, KeyError, TypeError, tomllib.TOMLDecodeError) as error:
        raise PreviewDemoBootstrapError(
            "livekit_preview_demo_config_invalid"
        ) from error
    if subdomain != PREVIEW_PROJECT_HOST.removesuffix(".livekit.cloud"):
        raise PreviewDemoBootstrapError("livekit_preview_demo_project_mismatch")
    if not isinstance(agent_id, str) or not re.fullmatch(
        r"CA_[A-Za-z0-9_-]+", agent_id
    ):
        raise PreviewDemoBootstrapError("livekit_preview_demo_agent_id_invalid")
    if agent_id == PREVIEW_INTERVIEW_AGENT_ID:
        raise PreviewDemoBootstrapError("livekit_preview_demo_agent_id_reused")
    return agent_id


def _write_receipt(
    path: Path,
    *,
    state: str,
    agent_id: str | None = None,
    failure_stage: str | None = None,
) -> None:
    payload = {
        "version": RECEIPT_VERSION,
        "operation": OPERATION_NAME,
        "project_alias": PREVIEW_PROJECT_ALIAS,
        "project_id": PREVIEW_PROJECT_ID,
        "project_host": PREVIEW_PROJECT_HOST,
        "dispatch_name": PREVIEW_DEMO_DISPATCH_NAME,
        "state": state,
        **({"agent_id": agent_id} if agent_id else {}),
        **({"failure_stage": failure_stage} if failure_stage else {}),
    }
    _atomic_private_write(path, json.dumps(payload, sort_keys=True) + "\n")


def _read_receipt(path: Path) -> dict[str, object]:
    _secure_existing_file(path, "receipt")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise PreviewDemoBootstrapError("livekit_preview_demo_receipt_invalid") from error
    expected = {
        "version": RECEIPT_VERSION,
        "operation": OPERATION_NAME,
        "project_alias": PREVIEW_PROJECT_ALIAS,
        "project_id": PREVIEW_PROJECT_ID,
        "project_host": PREVIEW_PROJECT_HOST,
        "dispatch_name": PREVIEW_DEMO_DISPATCH_NAME,
    }
    if not isinstance(payload, dict) or any(
        payload.get(name) != value for name, value in expected.items()
    ):
        raise PreviewDemoBootstrapError("livekit_preview_demo_receipt_invalid")
    if payload.get("state") not in {"attempted", "preflight_failed", "complete"}:
        raise PreviewDemoBootstrapError("livekit_preview_demo_receipt_invalid")
    return payload


def _atomic_private_write(path: Path, contents: str) -> None:
    temporary = path.parent / f".{path.name}.tmp"
    try:
        descriptor = os.open(
            temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600
        )
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(contents)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _run(
    arguments: Sequence[str],
    *,
    env: Mapping[str, str],
    cwd: Path,
    error_code: str,
    timeout: int = 30,
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            list(arguments),
            cwd=cwd,
            env=dict(env),
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.SubprocessError) as error:
        failure_stage = (
            _classify_create_failure(error)
            if error_code == "livekit_preview_demo_create_failed"
            else None
        )
        raise PreviewDemoBootstrapError(
            error_code, failure_stage=failure_stage
        ) from error


def _classify_create_failure(error: BaseException) -> str:
    stderr = getattr(error, "stderr", "") or ""
    if "huh: could not open a new TTY" in stderr:
        return "pre_provider_confirmation"
    if "package livekit-agents version" in stderr or "no agent project detected" in stderr:
        return "pre_provider_validation"
    if "unable to create agent:" in stderr:
        return "create_rpc_rejected"
    if "upload failed" in stderr or "failed to upload" in stderr:
        return "post_registration_upload"
    if "build" in stderr.lower():
        return "post_registration_build"
    return "unknown"


def main(arguments: Sequence[str]) -> int:
    if len(arguments) != 1:
        print(
            "Usage: bootstrap_livekit_preview_demo.py SOURCE_ENV",
            file=os.sys.stderr,
        )
        return 2
    try:
        agent_root = Path(__file__).resolve().parent.parent
        executable = shutil.which("lk")
        if not executable:
            raise PreviewDemoBootstrapError("livekit_preview_lk_executable_missing")
        agent_id = bootstrap_preview_demo(
            source_env_path=Path(arguments[0]),
            operation_root=Path.home() / ".config" / "meelni" / "provider-operations",
            agent_root=agent_root,
            lk_executable=Path(executable),
        )
    except PreviewDemoBootstrapError as error:
        print(str(error), file=os.sys.stderr)
        return 1
    print(agent_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(os.sys.argv[1:]))
