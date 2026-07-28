export interface TranscriptEndSettlement {
  settled: boolean;
  pending: number;
  failed: number;
}

const LIVEKIT_UNSUPPORTED_RPC_METHOD = 1400;

export function isTranscriptRuntimeContractUnavailable(
  error: unknown
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === LIVEKIT_UNSUPPORTED_RPC_METHOD
  );
}

export async function establishTranscriptEndCutoff<
  Settlement extends TranscriptEndSettlement,
>(input: {
  setEndIntent(value: boolean): void;
  flush(): Promise<Settlement>;
}): Promise<Settlement> {
  input.setEndIntent(true);
  try {
    const settlement = await input.flush();
    if (!settlement.settled) input.setEndIntent(false);
    return settlement;
  } catch (error) {
    input.setEndIntent(false);
    throw error;
  }
}
