# Question Bank API Endpoints

This directory contains API endpoints for managing and fetching interview questions from the question bank.

## Overview

The question bank provides a centralized repository of interview questions that can be dynamically fetched during interview sessions. Requests use the four round keys (`behavioral`, `product_sense`, `execution`, and `strategy`); responses use the canonical labels (`Behavioral`, `Product Sense`, `Execution`, and `Strategy`).

## Prerequisites

These endpoints read the `interview_question` table defined in `/lib/db/schema.ts`.

Expected schema:

```typescript
interviewQuestion = pgTable("interview_question", {
  id: uuid("id").primaryKey().defaultRandom(),
  company: text("company"),
  questionText: text("question_text").notNull(),
  questionType: text("question_type").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

## Endpoints

### 1. GET /api/questions/random

Fetches a random active question, optionally filtered by type.

**Use Case**: Interview sessions use this endpoint to dynamically fetch questions during the conversation.

**Query Parameters**:

- `type` (optional): Filter by question type
  - Values: `behavioral`, `product_sense`, `execution`, `strategy`

**Response** (200 OK):

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "company": "Google",
  "questionText": "How would you improve Google Maps for blind users?",
  "questionType": "Product Sense"
}
```

**Error Responses**:

- `400 Bad Request`: Invalid question type
- `404 Not Found`: No active questions found
- `500 Internal Server Error`: Database error

**Examples**:

```bash
# Random question (any type)
curl http://localhost:3000/api/questions/random

# Random product sense question
curl http://localhost:3000/api/questions/random?type=product_sense

# Random behavioral question
curl http://localhost:3000/api/questions/random?type=behavioral
```

**Frontend Usage**:

```typescript
// In your interview agent or setup page
async function fetchInterviewQuestion(type?: string) {
  const url = type
    ? `/api/questions/random?type=${type}`
    : "/api/questions/random";

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("No questions available for this type");
    }
    throw new Error("Failed to fetch question");
  }

  const question = await response.json();
  return question;
}

// Usage in agent
const question = await fetchInterviewQuestion("product_sense");
// Pass question.questionText to the agent instructions
```

---

### 2. GET /api/questions

Lists all questions with pagination and filtering. This will be used for the admin UI to manage the question bank.

**Use Case**: Admin panel to view, filter, and manage questions.

**Query Parameters**:

- `type` (optional): Filter by question type
  - Values: `behavioral`, `product_sense`, `execution`, `strategy`
- `search` (optional): Case-insensitive text search across the question and company
- `limit` (optional): Results per page (1-500, default: 100)
- `offset` (optional): Number of results to skip (default: 0)
- `activeOnly` (optional): Return only active questions (default: false)
  - Values: `true`, `false`

**Response** (200 OK):

```json
{
  "questions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "company": "Google",
      "questionText": "How would you improve Google Maps?",
      "questionType": "Product Sense",
      "isActive": true,
      "createdAt": "2025-11-06T10:00:00Z"
    },
    {
      "id": "650e8400-e29b-41d4-a716-446655440001",
      "company": null,
      "questionText": "Tell me about a time you dealt with ambiguity.",
      "questionType": "Behavioral",
      "isActive": true,
      "createdAt": "2025-11-06T11:00:00Z"
    }
  ],
  "pagination": {
    "total": 125,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  }
}
```

**Error Responses**:

- `400 Bad Request`: Invalid parameters
- `500 Internal Server Error`: Database error

**Examples**:

```bash
# List all questions (paginated)
curl http://localhost:3000/api/questions

# List product sense questions only
curl http://localhost:3000/api/questions?type=product_sense

# List active questions only
curl http://localhost:3000/api/questions?activeOnly=true

# Search the complete active corpus before pagination
curl 'http://localhost:3000/api/questions?search=pricing&activeOnly=true&limit=20'

# Pagination example (page 2, 50 per page)
curl http://localhost:3000/api/questions?limit=50&offset=50

# Complex filter: Active behavioral questions, 20 per page
curl http://localhost:3000/api/questions?type=behavioral&activeOnly=true&limit=20
```

