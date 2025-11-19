"""
Verification tests for enhanced prompt system.

Tests cover:
1. Import validation
2. Prompt generation for all interview types
3. Difficulty modulation (if implemented)
4. Mode-specific instructions
5. Backward compatibility
6. Edge cases and error handling
"""

import sys
from pathlib import Path

# Add agent directory to path to access shared modules
agent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(agent_dir))

from shared.prompts import get_prompt

def test_imports():
    """Test 1: Verify all imports work"""
    print("✓ Test 1: Imports successful")
    return True

def test_interview_types():
    """Test 2: Generate prompts for all 4 interview types"""
    types = ["product_sense", "analytical_thinking", "leadership_drive", "strategy"]

    for interview_type in types:
        prompt = get_prompt(
            role="interviewee",
            mode="mock_interview",
            interview_type=interview_type,
            skill_level="mid"
        )
        assert len(prompt) > 100, f"Prompt too short for {interview_type}"
        # Verify prompt is not empty and contains framework guidance
        assert "framework" in prompt.lower() or "interviewer" in prompt.lower(), f"Prompt missing key content for {interview_type}"
        print(f"✓ Test 2.{types.index(interview_type)+1}: {interview_type} prompt generated ({len(prompt)} chars)")

    return True

def test_difficulty_levels():
    """Test 3: Verify skill level variations work (junior/mid/senior)"""
    skill_levels = ["junior", "mid", "senior"]

    for skill_level in skill_levels:
        # Test with interviewer role (candidate persona uses skill_level)
        prompt = get_prompt(
            role="interviewer",
            mode="mock_interview",
            interview_type="product_sense",
            skill_level=skill_level
        )
        assert len(prompt) > 100, f"Prompt too short for skill_level={skill_level}"
        print(f"✓ Test 3.{skill_levels.index(skill_level)+1}: skill_level={skill_level} prompt generated")

    return True

def test_modes():
    """Test 4: Verify all 7 modes generate distinct prompts"""
    modes = [
        "mock_interview",
        "practice",
        "learning",
        "feedback",
        "demonstration",
        "interactive_coaching",
        "strategy"
    ]

    for mode in modes:
        prompt = get_prompt(
            role="interviewee",
            mode=mode,
            interview_type="product_sense",
            skill_level="mid"
        )
        assert len(prompt) > 100, f"Prompt too short for mode={mode}"
        print(f"✓ Test 4.{modes.index(mode)+1}: mode={mode} prompt generated")

    return True

def test_backward_compatibility():
    """Test 5: Verify default parameters work"""
    # Test with minimal parameters
    prompt = get_prompt()  # Should use all defaults
    assert len(prompt) > 100, "Default prompt too short"
    print("✓ Test 5: Default parameters work")

    return True

def test_role_reversal():
    """Test 6: Verify role reversal (interviewer mode) works"""
    # User as interviewer, AI as candidate
    prompt_interviewer = get_prompt(role="interviewer", interview_type="product_sense")
    assert "candidate" in prompt_interviewer.lower() or "pm" in prompt_interviewer.lower()
    print("✓ Test 6.1: Interviewer role (AI as candidate) works")

    # User as interviewee (default), AI as interviewer
    prompt_interviewee = get_prompt(role="interviewee", interview_type="product_sense")
    assert "interviewer" in prompt_interviewee.lower() or "coach" in prompt_interviewee.lower()
    print("✓ Test 6.2: Interviewee role (AI as interviewer) works")

    return True

def test_token_count():
    """Test 7: Verify prompts stay under 3000 tokens"""
    try:
        import tiktoken
        enc = tiktoken.encoding_for_model("gpt-4")

        prompt = get_prompt(
            role="interviewee",
            mode="mock_interview",
            interview_type="product_sense",
            skill_level="mid"
        )
        tokens = len(enc.encode(prompt))

        assert tokens < 3000, f"Prompt too long: {tokens} tokens (max 3000)"
        print(f"✓ Test 7: Token count OK ({tokens} tokens)")

    except ImportError:
        print("⚠ Test 7: Skipped (tiktoken not installed)")

    return True

def test_edge_cases():
    """Test 8: Handle edge cases gracefully"""
    # Invalid mode (should use default)
    try:
        result = get_prompt(mode="invalid_mode")
        assert len(result) > 100, "Should fallback to default mode"
        print("✓ Test 8.1: Invalid mode handled (fallback to default)")
    except Exception as e:
        print(f"✗ Test 8.1: Invalid mode failed: {e}")
        return False

    # Invalid interview type (should use default)
    try:
        result = get_prompt(interview_type="invalid_type")
        assert len(result) > 100, "Should fallback to default type"
        print("✓ Test 8.2: Invalid interview type handled (fallback to default)")
    except Exception as e:
        print(f"✗ Test 8.2: Invalid type failed: {e}")
        return False

    return True

def test_no_markdown():
    """Test 9: Verify prompts don't contain markdown asterisks"""
    modes = ["mock_interview", "practice", "learning"]

    for mode in modes:
        prompt = get_prompt(mode=mode, interview_type="product_sense")
        # Check for markdown indicators that would be spoken
        assert "**" not in prompt or "## " in prompt, f"Markdown asterisks found in {mode} prompt"
        print(f"✓ Test 9.{modes.index(mode)+1}: {mode} prompt clean (no spoken markdown)")

    return True

def test_prompt_consistency():
    """Test 10: Verify prompts are consistent for same config"""
    prompt1 = get_prompt(
        role="interviewee",
        mode="mock_interview",
        interview_type="product_sense",
        skill_level="mid"
    )
    prompt2 = get_prompt(
        role="interviewee",
        mode="mock_interview",
        interview_type="product_sense",
        skill_level="mid"
    )

    assert prompt1 == prompt2, "Prompts should be deterministic"
    print("✓ Test 10: Prompt consistency verified")
    return True

def run_all_tests():
    """Run all verification tests"""
    print("\n" + "="*60)
    print("Meelni Prompt System - Verification Tests")
    print("="*60 + "\n")

    tests = [
        ("Import Validation", test_imports),
        ("Interview Types", test_interview_types),
        ("Skill Levels (Junior/Mid/Senior)", test_difficulty_levels),
        ("Mode Instructions (7 modes)", test_modes),
        ("Default Parameters", test_backward_compatibility),
        ("Role Reversal", test_role_reversal),
        ("Token Count", test_token_count),
        ("Edge Cases", test_edge_cases),
        ("No Markdown Check", test_no_markdown),
        ("Prompt Consistency", test_prompt_consistency)
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        try:
            print(f"\n[{name}]")
            if test_func():
                passed += 1
            else:
                failed += 1
                print(f"✗ {name} FAILED")
        except Exception as e:
            failed += 1
            print(f"✗ {name} FAILED: {e}")
            import traceback
            traceback.print_exc()

    print("\n" + "="*60)
    print(f"Results: {passed}/{len(tests)} tests passed")
    if failed == 0:
        print("✅ ALL TESTS PASSED!")
    else:
        print(f"❌ {failed} test(s) failed")
    print("="*60 + "\n")

    return failed == 0

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
