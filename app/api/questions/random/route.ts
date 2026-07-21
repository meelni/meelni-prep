/**
 * Random Question API
 *
 * Returns a random active question from the question bank, optionally filtered by type.
 * This endpoint is used by interview sessions to fetch questions dynamically.
 *
 * @route GET /api/questions/random
 * @access Public (for now - can be protected later if needed)
 *
 * @query {string} type Optional - Filter by question type (behavioral | product_sense | execution | strategy)
 *
 * @response {Object} question - Random question object
 * @response.id {string} - Question UUID
 * @response.company {string|null} - Associated company name (if applicable)
 * @response.questionText {string} - The question text
 * @response.questionType {string} - Canonical question label
 *
 * @throws {400} Bad Request - Invalid question type parameter
 * @throws {404} Not Found - No active questions found matching the filter
 * @throws {500} Internal Server Error - Database query failed
 *
 * @example
 * // Request (Random Product Sense Question)
 * GET /api/questions/random?type=product_sense
 *
 * // Response (200 OK)
 * {
 *   "id": "550e8400-e29b-41d4-a716-446655440000",
 *   "company": "Google",
 *   "questionText": "How would you improve Google Maps for blind users?",
 *   "questionType": "Product Sense"
 * }
 *
 * @example
 * // Request (Random Question - Any Type)
 * GET /api/questions/random
 *
 * // Response (200 OK)
 * {
 *   "id": "650e8400-e29b-41d4-a716-446655440001",
 *   "company": null,
 *   "questionText": "Tell me about a time you dealt with ambiguity.",
 *   "questionType": "Behavioral"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getRandomQuestion, getRandomRecentQuestion } from "@/lib/db/questions";
import {
  normalizeQuestionRound,
  QUESTION_ROUND_TYPES,
  questionTypeStorageAliasesForRound,
} from "@meelni/core";

export async function GET(req: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type");
    const recent = searchParams.get("recent"); // Optional: "true" or number of days

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

    const dbTypes = roundType
      ? [...questionTypeStorageAliasesForRound(roundType)]
      : undefined;

    // Get random question (recent or all)
    let question;
    if (recent) {
      // Parse days parameter (default to 365 if "true", otherwise use provided number)
      const days = recent === "true" ? 365 : parseInt(recent, 10);
      if (isNaN(days) || days < 1) {
        return NextResponse.json(
          {
            error:
              "Invalid 'recent' parameter. Must be 'true' or a positive number of days.",
          },
          { status: 400 }
        );
      }
      question = await getRandomRecentQuestion(days, dbTypes);
    } else {
      question = await getRandomQuestion(dbTypes);
    }

    if (!question) {
      return NextResponse.json(
        {
          error: "No active questions found",
          message: type
            ? `No active questions found for type: ${type}`
            : "No active questions found in the question bank",
        },
        { status: 404 }
      );
    }

    // Return only the essential fields for interview use
    return NextResponse.json({
      id: question.id,
      company: question.company,
      questionText: question.questionText,
      questionType: question.questionType,
      askedAt: question.askedAt,
    });
  } catch {
    console.error("random_question_read_failed");
    return NextResponse.json(
      {
        error: "Failed to fetch random question",
        message: "Unable to load a question right now.",
      },
      { status: 500 }
    );
  }
}