**Frontend Usage**:

```typescript
// In your admin panel
async function listQuestions(filters: {
  type?: string;
  search?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();

  if (filters.type) params.set("type", filters.type);
  if (filters.search) params.set("search", filters.search);
  if (filters.activeOnly) params.set("activeOnly", "true");
  if (filters.limit) params.set("limit", filters.limit.toString());
  if (filters.offset) params.set("offset", filters.offset.toString());

  const response = await fetch(`/api/questions?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch questions");
  }

  const data = await response.json();
  return data;
}

// Usage
const { questions, pagination } = await listQuestions({
  type: "product_sense",
  activeOnly: true,
  limit: 50,
  offset: 0,
});
```

## Database Helper Functions

Located in `/lib/db/questions.ts`:

### `getRandomQuestion(questionType?)`

Fetches a random active question, optionally filtered by type.

```typescript
import { getRandomQuestion } from "@/lib/db/questions";

const question = await getRandomQuestion("product_sense");
```

### `getQuestions(options)`

Lists questions with pagination, active filtering, and optional round filtering. The row and count queries use the same filters before pagination.

```typescript
import { getQuestions } from "@/lib/db/questions";

const { questions, total } = await getQuestions({
  roundType: "behavioral",
  activeOnly: true,
  limit: 50,
  offset: 0,
});
```

### `getActiveQuestionById(questionId)`

Fetches a specific question by ID.

```typescript
import { getActiveQuestionById } from "@/lib/db/questions";

const question = await getActiveQuestionById(
  "550e8400-e29b-41d4-a716-446655440000"
);
```

### `getActiveQuestionCount(questionType?)`

Gets count of active questions, optionally filtered by type.

```typescript
import { getActiveQuestionCount } from "@/lib/db/questions";

const count = await getActiveQuestionCount("product_sense");
```

## Question Types

All endpoints support the following question types:

- `behavioral`: STAR-method behavioral questions
- `product_sense`: Product design and improvement questions
- `execution`: Execution and prioritization questions
- `strategy`: Strategic thinking questions

## Testing

Once the question bank is populated, you can test the endpoints:

```bash
# Check if random endpoint works
curl http://localhost:3000/api/questions/random

# Should return 404 if no questions exist
# Should return 200 with question data if questions exist

# Check list endpoint
curl http://localhost:3000/api/questions?limit=10

# Should return empty array if no questions exist
# Should return questions array if questions exist
```

## Future Enhancements

1. **Authentication**: Add admin authentication to `/api/questions` endpoint
2. **POST/PUT/DELETE**: Add endpoints for creating, updating, and deleting questions
3. **Search**: Add full-text search capability
4. **Tags**: Add tagging system for better categorization
5. **Difficulty**: Add difficulty levels (junior, mid, senior)
6. **Usage Tracking**: Track which questions are used most frequently

## Integration with Interview Agent

To use these questions in the interview agent (`/agent/agent.py`), fetch a random question at session start:

```python
# In your agent setup
import httpx

async def get_interview_question(question_type: str) -> str:
    """Fetch a random interview question from the API"""
    api_url = f"http://localhost:3000/api/questions/random?type={question_type}"

    async with httpx.AsyncClient() as client:
        response = await client.get(api_url)

        if response.status_code == 200:
            data = response.json()
            return data["questionText"]
        else:
            # Fallback to hardcoded questions
            return "Tell me about a time you improved a product."

# Use in agent instructions
question = await get_interview_question("product_sense")
instructions = f"""You are an interviewer. Ask this question: {question}"""
```

## Notes

- All endpoints use Drizzle ORM for type-safe database queries
- SQL `ORDER BY RANDOM()` is used for random selection (PostgreSQL-specific)
- Questions are soft-deleted (marked as `is_active = false`) rather than hard-deleted
- The `company` field is optional and can be null for generic questions
