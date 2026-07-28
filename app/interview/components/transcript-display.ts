export interface TranscriptDisplayFragment {
  eventId?: string;
  rowId?: string;
  speaker: "user" | "interviewer";
  text: string;
  timestamp: Date;
}

export interface DisplayTranscriptTurn {
  id: string;
  speaker: TranscriptDisplayFragment["speaker"];
  text: string;
}

export function groupTranscriptTurns(
  turns: TranscriptDisplayFragment[]
): DisplayTranscriptTurn[] {
  return turns.reduce<DisplayTranscriptTurn[]>((groups, turn, index) => {
    const previous = groups.at(-1);
    if (previous?.speaker === turn.speaker) {
      previous.text = `${previous.text} ${turn.text}`.trim();
      return groups;
    }

    groups.push({
      id:
        turn.rowId ??
        turn.eventId ??
        `legacy:${turn.speaker}:${turn.timestamp.toISOString()}:${index}`,
      speaker: turn.speaker,
      text: turn.text.trim(),
    });
    return groups;
  }, []);
}
