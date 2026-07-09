/**
 * Questions List API
 *
 * Retrieves a list of questions from the question bank with optional filtering
 * and pagination. This endpoint will be used for the admin UI to manage questions.
 *
 * @route GET /api/questions
 * @access Public (for now - will be admin-protected in future)
 *
 * @query {string} type Optional - Filter by question type (behavioral | product_sense | execution | strategy)
 * @query {number} limit Optional - Maximum number of results per page (1-500, default: 100)
 * @query {number} offset Optional - Number of results to skip (default: 0)
 * @query {boolean} activeOnly Optional - Return only active questions (default: false)
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
import { getQuestions } from "@/lib/db/questions";
import { normalizeQuestionRound, QUESTION_ROUND_TYPES } from "@meelni/core";

const MAX_QUESTION_OFFSET = 100_000;

export async function GET(req: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type");
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");
    const activeOnlyParam = searchParams.get("activeOnly");
    const search = searchParams.get("search")?.trim() || undefined;

    const limit = parseIntegerParam(limitParam, 100);
    const offset = parseIntegerParam(offsetParam, 0);
    const activeOnly = activeOnlyParam === "true";

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
    const { questions, total } = await getQuestions({
      roundType: roundType ?? undefined,
      activeOnly,
      limit,
      offset,
      search,
    });

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
  } catch (error) {
    console.error("Error fetching questions:", error);
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
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
