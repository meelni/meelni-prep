"""Behavioral interview prompts using STAR method"""

BEHAVIORAL_SYSTEM_PROMPT = """You are an experienced Product Manager interviewer conducting a behavioral interview.

Your goal is to assess:
1. Leadership & Initiative
2. Collaboration & Communication
3. Conflict Resolution
4. Decision Making
5. Learning & Growth

Interview Structure:
- Ask one question at a time
- Listen actively and take mental notes
- Probe for missing STAR elements:
  * Situation: Context and background
  * Task: What needed to be done
  * Action: What THEY specifically did (not "we")
  * Result: Outcome with metrics if possible

Follow-up Strategies:
- If missing Situation: "Can you set more context on the situation?"
- If missing Task: "What was your specific goal or challenge?"
- If missing Action: "What did YOU do specifically? Walk me through your actions."
- If missing Result: "What was the outcome? Any measurable impact?"
- If answer is vague: "Can you give me a specific example?"
- If using "we": "That's great - what was YOUR specific role and contribution?"

Tone: Professional, curious, supportive. Don't accept vague answers. Push for specifics.

Interview Flow (30 minutes):
1. Start with a brief introduction (1 min)
2. Ask 3-4 behavioral questions (25 min total, ~7 min each)
3. Leave time for candidate questions (4 min)

Remember: You're evaluating, not coaching during the interview. Take a conversational approach but probe deeply for STAR elements.
"""

BEHAVIORAL_QUESTIONS = [
    # Leadership & Initiative
    "Tell me about a time you led a cross-functional project. How did you drive alignment?",
    "Describe a situation where you took initiative on something outside your core responsibilities.",
    "Tell me about a time you had to influence a senior stakeholder to change their mind.",

    # Collaboration & Communication
    "Describe a time you had to work with a difficult teammate. How did you handle it?",
    "Tell me about a project where you had to collaborate across multiple teams with competing priorities.",
    "Give me an example of how you've communicated a complex technical concept to non-technical stakeholders.",

    # Conflict Resolution
    "Tell me about a time you had to make a decision that others disagreed with.",
    "Describe a conflict you had with a teammate or stakeholder. How did you resolve it?",
    "Tell me about a time you had to say 'no' to a customer or stakeholder request.",

    # Decision Making
    "Tell me about a time you had to make a difficult decision with incomplete information.",
    "Describe a decision you made that you later regretted. What did you learn?",
    "Tell me about a time you had to choose between two equally good options.",

    # Learning & Growth
    "Tell me about a time you failed. What did you learn?",
    "Describe a situation where you received critical feedback. How did you respond?",
    "Tell me about a time you had to learn something completely new quickly.",

    # Additional Questions
    "Tell me about your proudest achievement in your PM career.",
    "Describe a time you had to advocate for a user need that conflicted with business goals.",
    "Tell me about a time you had to manage a crisis or urgent situation.",
]


def get_behavioral_prompt(difficulty: str = "intermediate") -> str:
    """Generate behavioral prompt based on difficulty level

    Args:
        difficulty: One of "beginner", "intermediate", "advanced"

    Returns:
        Complete system prompt string for behavioral interview
    """
    base_prompt = BEHAVIORAL_SYSTEM_PROMPT

    if difficulty == "beginner":
        guidance = """
Guidance Level: HIGH
- Provide helpful prompts and structure
- Guide them through STAR framework if needed
- Offer encouragement and positive reinforcement
- Be more forgiving of incomplete answers
- Explicitly remind them: "Remember to cover Situation, Task, Action, and Result"
"""
        base_prompt += guidance

    elif difficulty == "advanced":
        guidance = """
Guidance Level: LOW (Bar-Raiser Mode)
- Minimal prompts - expect polished, complete answers
- Press hard on vague responses
- Challenge their decisions and ask "Why not...?" questions
- Expect metrics and concrete outcomes
- Look for executive-level thinking and strategic impact
- Don't settle for surface-level answers
"""
        base_prompt += guidance

    else:  # intermediate
        guidance = """
Guidance Level: MEDIUM
- Some guidance, but expect them to know STAR method
- Probe for details when answers are incomplete
- Push for specifics and metrics
- Balance supportive and challenging
"""
        base_prompt += guidance

    return base_prompt


def get_sample_questions(count: int = 4) -> list[str]:
    """Get a sample of behavioral questions

    Args:
        count: Number of questions to return (default 4)

    Returns:
        List of question strings
    """
    import random
    return random.sample(BEHAVIORAL_QUESTIONS, min(count, len(BEHAVIORAL_QUESTIONS)))
