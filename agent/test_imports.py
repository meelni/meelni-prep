#!/usr/bin/env python3
"""
Test script to verify all import paths work correctly after reorganization
"""

import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

print("=" * 80)
print("TESTING AGENT REORGANIZATION - IMPORT PATHS")
print("=" * 80)
print()

# Test 1: Import shared.config
print("Test 1: Importing shared.config...")
try:
    from shared.config import parse_room_metadata
    print("✅ SUCCESS: shared.config imported")
except Exception as e:
    print(f"❌ FAILED: {e}")
    sys.exit(1)

# Test 2: Import shared.prompts
print("\nTest 2: Importing shared.prompts...")
try:
    from shared.prompts import get_prompt
    print("✅ SUCCESS: shared.prompts imported")
except Exception as e:
    print(f"❌ FAILED: {e}")
    sys.exit(1)

# Test 3: Import shared.utils.prompt_builder
print("\nTest 3: Importing shared.utils.prompt_builder...")
try:
    from shared.utils.prompt_builder import build_agent_prompt
    print("✅ SUCCESS: shared.utils.prompt_builder imported")
except Exception as e:
    print(f"❌ FAILED: {e}")
    sys.exit(1)

# Test 4: Test build_agent_prompt function
print("\nTest 4: Testing build_agent_prompt function...")
try:
    config = {
        "role": "interviewee",
        "mode": "mock_interview",
        "difficulty": "intermediate",
        "duration": 30,
        "feedback_mode": "end",
    }
    prompt = build_agent_prompt("product_sense", config)
    assert len(prompt) > 100, "Prompt too short"
    print("✅ SUCCESS: build_agent_prompt() works")
    print(f"   Generated prompt: {len(prompt)} characters")
except Exception as e:
    print(f"❌ FAILED: {e}")
    sys.exit(1)

# Test 5: Test get_prompt function
print("\nTest 5: Testing get_prompt function...")
try:
    prompt = get_prompt(
        role="interviewee",
        mode="mock_interview",
        interview_type="product_sense",
        skill_level="mid"
    )
    assert len(prompt) > 100, "Prompt too short"
    print("✅ SUCCESS: get_prompt() works")
    print(f"   Generated prompt: {len(prompt)} characters")
except Exception as e:
    print(f"❌ FAILED: {e}")
    sys.exit(1)

print()
print("=" * 80)
print("ALL TESTS PASSED ✅")
print("=" * 80)
print()
print("The reorganized agent structure is working correctly!")
print("All imports resolve properly and functions execute successfully.")
