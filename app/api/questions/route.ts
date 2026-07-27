/**
 * Questions List API
 *
 * Retrieves a list of questions from the question bank with optional filtering
 * and pagination. It exposes only the active published collection.
 *
 * @route GET /api/questions
 * @access Public
 *
 * @query {string} type Optional - Filter by question type (behavioral | product_sense | execution | strategy)
 * @query {number} limit Optional - Maximum number of results per page (1-500, default: 100)
 * @query {number} offset Optional - Number of results to skip (default: 0)
 * @query {string} search Optional - Search question text or company
 *
 * @response {Object} response - Questions data with pagination
 * @response.questions {Array<Object>} - Questions with canonical round labels
 * @response.pagination {Object} - Pagination metadata
 * @response.pagination.total {number} - Total number of questions
 * @response.pagination.limit {number} - Limit parameter
 * @response.pagination.offset {number} - Offset parameter
 * @response.pagination.hasMore {boolean} - Whether there are more questions
 *
 * @throws {400} Bad Request - Invalid type or limit out of range
 * @throws {500} Internal Server Error - Database query failed
 *
 * @example
 * // Request (All Product Sense Questions)
 * GET /api/questions?type=product_sense&limit=50
 *
 * // Response (200 OK)
 * {
 *   "questions": [
 *     {
 *       "id": "550e8400-e29b-41d4-a716-446655440000",
 *       "company": "Google",
 *       "questionText": "How would you improve Google Maps?",
 *       "questionType": "Product Sense",
 *       "isActive": true,
 *       "createdAt": "2025-11-06T10:00:00Z",
 *       "updatedAt": "2025-11-06T10:00:00Z"
 *     },
 *     ...
 *   ],
 *   "pagination": {
 *     "total": 125,
 *     "limit": 50,
 *     "offset": 0,
 *     "hasMore": true
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getPublishedQuestions,
  type QuestionListOptions,
  type QuestionBankRecord,
} from "@/lib/db/questions";
import { parseNonNegativeIntegerParam } from "@/lib/utils/pagination";
import { normalizeQuestionRound, QUESTION_ROUND_TYPES } from "@meelni/core";

const MAX_QUESTION_OFFSET = 100_000;

interface QuestionsListRouteDependencies {
  getPublishedQuestions(
    options: QuestionListOptions
  ): Promise<{ questions: QuestionBankRecord[]; total: number }>;
}

const defaultDependencies: QuestionsListRouteDependencies = {
  getPublishedQuestions,
};

export async function GET(req: NextRequest) {
  return handleQuestionsListRequest(req);
}

export async function handleQuestionsListRequest(
  req: NextRequest,
  dependencies: QuestionsListRouteDependencies = defaultDependencies
) {
  try {
    // Parse query parameters
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type");
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");
    const search = searchParams.get("search")?.trim() || undefined;

    const limit = parseIntegerParam(limitParam, 100);
    const offset = parseIntegerParam(offsetParam, 0);

    if (limit === null || offset === null) {
      return NextResponse.json(
        { error: "Limit and offset must be whole numbers" },
        { status: 400 }
      );
    }

    // Validate limit
    if (limit < 1 || limit > 500) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 500" },
        { status: 400 }
      );
    }

    // Validate offset
    if (offset < 0 || offset > MAX_QUESTION_OFFSET) {
      return NextResponse.json(
        { error: `Offset must be between 0 and ${MAX_QUESTION_OFFSET}` },
        { status: 400 }
      );
    }

    // Validate question type if provided
    const roundType = type ? normalizeQuestionRound(type) : null;
    if (type && !roundType) {
      return NextResponse.json(
        {
          error: "Invalid question type",
          validTypes: QUESTION_ROUND_TYPES,
        },
        { status: 400 }
      );
    }

    // Get questions with pagination
    // Publication is a server-owned projection. The retired activeOnly query
    // parameter is ignored so old clients cannot opt into historical rows.
    const { questions, total } = await dependencies.getPublishedQuestions({
      roundType: roundType ?? undefined,
      limit,
      offset,
      search,
    });

    // An empty unfiltered first page means the published corpus is unavailable,
    // not that a user's filter happened to have no matches.
    if (!roundType && !search && offset === 0 && total === 0) {
      return NextResponse.json(
        {
          error: "Question bank is temporarily unavailable",
          code: "question_bank_unavailable",
        },
        { status: 503 }
      );
    }

    // Pagination metadata
    const pagination = {
      total,
      limit,
      offset,
      hasMore: offset + questions.length < total,
    };

    return NextResponse.json({
      questions,
      pagination,
    });
  } catch {
    console.error("question_list_read_failed");
    return NextResponse.json(
      { error: "Failed to fetch questions" },
      { status: 500 }
    );
  }
}

export function parseIntegerParam(
  value: string | null,
  fallback: number
): number | null {
  return parseNonNegativeIntegerParam(value, fallback);
}
