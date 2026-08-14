export interface DemoStartError {
  title: string;
  message: string;
  retryAt?: number;
  paused?: boolean;
}

export type PublicDemoStartRequestResult =
  | {
      ok: true;
      data: { token: string; url: string; durationSeconds: number };
    }
  | {
      ok: false;
      status: number;
      body: { error?: string; retryAfterSeconds?: number };
      retryAfterHeader: string | null;
    };

export async function requestPublicDemoStart({
  signal,
  fetcher = fetch,
}: {
  signal: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<PublicDemoStartRequestResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetcher("/api/livekit/demo-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal,
    });
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (
      response.status === 409 &&
      body.error === "demo_identity_initialized" &&
      attempt === 0
    ) {
      continue;
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        body: {
          error: typeof body.error === "string" ? body.error : undefined,
          retryAfterSeconds:
            typeof body.retryAfterSeconds === "number"
              ? body.retryAfterSeconds
              : undefined,
        },
        retryAfterHeader: response.headers.get("Retry-After"),
      };
    }

    const token = body.token;
    const url = body.url;
    const durationSeconds = body.durationSeconds;
    if (
      typeof token === "string" &&
      token.length > 0 &&
      typeof url === "string" &&
      isLiveKitWebsocketUrl(url) &&
      Number.isInteger(durationSeconds) &&
      (durationSeconds as number) > 0 &&
      (durationSeconds as number) <= 120
    ) {
      return {
        ok: true,
        data: { token, url, durationSeconds: durationSeconds as number },
      };
    }
    return {
      ok: false,
      status: 503,
      body: { error: "demo_temporarily_unavailable" },
      retryAfterHeader: null,
    };
  }

  return {
    ok: false,
    status: 503,
    body: { error: "demo_temporarily_unavailable" },
    retryAfterHeader: null,
  };
}

export function interpretPublicDemoStartFailure({
  status,
  body,
  retryAfterHeader,
  now = Date.now(),
}: {
  status: number;
  body: { error?: string; retryAfterSeconds?: number };
  retryAfterHeader: string | null;
  now?: number;
}): DemoStartError {
  if (status === 503 && body.error === "voice_unavailable_in_preview") {
    return {
      title: "Voice is off in this web Preview",
      message:
        "Use the trusted staging environment for LiveKit rehearsal. Non-voice Preview pages remain available.",
      paused: true,
    };
  }

  if (status === 404 && body.error === "demo_unavailable") {
    return {
      title: "The voice preview is paused",
      message: "This preview isn't available right now.",
      paused: true,
    };
  }

  if (status === 409 && body.error === "demo_start_in_progress") {
    const retryAfter = positiveRetryAfter(
      body.retryAfterSeconds,
      retryAfterHeader,
      2
    );
    return {
      title: "Your voice preview is still starting",
      message: "The interviewer is joining the room now.",
      retryAt: now + retryAfter * 1000,
    };
  }

  if (status === 409 && body.error === "demo_preview_active") {
    const retryAfter = positiveRetryAfter(
      body.retryAfterSeconds,
      retryAfterHeader,
      60
    );
    return {
      title: "Your voice preview is still active",
      message: "You can start another preview when this one ends.",
      retryAt: now + retryAfter * 1000,
    };
  }

  if (status === 429 && body.error === "demo_rate_limited") {
    const retryAfter = positiveRetryAfter(
      body.retryAfterSeconds,
      retryAfterHeader,
      60
    );
    return {
      title: "You've reached the voice preview limit",
      message:
        "You can start up to 10 voice previews in 24 hours. Try again when your preview allowance resets.",
      retryAt: now + retryAfter * 1000,
    };
  }

  return {
    title: "The voice preview is temporarily unavailable",
    message: "Your microphone is fine—we couldn't connect to the interviewer.",
  };
}

function positiveRetryAfter(
  bodyValue: number | undefined,
  headerValue: string | null,
  fallback: number
): number {
  if (Number.isInteger(bodyValue) && bodyValue && bodyValue > 0) {
    return bodyValue;
  }
  const header = Number(headerValue);
  return Number.isInteger(header) && header > 0 ? header : fallback;
}

function isLiveKitWebsocketUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "wss:";
  } catch {
    return false;
  }
}
