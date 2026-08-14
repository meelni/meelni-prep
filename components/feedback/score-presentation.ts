export function getDisplayedOverallScore(score: number): number {
  return Math.round(score);
}

export function getDisplayedOverallDelta(
  earlierScore: number | null,
  laterScore: number | null
): number | null {
  if (earlierScore === null || laterScore === null) return null;
  return (
    getDisplayedOverallScore(laterScore) -
    getDisplayedOverallScore(earlierScore)
  );
}
