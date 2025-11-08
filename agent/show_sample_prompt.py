#!/usr/bin/env python3
"""
Show a sample prompt with greeting for visual inspection
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.prompt_builder import build_agent_prompt

def show_sample_prompt():
    """Display a sample prompt with greeting"""

    config = {
        "role": "interviewee",
        "mode": "mock_interview",
        "skill_level": "mid",
        "difficulty": "intermediate",
        "duration": 30,
    }

    # Sample question from question bank
    question = {
        "question_text": "How would you improve the Facebook Marketplace experience?",
        "company": "Meta",
        "question_type": "Product design/strategy"
    }

    print("\n" + "=" * 100)
    print("SAMPLE AGENT PROMPT WITH GREETING")
    print("Configuration: Product Sense Mock Interview (Intermediate Difficulty)")
    print("=" * 100 + "\n")

    prompt = build_agent_prompt("product_sense", config, question)

    # Show the first 2000 characters to see the greeting
    print(prompt[:2500])
    print("\n[... rest of prompt truncated for brevity ...]\n")

    print("=" * 100)
    print("PROMPT STATISTICS")
    print("=" * 100)
    print(f"Total length: {len(prompt)} characters")
    print(f"Estimated tokens: ~{len(prompt) // 4} tokens")
    print()

if __name__ == "__main__":
    show_sample_prompt()
