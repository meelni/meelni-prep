#!/usr/bin/env python3
"""Test script for dynamic prompt system"""

import json
from config import parse_room_metadata
from utils.prompt_builder import build_agent_prompt, get_sample_question


def test_round_type(round_type: str, difficulty: str = "intermediate"):
    """Test a specific round type and difficulty combination"""
    print(f"\n{'='*80}")
    print(f"Testing: {round_type.upper()} ({difficulty})")
    print(f"{'='*80}\n")

    # Create test metadata
    metadata = json.dumps({
        "round_type": round_type,
        "config": {
            "difficulty": difficulty,
            "duration": 30,
            "feedback_mode": "end_only",
        }
    })

    # Parse metadata
    parsed = parse_room_metadata(metadata)
    print(f"Parsed round_type: {parsed['round_type']}")
    print(f"Parsed difficulty: {parsed['config']['difficulty']}")
    print(f"Parsed duration: {parsed['config']['duration']}")
    print(f"Parsed feedback_mode: {parsed['config']['feedback_mode']}")

    # Build prompt
    prompt = build_agent_prompt(parsed["round_type"], parsed["config"])

    # Print first 500 characters of prompt
    print(f"\nPrompt Preview (first 500 chars):")
    print("-" * 80)
    print(prompt[:500])
    print("...")
    print(f"\nTotal prompt length: {len(prompt)} characters")

    # Get sample question
    try:
        question = get_sample_question(round_type)
        print(f"\nSample Question:")
        print(f"  {question}")
    except Exception as e:
        print(f"\nError getting sample question: {e}")


def test_all_configurations():
    """Test all round types and difficulty levels"""
    round_types = ["behavioral", "product_sense", "execution", "strategy"]
    difficulties = ["beginner", "intermediate", "advanced"]

    print("\n" + "=" * 80)
    print("DYNAMIC PROMPT SYSTEM TEST SUITE")
    print("=" * 80)

    # Test each round type with intermediate difficulty
    for round_type in round_types:
        test_round_type(round_type, "intermediate")

    # Test difficulty variations for product_sense
    print(f"\n{'='*80}")
    print("Testing DIFFICULTY VARIATIONS (Product Sense)")
    print(f"{'='*80}\n")

    for difficulty in difficulties:
        test_round_type("product_sense", difficulty)

    # Test feedback modes
    print(f"\n{'='*80}")
    print("Testing FEEDBACK MODES (Behavioral)")
    print(f"{'='*80}\n")

    for feedback_mode in ["end_only", "real_time", "silent"]:
        metadata = json.dumps({
            "round_type": "behavioral",
            "config": {
                "difficulty": "intermediate",
                "duration": 30,
                "feedback_mode": feedback_mode,
            }
        })

        parsed = parse_room_metadata(metadata)
        prompt = build_agent_prompt(parsed["round_type"], parsed["config"])

        print(f"\nFeedback Mode: {feedback_mode}")
        print(f"Prompt contains '{feedback_mode.upper()}':", feedback_mode.upper() in prompt)
        print(f"Prompt length: {len(prompt)} characters")

    # Test error handling
    print(f"\n{'='*80}")
    print("Testing ERROR HANDLING")
    print(f"{'='*80}\n")

    # Test invalid round type
    try:
        metadata = json.dumps({
            "round_type": "invalid_type",
            "config": {"difficulty": "intermediate"}
        })
        parsed = parse_room_metadata(metadata)
        prompt = build_agent_prompt(parsed["round_type"], parsed["config"])
        print("❌ Should have raised ValueError for invalid round type")
    except ValueError as e:
        print(f"✅ Correctly caught invalid round type: {e}")

    # Test malformed metadata
    parsed = parse_room_metadata("not valid json")
    print(f"✅ Malformed metadata handled - fallback round_type: {parsed['round_type']}")

    # Test empty metadata
    parsed = parse_room_metadata("")
    print(f"✅ Empty metadata handled - fallback round_type: {parsed['round_type']}")

    print(f"\n{'='*80}")
    print("TEST SUITE COMPLETE")
    print(f"{'='*80}\n")


if __name__ == "__main__":
    test_all_configurations()
