# Question Bank Integration - Changes Summary

## Overview

Modified LiveKit agents to accept and use interview questions from the question bank database. Questions are passed via room metadata when starting a session.

---

## Modified Files

### 1. `/agent/config.py` ✅

**Changes:**

- Updated `parse_room_metadata()` to extract `question` field from metadata
- Added question data to returned dictionary
- Updated fallback error handlers to include `question: None`
- Enhanced logging to show question info when provided

**Metadata Structure:**

```json
{
  "round_type": "product_sense",
  "question": {
    "question_id": "uuid",
    "question_text": "How do you improve Slack?",
    "company": "Dropbox",
    "question_type": "Product design/strategy"
  },
  "config": { ... }
}
```

---

### 2. `/agent/utils/prompt_builder.py` ✅

**Changes:**

- Added `question` parameter to `build_agent_prompt()` function
- Question is now optional (defaults to `None`)
- If question provided, appends it to prompt with company context
- Instructs agent to use exact question as PRIMARY interview question
- Maintains backward compatibility - works without question

**Example Prompt Addition:**

```
## INTERVIEW QUESTION FROM QUESTION BANK:

Company Context: Imagine the candidate is interviewing at Dropbox.
Question Type: Product design/strategy

Your PRIMARY interview question:
"How do you improve Slack?"

IMPORTANT: Use this exact question as the main question in your interview.
After your opening, ask this question and guide the candidate through their
response using the framework appropriate to this interview type.
```

---

### 3. `/agent/agent.py` ✅

**Changes:**

- Extract `question` from parsed metadata: `question = metadata.get("question")`
- Added logging for question info (first 60 chars + company)
- Pass `question` to `build_agent_prompt()` function
- Also pass question to fallback prompt if error occurs

**Key Code:**

```python
# Extract question from metadata
question = metadata.get("question")  # NEW

# Log question info if provided
if question:
    question_text = question.get("question_text", "")
    company = question.get("company", "N/A")
    logger.info(f"Question from bank: '{question_text[:60]}...' (Company: {company})")
else:
    logger.info("No specific question provided - agent will generate questions")

# Pass question to prompt builder
instructions = build_agent_prompt(round_type, config, question)  # NEW
```

---

### 4. `/agent/demo_agent.py` ✅

**Changes:**

- Created `build_demo_instructions(question)` function to build dynamic instructions
- If question provided, uses it instead of default demo questions
- Updated `DemoAgent` class to accept instructions parameter
- Modified entrypoint to extract question from metadata
- Added error handling for metadata parsing
- Pass built instructions with question to DemoAgent

**Key Code:**

```python
# Extract question from metadata
try:
    room_metadata = ctx.room.metadata or "{}"
    metadata = json.loads(room_metadata)
    question = metadata.get("question")
except Exception as e:
    logger.error(f"Error extracting question: {e}")
    question = None

# Build instructions with question
instructions = build_demo_instructions(question)

# Pass to agent
await session.start(
    agent=DemoAgent(instructions=instructions),
    room=ctx.room
)
```

---

## How It Works

### For Main Interview Agent (`agent.py`):

1. Frontend creates room with metadata including question
2. Agent parses metadata and extracts question data
3. Question passed to prompt builder
4. Prompt builder adds question to system instructions
5. Agent uses this question as PRIMARY interview question
6. If no question provided, agent generates its own questions (backward compatible)

### For Demo Agent (`demo_agent.py`):

1. Frontend can optionally include question in demo metadata
2. Demo agent extracts question if provided
3. Uses question instead of default demo questions
4. If no question, falls back to hardcoded demo questions
5. Fully backward compatible - works with or without question

---

## Frontend Integration

To use this feature, pass question data in room metadata when creating/dispatching agents:

```typescript
const metadata = {
  round_type: "product_sense",
  question: {
    question_id: "uuid-from-db",
    question_text: "How would you improve Google Maps?",
    company: "Google",
    question_type: "Product design/strategy",
  },
  config: {
    difficulty: "intermediate",
    // ... other config
  },
};

// Create room with metadata
await roomClient.createRoom({
  name: roomName,
  metadata: JSON.stringify(metadata),
});
```

---

## Backward Compatibility

✅ **Fully backward compatible** - all changes are optional:

- If `question` not in metadata → agent generates own questions
- If metadata parsing fails → falls back to defaults
- Existing sessions without questions continue to work normally

---

## Testing Checklist

- [ ] Test with question provided (verify agent uses exact question)
- [ ] Test without question (verify agent generates questions)
- [ ] Test with invalid metadata (verify fallback works)
- [ ] Test demo agent with question
- [ ] Test demo agent without question
- [ ] Verify company context is mentioned when provided
- [ ] Verify question type context is included
- [ ] Check logs for proper question info

---

## Next Steps

1. **Frontend API**: Update session start API to include question from database
2. **Question Selection**: Implement frontend logic to select question from bank
3. **Testing**: Test with real questions from question bank
4. **Deployment**: Deploy updated agents to LiveKit Cloud

---

## Example Questions to Test

```json
{
  "question_text": "How would you improve Instagram Stories?",
  "company": "Meta",
  "question_type": "Product improvement"
}

{
  "question_text": "Design a feature to increase retention on LinkedIn",
  "company": "Microsoft",
  "question_type": "Product design"
}

{
  "question_text": "How would you prioritize features for the next version of Slack?",
  "company": "Salesforce",
  "question_type": "Product strategy"
}
```
