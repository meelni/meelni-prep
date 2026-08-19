import ast
import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))

from interview.agent import (
    ControlledInterviewAgent,
    InterviewAgent,
    ToolControlledInterviewAgent,
    create_interview_agent,
)
from livekit.agents import ModelSettings, llm
from livekit.agents.voice.generation import perform_llm_inference
import test_interviewer_tools


EXPECTED_TOOLS = {
    "read_interview_state",
    "read_interview_clock",
    "get_probe_candidates",
    "commit_interviewer_move",
    "request_graceful_close",
}


class LiveKitInterviewerToolsTests(unittest.TestCase):
    def make_runtime(self):
        controller, tools, *_ = (
            test_interviewer_tools.InterviewerToolsTests().make_runtime()
        )
        return controller, tools

    def test_public_agent_exposes_exactly_the_five_bounded_tools(self):
        controller, tools = self.make_runtime()
        agent = create_interview_agent(
            instructions="test",
            controller_adapter=controller,
            interviewer_tools=tools,
        )

        self.assertIsInstance(agent, ToolControlledInterviewAgent)
        self.assertEqual({tool.info.name for tool in agent.tools}, EXPECTED_TOOLS)
        for tool in agent.tools:
            self.assertNotIn("chain of thought", tool.info.description.lower())
            self.assertNotIn("transcript search", tool.info.description.lower())

    def test_unavailable_tool_authority_keeps_the_controller_prompt_fallback(self):
        controller, tools = self.make_runtime()
        tools.mark_lifecycle_refresh_unavailable()
        agent = create_interview_agent(
            instructions="test",
            controller_adapter=controller,
            interviewer_tools=tools,
        )

        self.assertNotIsInstance(agent, ToolControlledInterviewAgent)
        self.assertEqual(tuple(agent.tools), ())

    def test_pinned_integration_uses_only_public_livekit_surface_and_step_cap(self):
        source_path = Path(__file__).parent / "interview" / "agent.py"
        source = source_path.read_text(encoding="utf-8")
        tree = ast.parse(source)
        livekit_imports = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.ImportFrom)
            and isinstance(node.module, str)
            and node.module.startswith("livekit.agents")
        ]

        self.assertFalse(
            any(node.module.startswith("livekit.agents.voice") for node in livekit_imports)
        )
        root_names = {
            alias.name
            for node in livekit_imports
            if node.module == "livekit.agents"
            for alias in node.names
        }
        self.assertTrue({"function_tool", "RunContext", "ModelSettings"} <= root_names)
        self.assertIn("max_tool_steps=3", source)

    def test_enabled_tool_turn_requires_a_tool_before_model_speech(self):
        controller, tools, _, _, _, directive = (
            test_interviewer_tools.InterviewerToolsTests().make_runtime()
        )
        agent = create_interview_agent(
            instructions="test",
            controller_adapter=controller,
            interviewer_tools=tools,
        )
        controller.speech_created(handle_id="speech-required", monotonic_ms=1_002)

        class FakeChatContext:
            def __init__(self):
                self.items = [
                    SimpleNamespace(role="user", id="turn-1"),
                    SimpleNamespace(
                        role="system",
                        id=directive.generation_context_id,
                    ),
                ]

            def copy(self):
                copied = FakeChatContext.__new__(FakeChatContext)
                copied.items = list(self.items)
                return copied

            def add_message(self, *, role, content, id=None):
                self.items.append(
                    SimpleNamespace(role=role, content=[content], id=id)
                )

        sentinel = object()
        with (
            patch.object(InterviewAgent, "llm_node", return_value=sentinel) as base,
            patch(
                "shared.interview_controller_adapter._monotonic_ms",
                return_value=1_002,
            ),
        ):
            result = agent.llm_node(
                FakeChatContext(),
                list(agent.tools),
                ModelSettings(tool_choice="auto"),
            )

        self.assertTrue(hasattr(result, "__aiter__"))
        self.assertEqual(base.call_args.args[3].tool_choice, "required")

        self.assertTrue(
            controller.request_tool_fallback(
                handle_id="speech-required",
                monotonic_ms=1_003,
            )
        )
        with (
            patch.object(InterviewAgent, "llm_node", return_value=sentinel) as base,
            patch(
                "shared.interview_controller_adapter._monotonic_ms",
                return_value=1_003,
            ),
        ):
            fallback_result = agent.llm_node(
                FakeChatContext(),
                list(agent.tools),
                ModelSettings(tool_choice="auto"),
            )

        self.assertIs(fallback_result, sentinel)
        fallback_context = base.call_args.args[1]
        self.assertEqual(base.call_args.args[2], [])
        self.assertEqual(base.call_args.args[3].tool_choice, "none")
        self.assertTrue(
            any(
                item.role == "system"
                and item.content[0].startswith("CONTROLLER_FALLBACK ")
                for item in fallback_context.items
                if hasattr(item, "content")
            )
        )

        with patch(
            "shared.interview_controller_adapter._monotonic_ms",
            return_value=1_004,
        ):
            self.assertIsNone(
                agent.llm_node(
                    FakeChatContext(),
                    list(agent.tools),
                    ModelSettings(tool_choice="auto"),
                )
            )

    def test_pinned_mixed_content_never_reaches_pretool_text_channel(self):
        controller, tools, _, _, _, directive = (
            test_interviewer_tools.InterviewerToolsTests().make_runtime()
        )
        agent = create_interview_agent(
            instructions="test",
            controller_adapter=controller,
            interviewer_tools=tools,
        )
        controller.speech_created(handle_id="speech-mixed", monotonic_ms=1_002)

        class FakeChatContext:
            def __init__(self):
                self.items = [
                    SimpleNamespace(role="user", id="turn-1"),
                    SimpleNamespace(role="system", id=directive.generation_context_id),
                ]

            def copy(self):
                copied = FakeChatContext.__new__(FakeChatContext)
                copied.items = list(self.items)
                return copied

        def mixed_stream():
            async def stream():
                yield llm.ChatChunk(
                    id="mixed-response",
                    delta=llm.ChoiceDelta(
                        role="assistant",
                        content="This text must never reach pre-tool TTS.",
                        tool_calls=[
                            llm.FunctionToolCall(
                                name="commit_interviewer_move",
                                arguments="{}",
                                call_id="mixed-call",
                            )
                        ],
                    ),
                )

            return stream()

        async def collect(node):
            task, data = perform_llm_inference(
                node=node,
                chat_ctx=llm.ChatContext.empty(),
                tool_ctx=llm.ToolContext(agent.tools),
                model_settings=ModelSettings(tool_choice="required"),
            )
            await task
            text_chunks = [chunk async for chunk in data.text_ch]
            function_calls = [call async for call in data.function_ch]
            return text_chunks, function_calls

        raw_text, raw_calls = asyncio.run(
            collect(lambda _chat, _tools, _settings: mixed_stream())
        )
        self.assertEqual(raw_text, ["This text must never reach pre-tool TTS."])
        self.assertEqual([call.name for call in raw_calls], ["commit_interviewer_move"])

        with (
            patch.object(InterviewAgent, "llm_node", return_value=mixed_stream()),
            patch(
                "shared.interview_controller_adapter._monotonic_ms",
                return_value=1_002,
            ),
        ):
            fenced_node = agent.llm_node(
                FakeChatContext(),
                list(agent.tools),
                ModelSettings(tool_choice="auto"),
            )

        fenced_text, fenced_calls = asyncio.run(
            collect(lambda _chat, _tools, _settings: fenced_node)
        )
        self.assertEqual(fenced_text, [])
        self.assertEqual(
            [call.name for call in fenced_calls],
            ["commit_interviewer_move"],
        )


if __name__ == "__main__":
    unittest.main()
