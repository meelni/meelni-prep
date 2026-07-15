export interface TranscriptEndSettlement {
  settled: boolean;
  pending: number;
  failed: number;
}

export async function establishTranscriptEndCutoff(input: {
  setEndIntent(value: boolean): void;
  flush(): Promise<TranscriptEndSettlement>;
}): Promise<TranscriptEndSettlement> {
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
