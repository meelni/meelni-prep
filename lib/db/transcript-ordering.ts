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
