#!/usr/bin/env python3
"""Provider-free regressions for adaptive interviewer rollout controls."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from shared.interview_controller_adapter import (  # noqa: E402
    CONTROLLER_FEATURE_ENV,
    create_interview_controller_adapter,
    resolve_controller_runtime_mode,
)
from shared.interview_director import (  # noqa: E402
    DIRECTOR_SHADOW_FEATURE_ENV,
    InterviewDirectorShadowSession,
    resolve_director_shadow_config,
)
from shared.interview_director_influence import (  # noqa: E402
    DIRECTOR_INFLUENCE_FEATURE_ENV,
    DirectorInfluenceGate,
)
from shared.interviewer_observability import (  # noqa: E402
    resolve_interviewer_observability_identity,
)
from shared.interviewer_tools import (  # noqa: E402
    INTERVIEWER_TOOLS_FEATURE_ENV,
    create_session_scoped_interviewer_tools,
)


def disabled_controller(env: dict[str, str]):
    return create_interview_controller_adapter(
        env=env,
        session_id="session-rollout",
        deadline_at=None,
        writer_id="writer-rollout",
        writer_generation=1,
        interview_brief=None,
    )


class AdaptiveInterviewerRolloutTests(unittest.TestCase):
    def test_default_and_malformed_flags_leave_every_runtime_boundary_off(self):
        malformed_values = (None, "", "TRUE", "True", " true", "true ", "1")
        for malformed in malformed_values:
            with self.subTest(value=malformed):
                env = {}
                if malformed is not None:
                    env = {
                        CONTROLLER_FEATURE_ENV: malformed,
                        DIRECTOR_SHADOW_FEATURE_ENV: malformed,
                        DIRECTOR_INFLUENCE_FEATURE_ENV: malformed,
                        INTERVIEWER_TOOLS_FEATURE_ENV: malformed,
                    }
                controller = disabled_controller(env)
                shadow_state_reads = 0

                def state_provider():
                    nonlocal shadow_state_reads
                    shadow_state_reads += 1
                    return None

                shadow = InterviewDirectorShadowSession(
                    config=resolve_director_shadow_config(env),
                    session_id="session-rollout",
                    adapter=None,
                    state_provider=state_provider,
                )
                influence = DirectorInfluenceGate(
                    env=env,
                    session_id="session-rollout",
                    recommendation_store=None,
                )
                tools = create_session_scoped_interviewer_tools(
                    env=env,
                    controller=controller,
                    lifecycle_store=None,
                )

                self.assertEqual(
                    resolve_controller_runtime_mode(controller),
                    "existing_interviewer",
                )
                self.assertFalse(shadow.enabled)
                self.assertEqual(shadow.failure_reason, "flag_disabled")
                self.assertEqual(shadow_state_reads, 0)
                self.assertFalse(influence.enabled)
                self.assertFalse(tools.enabled)
                self.assertEqual(
                    resolve_interviewer_observability_identity(env),
                    ("current-prompt.v1", "current"),
                )

    def test_missing_adapter_blocks_exact_shadow_enablement_without_state_reads(self):
        env = {DIRECTOR_SHADOW_FEATURE_ENV: "true"}
        state_reads = 0

        def state_provider():
            nonlocal state_reads
            state_reads += 1
            return None

        shadow = InterviewDirectorShadowSession(
            config=resolve_director_shadow_config(env),
            session_id="session-rollout",
            adapter=None,
            state_provider=state_provider,
        )
        self.assertFalse(shadow.enabled)
        self.assertEqual(shadow.failure_reason, "adapter_unavailable")
        self.assertEqual(state_reads, 0)
        self.assertIsNone(shadow.store)

    def test_influence_kill_switch_is_read_live_and_revokes_to_safe_cohort(self):
        env = {
            DIRECTOR_SHADOW_FEATURE_ENV: "true",
            DIRECTOR_INFLUENCE_FEATURE_ENV: "true",
        }
        gate = DirectorInfluenceGate(
            env=env,
            session_id="session-rollout",
            recommendation_store=None,
        )
        self.assertTrue(gate.enabled)
        self.assertEqual(
            resolve_interviewer_observability_identity(env),
            ("adaptive-canary.v1", "canary"),
        )

        env[DIRECTOR_INFLUENCE_FEATURE_ENV] = "false"
        self.assertFalse(gate.enabled)
        self.assertEqual(
            resolve_interviewer_observability_identity(env),
            ("director-shadow.v1", "shadow"),
        )

        env.pop(DIRECTOR_SHADOW_FEATURE_ENV)
        self.assertFalse(gate.enabled)
        self.assertEqual(
            resolve_interviewer_observability_identity(env),
            ("current-prompt.v1", "current"),
        )


if __name__ == "__main__":
    unittest.main()
