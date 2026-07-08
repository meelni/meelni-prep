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
 *
 * @response {Object} response - Questions data with pagination
 * @response.questions {Array<Object>} - Array of question objects
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
 *       "questionType": "product_sense",
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

const VALID_QUESTION_TYPES = [
  "behavioral",
  "product_sense",
  "execution",
  "strategy",
] as const;

type QuestionType = (typeof VALID_QUESTION_TYPES)[number];

export async function GET(req: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type");
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");
    const activeOnlyParam = searchParams.get("activeOnly");

    const limit = limitParam ? parseInt(limitParam, 10) : 100;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const activeOnly = activeOnlyParam === "true";

    // Validate limit
    if (limit < 1 || limit > 500) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 500" },
        { status: 400 }
      );
    }

    // Validate offset
    if (offset < 0) {
      return NextResponse.json(
        { error: "Offset must be non-negative" },
        { status: 400 }
      );
    }

    // Validate question type if provided
    if (type && !VALID_QUESTION_TYPES.includes(type as QuestionType)) {
      return NextResponse.json(
        {
          error: "Invalid question type",
          validTypes: VALID_QUESTION_TYPES,
        },
        { status: 400 }
      );
    }

    // Get questions with pagination
    const { questions, total } = await getQuestions(
      type as
        | "behavioral"
        | "product_sense"
        | "execution"
        | "strategy"
        | undefined,
      limit,
      offset
    );

    // Filter for active only if requested
    const filteredQuestions = activeOnly
      ? questions.filter((q) => q.isActive)
      : questions;

    const filteredTotal = activeOnly ? filteredQuestions.length : total;

    // Pagination metadata
    const pagination = {
      total: filteredTotal,
      limit,
      offset,
      hasMore: offset + filteredQuestions.length < filteredTotal,
    };

    return NextResponse.json({
      questions: filteredQuestions,
      pagination,
    });
  } catch (error) {
    console.error("Error fetching questions:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch questions",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
