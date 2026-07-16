const RETIRED_TRANSCRIPT_STORAGE_KEYS = [
  "transcript_queue",
  "transcript_queue_v2",
] as const;

export function scrubRetiredTranscriptBrowserStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of RETIRED_TRANSCRIPT_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      // Storage may be unavailable under strict privacy settings. Never read or
      // log retired values while attempting deletion.
    }
  }
}
