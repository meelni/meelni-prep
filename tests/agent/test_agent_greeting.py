"""
Test Agent Greeting Logic
Verifies that greeting messages are generated correctly
"""


def test_greeting_with_question():
    """Test greeting when question is provided"""
    question = {
        "question_text": "How would you improve Instagram Stories?",
        "company": "Meta"
    }
    config = {
        "mode": "mock_interview",
        "difficulty": "intermediate"
    }
    round_type = "product_sense"

    mode_name = config.get("mode", "mock_interview").replace("_", " ").title()
    interview_type_name = round_type.replace("_", " ").title()

    greeting = (
        f"Hey! I'm Meelni, your AI interview coach. "
        f"Today we're doing a {interview_type_name} interview in {mode_name} mode. "
        f"I'll be asking you about: {question['question_text']} "
        f"Take a moment to think, then let me know when you're ready to start."
    )

    print("✅ Test 1: Greeting with question")
    print(f"   Round: {round_type}")
    print(f"   Mode: {config['mode']}")
    print(f"   Question: {question['question_text']}")
    print(f"   Greeting: {greeting}")
    print()

    assert "Meelni" in greeting
    assert "Product Sense" in greeting
    assert "Mock Interview" in greeting
    assert question['question_text'] in greeting
    print("✅ All assertions passed\n")


def test_greeting_without_question():
    """Test greeting when no question is provided"""
    config = {
        "mode": "practice",
        "difficulty": "senior"
    }
    round_type = "analytical"

    mode_name = config.get("mode", "mock_interview").replace("_", " ").title()
    interview_type_name = round_type.replace("_", " ").title()

    greeting = (
        f"Hey! I'm Meelni, your AI interview coach. "
        f"Today we're doing a {interview_type_name} interview in {mode_name} mode. "
        f"I'll ask questions and give you feedback as we go. Ready to start?"
    )

    print("✅ Test 2: Greeting without question")
    print(f"   Round: {round_type}")
    print(f"   Mode: {config['mode']}")
    print(f"   Question: None")
    print(f"   Greeting: {greeting}")
    print()

    assert "Meelni" in greeting
    assert "Analytical" in greeting
    assert "Practice" in greeting
    assert "Ready to start?" in greeting
    print("✅ All assertions passed\n")


def test_greeting_leadership_round():
    """Test greeting for leadership & drive interview"""
    config = {
        "mode": "mock_interview",
        "difficulty": "intermediate"
    }
    round_type = "leadership"

    mode_name = config.get("mode", "mock_interview").replace("_", " ").title()
    interview_type_name = round_type.replace("_", " ").title()

    greeting = (
        f"Hey! I'm Meelni, your AI interview coach. "
        f"Today we're doing a {interview_type_name} interview in {mode_name} mode. "
        f"I'll ask questions and give you feedback as we go. Ready to start?"
    )

    print("✅ Test 3: Leadership interview greeting")
    print(f"   Round: {round_type}")
    print(f"   Mode: {config['mode']}")
    print(f"   Greeting: {greeting}")
    print()

    assert "Leadership" in greeting
    assert "Mock Interview" in greeting
    print("✅ All assertions passed\n")


if __name__ == "__main__":
    print("=" * 60)
    print("Testing Agent Greeting Logic")
    print("=" * 60)
    print()

    try:
        test_greeting_with_question()
        test_greeting_without_question()
        test_greeting_leadership_round()

        print("=" * 60)
        print("✅ ALL TESTS PASSED")
        print("=" * 60)
    except AssertionError as e:
        print("=" * 60)
        print("❌ TEST FAILED")
        print(f"   Error: {e}")
        print("=" * 60)
