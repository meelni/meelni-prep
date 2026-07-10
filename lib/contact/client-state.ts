export function isCurrentContactSubmissionVersion(
  submittedVersion: number,
  currentVersion: number
): boolean {
  return submittedVersion === currentVersion;
}
