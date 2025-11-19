#!/usr/bin/env python3
"""
Test script to verify the greeting is included in agent prompts
"""

import sys
from pathlib import Path

# Add agent directory to path to access shared modules
agent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(agent_dir))

from shared.utils.prompt_builder import build_agent_prompt

def test_greeting_in_prompt():
    """Test that greeting instruction appears in generated prompts"""

    # Test configuration
    config = {
        "role": "interviewee",
        "mode": "mock_interview",
        "skill_level": "mid",
        "difficulty": "intermediate",
        "duration": 30,
    }

    # Test different interview types
    interview_types = ["product_sense", "execution", "behavioral", "strategy"]

    print("=" * 80)
    print("TESTING AGENT GREETING IMPLEMENTATION")
    print("=" * 80)

    for round_type in interview_types:
        print(f"\n{'=' * 80}")
        print(f"Testing: {round_type.upper()}")
        print(f"{'=' * 80}")

        try:
            prompt = build_agent_prompt(round_type, config)

            # Check for critical greeting components
            has_greeting_section = "## CRITICAL - OPENING GREETING:" in prompt
            has_meelni = "Meelni" in prompt
            has_speak_first = "YOU MUST SPEAK FIRST" in prompt
            has_interview_type = round_type.replace("_", " ").title() in prompt
            has_mode = "Mock Interview" in prompt

            print(f"\nGreeting Check Results:")
            print(f"  ✓ Has greeting section: {has_greeting_section}")
            print(f"  ✓ Mentions Meelni: {has_meelni}")
            print(f"  ✓ Instructs to speak first: {has_speak_first}")
            print(f"  ✓ Includes interview type: {has_interview_type}")
            print(f"  ✓ Includes mode: {has_mode}")

            # Extract and show the greeting section
            if has_greeting_section:
                greeting_start = prompt.find("## CRITICAL - OPENING GREETING:")
                greeting_end = prompt.find("Interview Duration:", greeting_start)
                greeting_section = prompt[greeting_start:greeting_end].strip()

                print(f"\n{'─' * 80}")
                print("GREETING SECTION:")
                print(f"{'─' * 80}")
                print(greeting_section[:500] + "..." if len(greeting_section) > 500 else greeting_section)
                print(f"{'─' * 80}")

            # Overall result
            all_checks_pass = all([
                has_greeting_section,
                has_meelni,
                has_speak_first,
                has_interview_type,
                has_mode
            ])

            if all_checks_pass:
                print(f"\n✅ SUCCESS: All greeting requirements met for {round_type}")
            else:
                print(f"\n❌ FAILURE: Some greeting requirements missing for {round_type}")

        except Exception as e:
            print(f"\n❌ ERROR: Failed to build prompt for {round_type}")
            print(f"   Error: {e}")

    print(f"\n{'=' * 80}")
    print("TEST COMPLETE")
    print(f"{'=' * 80}\n")

if __name__ == "__main__":
    test_greeting_in_prompt()
