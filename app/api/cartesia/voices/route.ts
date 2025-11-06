/**
 * List Cartesia Voices API
 *
 * Returns a curated list of popular Cartesia TTS voice models available through
 * LiveKit Inference. These voices are pre-selected for optimal interview coaching
 * experience with diverse gender, accent, and tone options.
 *
 * @route GET /api/cartesia/voices
 * @access Public (no authentication required)
 *
 * @response {Array<Object>} voices - List of available voice models
 * @response[].id {string} - Voice UUID (use in config.voice)
 * @response[].name {string} - Display name (e.g., "British Lady", "Confident Lady")
 * @response[].description {string} - Voice characteristics description
 * @response[].gender {string} - Voice gender (male | female)
 * @response[].language {string} - Language code (e.g., "en")
 *
 * @implementation_details
 * - No Cartesia API key required when using LiveKit Inference
 * - LiveKit handles authentication with Cartesia on backend
 * - Voices are hardcoded for consistent UX (no external API dependency)
 * - Full Cartesia voice library (150+ voices) available via: GET https://api.cartesia.ai/voices
 * - Default voice: Tessa (6ccbfb76-1fc6-48f7-b71d-91ac6298247b) - not in this list but used in agent
 *
 * @example
 * // Request
 * GET /api/cartesia/voices
 *
 * // Response (200 OK)
 * [
 *   {
 *     "id": "79a125e8-cd45-4c13-8a67-188112f4dd22",
 *     "name": "British Lady",
 *     "description": "Mature British English voice",
 *     "gender": "female",
 *     "language": "en"
 *   },
 *   {
 *     "id": "f114a467-c40a-4db5-8ca8-53b8f1509406",
 *     "name": "Reflective Man",
 *     "description": "Calm and thoughtful male voice",
 *     "gender": "male",
 *     "language": "en"
 *   },
 *   ...
 * ]
 *
 * @usage_example
 * ```typescript
 * // Fetch voices for dropdown
 * const voices = await fetch('/api/cartesia/voices').then(r => r.json());
 *
 * // Use voice ID in session config
 * const config = {
 *   voice: "79a125e8-cd45-4c13-8a67-188112f4dd22", // British Lady
 *   tts_model: `cartesia/sonic-3:79a125e8-cd45-4c13-8a67-188112f4dd22`
 * };
 * ```
 *
 * @see https://docs.cartesia.ai/api-reference/voices/list for full voice API
 * @see /app/setup/page.tsx for voice selection UI implementation
 */

import { NextResponse } from "next/server";

// Hardcoded list of popular Cartesia voices available through LiveKit inference
// No API key needed - LiveKit handles the authentication
const VOICES = [
  {
    "id": "79a125e8-cd45-4c13-8a67-188112f4dd22",
    "name": "British Lady",
    "description": "Mature British English voice",
    "gender": "female",
    "language": "en"
  },
  {
    "id": "f114a467-c40a-4db5-8ca8-53b8f1509406",
    "name": "Reflective Man",
    "description": "Calm and thoughtful male voice",
    "gender": "male",
    "language": "en"
  },
  {
    "id": "f9836c6e-a0bd-460e-9d3c-f7299fa60f94",
    "name": "Confident Lady",
    "description": "Professional and confident female voice",
    "gender": "female",
    "language": "en"
  },
  {
    "id": "c2ac25f9-ecc4-4f56-9095-651354df60c0",
    "name": "Wise Man",
    "description": "Mature and authoritative male voice",
    "gender": "male",
    "language": "en"
  },
  {
    "id": "2ee87190-8f84-4925-97da-e52547f9462c",
    "name": "Friendly Woman",
    "description": "Warm and approachable female voice",
    "gender": "female",
    "language": "en"
  },
  {
    "id": "bb63ab2f-f991-4e1c-b948-052bd1e7fa37",
    "name": "Casual Man",
    "description": "Relaxed conversational male voice",
    "gender": "male",
    "language": "en"
  },
  {
    "id": "156fb8d2-335b-4950-9cb3-a2d33befec77",
    "name": "Professional Lady",
    "description": "Clear and articulate female voice",
    "gender": "female",
    "language": "en"
  },
  {
    "id": "95856005-0332-41b0-935f-352e296aa0df",
    "name": "Energetic Man",
    "description": "Dynamic and enthusiastic male voice",
    "gender": "male",
    "language": "en"
  }
];

export async function GET() {
  return NextResponse.json(VOICES);
}
