export interface TranscriptEndSettlement {
  settled: boolean;
  pending: number;
  failed: number;
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
