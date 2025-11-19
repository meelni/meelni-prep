#!/usr/bin/env python3
"""Test interview agent can import all required modules"""

import sys
from pathlib import Path

# Add interview directory's parent to path (simulating interview/agent.py behavior)
interview_dir = Path(__file__).parent / "interview"
sys.path.insert(0, str(interview_dir.parent))

print("=" * 80)
print("TESTING INTERVIEW AGENT - Import Verification")
print("=" * 80)
print()

# Test 1: Verify file exists
print("Test 1: Checking interview agent file...")
interview_agent_file = interview_dir / "agent.py"
if interview_agent_file.exists():
    print(f"✅ Interview agent file exists: {interview_agent_file}")
else:
    print(f"❌ Interview agent file not found: {interview_agent_file}")
    sys.exit(1)

# Test 2: Import shared.config (used by interview agent)
print("\nTest 2: Importing shared.config...")
try:
    from shared.config import parse_room_metadata
    print("✅ SUCCESS: shared.config imported")
except Exception as e:
    print(f"❌ FAILED: {e}")
    sys.exit(1)

# Test 3: Import shared.utils.prompt_builder (used by interview agent)
print("\nTest 3: Importing shared.utils.prompt_builder...")
try:
    from shared.utils.prompt_builder import build_agent_prompt
    print("✅ SUCCESS: shared.utils.prompt_builder imported")
except Exception as e:
    print(f"❌ FAILED: {e}")
    sys.exit(1)

# Test 4: Test build_agent_prompt with interview configuration
print("\nTest 4: Testing build_agent_prompt with interview config...")
try:
    config = {
        "role": "interviewee",
        "mode": "mock_interview",
        "difficulty": "intermediate",
        "duration": 30,
        "feedback_mode": "end",
    }

    # Test with a question from question bank
    question = {
        "question_text": "How would you improve Spotify's Discover Weekly?",
        "company": "Spotify",
        "question_type": "Product design/strategy"
    }

    prompt = build_agent_prompt("product_sense", config, question)
    assert len(prompt) > 100, "Prompt too short"
    assert "Spotify" in prompt, "Question context not included in prompt"

    print("✅ SUCCESS: build_agent_prompt() works with question context")
    print(f"   Generated prompt: {len(prompt)} characters")
    print(f"   Includes question: ✅")
except Exception as e:
    print(f"❌ FAILED: {e}")
    sys.exit(1)

# Test 5: Verify interview agent has correct imports in file
print("\nTest 5: Verifying interview agent file structure...")
with open(interview_agent_file, 'r') as f:
    content = f.read()

    checks = {
        'sys.path setup': 'sys.path.insert(0, str(Path(__file__).parent.parent))' in content,
        'config import': 'from shared.config import parse_room_metadata' in content,
        'prompt_builder import': 'from shared.utils.prompt_builder import build_agent_prompt' in content,
    }

    all_passed = True
    for check_name, passed in checks.items():
        if passed:
            print(f"   ✅ {check_name}")
        else:
            print(f"   ❌ {check_name} - MISSING")
            all_passed = False

    if not all_passed:
        sys.exit(1)

print()
print("=" * 80)
print("INTERVIEW AGENT TEST PASSED ✅")
print("=" * 80)
print()
print("The interview agent can successfully import all shared modules")
print("and generate dynamic prompts with question bank integration.")
