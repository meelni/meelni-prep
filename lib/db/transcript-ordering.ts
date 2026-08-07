import { asc } from "drizzle-orm";

import { transcriptTurn } from "./schema";

/** Canonical deterministic order for transcript display, export, and evaluation. */
export function transcriptChronologicalOrder() {
  return [
    asc(transcriptTurn.startedAt),
    asc(transcriptTurn.writerGeneration),
    asc(transcriptTurn.writerId),
    asc(transcriptTurn.sequence),
    asc(transcriptTurn.eventId),
    asc(transcriptTurn.id),
  ];
}

export function hasImpossibleWriterTurnOrder(input: {
  eventStartedAt: number;
  eventEndedAt: number;
  previousStartedAt?: Date | null;
  nextEndedAt?: Date | null;
}): boolean {
  return (
    (input.previousStartedAt !== undefined &&
      input.previousStartedAt !== null &&
      input.previousStartedAt.getTime() > input.eventEndedAt) ||
    (input.nextEndedAt !== undefined &&
      input.nextEndedAt !== null &&
      input.nextEndedAt.getTime() < input.eventStartedAt)
  );
}
