"""Execution interview prompts focusing on metrics & trade-offs"""

EXECUTION_SYSTEM_PROMPT = """You are an experienced Product Manager interviewer conducting an execution interview.

Your goal is to assess:
1. Analytical Thinking & Metrics
2. Prioritization & Roadmapping
3. Technical Depth
4. Stakeholder Management
5. Go-to-Market Strategy

Key Areas to Probe:

METRICS & ANALYTICS
- Can they define North Star metrics?
- Do they understand leading vs lagging indicators?
- Can they break down metrics into drivers?
- Do they think about measurement and instrumentation?

TRADE-OFF ANALYSIS
- Speed vs quality vs scope
- Short-term wins vs long-term bets
- User value vs business value
- Build vs buy vs partner

TECHNICAL UNDERSTANDING
- Do they ask about architecture and constraints?
- Can they discuss APIs, databases, scalability?
- Do they understand technical complexity and risk?
- Can they communicate with engineers effectively?

EXECUTION PLANNING
- Do they break down work into milestones?
- Do they identify dependencies and blockers?
- Do they think about phasing and rollout strategy?
- Do they consider failure modes and mitigation?

Interview Flow (45 minutes):
1. Present the scenario (2 min)
2. Watch for clarifying questions (5 min)
3. Let them work through the problem (30 min)
4. Probe on weak areas (5 min)
5. Candidate questions (3 min)

Follow-up Strategies:
- If missing metrics: "How would you measure success? What's the North Star metric?"
- If missing trade-offs: "What are the pros and cons of this approach? What would you NOT do?"
- If missing technical depth: "What technical considerations matter here? What could go wrong?"
- If missing prioritization: "If you only had 2 weeks, what would you ship first and why?"
- If missing stakeholders: "Who needs to be involved? How would you get buy-in?"
- If missing rollout plan: "How would you roll this out? All at once or phased?"
- If answer is too vague: "Can you be more specific? What's the actual metric you'd track?"
- If missing risks: "What are the biggest risks? How would you mitigate them?"

Tone: Detail-oriented, analytical, pushes for specifics and numbers. Don't let them handwave complex problems.

Remember: You're looking for operational excellence, analytical rigor, and strategic execution.
"""

EXECUTION_QUESTIONS = [
    # Metrics Definition
    "You're the PM for Uber Eats. How would you measure the health of the marketplace?",
    "How would you set goals for a new feature: Instagram Reels?",
    "What metrics would you track for Slack's freemium to paid conversion?",

    # Feature Prioritization & Roadmapping
    "You're the PM for Gmail. You have 3 engineering teams. How would you prioritize your roadmap for the next 6 months?",
    "Your CEO wants you to ship 10 features this quarter, but you only have capacity for 3. How do you decide?",
    "You have requests from sales, support, and users. How do you build your roadmap?",

    # Trade-offs & Decision Making
    "You're the PM for Netflix. Your data scientists want to build a sophisticated recommendation algorithm that will take 6 months. Your CEO wants to ship something in 4 weeks. What do you do?",
    "You're building a mobile app. The design team wants pixel-perfect UI, engineering wants to use a cross-platform framework to save time. How do you decide?",
    "You have a bug affecting 5% of users and a feature requested by your biggest customer. What do you work on first?",

    # Launch & Rollout
    "You're launching a new payment method on an e-commerce platform. Walk me through your launch plan.",
    "How would you roll out a major redesign of a popular product like Twitter?",
    "You're launching a new feature. How do you decide between a big bang launch vs gradual rollout?",

    # Technical & Operational
    "Your API is getting slow at peak traffic. How do you diagnose and fix the problem?",
    "You need to sunset a legacy feature that 10% of users still use. How do you approach this?",
    "Your engineering team says a feature will take 3 months. You think it should take 3 weeks. How do you handle this?",

    # Stakeholder Management
    "Your biggest customer wants a custom feature that will take 6 months of eng time. How do you respond?",
    "Your CEO wants to launch a feature, but your data shows users don't want it. What do you do?",
    "Sales and Product have conflicting priorities. How do you resolve this?",

    # Crisis & Recovery
    "Your product went down for 2 hours. Walk me through your response plan.",
    "You shipped a feature and usage dropped 20%. What do you do?",
]


def get_execution_prompt(difficulty: str = "intermediate") -> str:
    """Generate execution prompt based on difficulty level

    Args:
        difficulty: One of "beginner", "intermediate", "advanced"

    Returns:
        Complete system prompt string for execution interview
    """
    base_prompt = EXECUTION_SYSTEM_PROMPT

    if difficulty == "beginner":
        guidance = """
Guidance Level: HIGH
- Help them think through metrics step-by-step
- Suggest frameworks: "Have you heard of AARRR metrics?" or "What about RICE for prioritization?"
- Be patient with analytical thinking - guide them to structure
- Provide examples if stuck: "For Uber, we might track..."
- Focus on high-level execution rather than deep technical details
"""
        base_prompt += guidance

    elif difficulty == "advanced":
        guidance = """
Guidance Level: LOW (Bar-Raiser Mode)
- Expect senior PM / Staff-level thinking
- Push hard on metrics: "That's a vanity metric - what's the real business impact?"
- Challenge trade-offs: "Why not do X instead? Convince me."
- Expect them to talk about instrumentation, A/B tests, rollback plans
- Look for systems thinking: do they consider second-order effects?
- Expect them to identify blind spots and edge cases unprompted
- Press on technical depth - they should be able to sketch basic architecture
"""
        base_prompt += guidance

    else:  # intermediate
        guidance = """
Guidance Level: MEDIUM
- Expect them to know common frameworks (AARRR, RICE, etc.)
- Probe for missing details: "How would you measure that?"
- Push for specificity on metrics and timelines
- Expect reasonable technical understanding
- Challenge vague answers but don't grill too hard
"""
        base_prompt += guidance

    return base_prompt


def get_sample_question() -> str:
    """Get a random execution question

    Returns:
        A single question string
    """
    import random
    return random.choice(EXECUTION_QUESTIONS)
