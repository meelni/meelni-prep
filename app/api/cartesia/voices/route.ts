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
