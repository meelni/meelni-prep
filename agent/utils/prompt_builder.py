"""Utility to build dynamic prompts based on room metadata"""

from typing import Dict, Any
import sys
import os

# Add parent directory to path to import prompts
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from prompts import get_prompt


def build_agent_prompt(round_type: str, config: Dict[str, Any], question: Dict[str, Any] = None) -> str:
    """
    Build agent system prompt based on round type and configuration.

    Args:
        round_type: One of "behavioral", "product_sense", "execution", "strategy"
        config: Interview configuration dict with:
            - role: "interviewee" | "interviewer"
            - mode: Interview mode (mock_interview, practice, learning, etc.)
            - skill_level: For candidate persona - "junior" | "mid" | "senior"
            - persona: Optional custom persona modifier
            - duration: Interview duration in minutes (optional)
        question: Optional question dict from question bank with:
            - question_text: The interview question to ask
            - company: Company context (e.g., "Dropbox", "Meta")
            - question_type: Type of question (e.g., "Product design/strategy")

    Returns:
        Complete system prompt string

    Raises:
        ValueError: If round_type is not recognized
    """
    # Map old round_type names to new interview_type names
    interview_type_map = {
        "behavioral": "leadership_drive",
        "product_sense": "product_sense",
        "execution": "analytical_thinking",
        "strategy": "strategy",
    }

    interview_type = interview_type_map.get(round_type)
    if not interview_type:
        raise ValueError(f"Unknown round type: {round_type}")

    role = config.get("role", "interviewee")
    mode = config.get("mode", "mock_interview")
    skill_level = config.get("skill_level", "mid")
    duration = config.get("duration", 30)

    # Get base prompt from new prompts.py system
    base_prompt = get_prompt(
        role=role,
        mode=mode,
        interview_type=interview_type,
        skill_level=skill_level
    )

    # IMPORTANT: Add specific question FIRST (before greeting) so LLM sees it early
    question_text = None
    if question:
        # Handle both field name formats (question_text/text, question_type/type)
        question_text = question.get("question_text") or question.get("text")
        company = question.get("company")
        question_type = question.get("question_type") or question.get("type")

        # DEBUG: Log what we received
        print(f"[PROMPT_BUILDER] Received question: {question}")
        print(f"[PROMPT_BUILDER] Extracted text: {question_text[:100] if question_text else 'None'}...")
        print(f"[PROMPT_BUILDER] Company: {company}, Type: {question_type}")

        if question_text:
            base_prompt = "\n\n" + "=" * 80 + "\n" + base_prompt  # Move base prompt DOWN

            # Put question at ABSOLUTE TOP - first thing LLM sees
            question_header = "=" * 80
            question_header += "\n🚨 CRITICAL SYSTEM CONSTRAINT - READ FIRST 🚨"
            question_header += "\n" + "=" * 80
            question_header += f"\n\nYou are LOCKED to this specific interview question. You CANNOT ask any other question."
            question_header += f"\n\nTHE ONLY QUESTION YOU MAY ASK:"
            question_header += f"\n\n    \"{question_text}\""

            # Add company context if available
            if company:
                question_header += f"\n\nCompany Context: Candidate is interviewing at {company}."

            # Add question type context
            if question_type:
                question_header += f"\nQuestion Type: {question_type}"

            question_header += "\n\n" + "=" * 80
            question_header += "\n🚨 CONSTRAINT ENFORCEMENT:"
            question_header += "\n• You are FORBIDDEN from generating your own questions"
            question_header += "\n• You MUST use this exact question (same meaning, same content)"
            question_header += "\n• ALLOWED natural fixes when speaking:"
            question_header += "\n  - Expand abbreviations: 'NSM' → 'North Star Metric', '6mo' → '6 months', 'pls' → 'please'"
            question_header += "\n  - Fix obvious typos: 'teh' → 'the', 'recieve' → 'receive'"
            question_header += "\n  - Natural grammar: 'What will you do?' sounds natural as-is"
            question_header += "\n• FORBIDDEN: Changing the question, rephrasing, or adding/removing concepts"
            question_header += "\n• Keep all company names, product names, and key terms exactly as written"
            question_header += "\n" + "=" * 80

            base_prompt = question_header + "\n" + base_prompt

    # Add opening greeting instruction - CRITICAL: Tell agent to speak first
    mode_name = mode.replace("_", " ").title()
    interview_type_name = interview_type.replace("_", " ").title()

    greeting_instruction = f"""

## CRITICAL - OPENING GREETING:

When the interview session starts, YOU MUST SPEAK FIRST within 2 seconds.

Greet the candidate warmly and set the stage. Keep it brief and natural.

Example opening (adapt to your personality):
"Hey! I'm Meelni, your AI interview coach. Today we're doing a {interview_type_name} interview in {mode_name} mode. I'll ask questions and give you feedback as we go. Sound good? Ready to start?"
"""

    # If we have a specific question, modify the greeting instruction
    if question_text:
        greeting_instruction += f"""
After the greeting, IMMEDIATELY ask the EXACT question specified above (starting with: "{question_text[:50]}...").
DO NOT ask any other question first. DO NOT make up your own question.
"""

    greeting_instruction += """
Requirements for your greeting:
- Mention you're Meelni, the AI interview coach
- State the interview type: """ + interview_type_name + """
- State the mode: """ + mode_name + """
- Set expectations briefly
- Ask if they're ready
- Be warm but direct (no corporate fluff)
- Keep it under 15 seconds

DO NOT wait for them to speak first. YOU initiate the conversation.
"""

    base_prompt += greeting_instruction

    # Add duration context
    base_prompt += f"\n\nInterview Duration: {duration} minutes - pace yourself accordingly."

    # OLD LOCATION: Question was here (moved to top for visibility)
    if False:  # Keeping this section as reference but never executing
        # Handle both field name formats (question_text/text, question_type/type)
        question_text = question.get("question_text") or question.get("text")
        company = question.get("company")
        question_type = question.get("question_type") or question.get("type")

        # DEBUG: Log what we received
        print(f"[PROMPT_BUILDER] Received question: {question}")
        print(f"[PROMPT_BUILDER] Extracted text: {question_text[:100] if question_text else 'None'}...")
        print(f"[PROMPT_BUILDER] Company: {company}, Type: {question_type}")

        base_prompt += "\n\n## INTERVIEW QUESTION FROM QUESTION BANK:"

        # Add company context if available
        if company:
            base_prompt += f"\n\nCompany Context: Imagine the candidate is interviewing at {company}."

        # Add question type context
        if question_type:
            base_prompt += f"\nQuestion Type: {question_type}"

        # Add the actual question - this is the PRIMARY question you must ask
        if question_text:
            base_prompt += f"\n\nYour PRIMARY interview question:\n\"{question_text}\""
            base_prompt += "\n\nIMPORTANT: Use this exact question as the main question in your interview. After your opening, ask this question and guide the candidate through their response using the framework appropriate to this interview type."

    # Add persona modifier if specified (backward compatibility)
    persona = config.get("persona")
    if persona:
        base_prompt += f"\n\nPersona Modifier: {persona}"

    return base_prompt
