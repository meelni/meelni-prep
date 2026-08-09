import { NextResponse } from "next/server";

import {
  GENERIC_PREVIEW_VOICE_UNAVAILABLE,
  GENERIC_PREVIEW_VOICE_UNAVAILABLE_STATUS,
  isLiveKitIntentionallyDisabled,
} from "@meelni/integrations";

export function genericPreviewVoiceUnavailableResponse(
  env: Record<string, string | undefined> = process.env
): NextResponse | null {
  if (!isLiveKitIntentionallyDisabled(env)) return null;

  return NextResponse.json(GENERIC_PREVIEW_VOICE_UNAVAILABLE, {
    status: GENERIC_PREVIEW_VOICE_UNAVAILABLE_STATUS,
    headers: { "Cache-Control": "private, no-store" },
  });
}
