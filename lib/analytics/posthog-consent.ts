export interface PostHogConsentClient {
  opt_out_capturing(): void;
  reset(resetDeviceId?: boolean): void;
  stopSessionRecording(): void;
}

export function withdrawPostHogConsent(client: PostHogConsentClient): void {
  try {
    client.stopSessionRecording();
  } catch {
    // Continue to the controls that actually revoke persisted consent.
  }
  try {
    client.reset(true);
  } catch {
    // A failed identity reset must not prevent the final opt-out.
  }
  // PostHog reset clears its consent marker. Persist opt-out last so direct SDK
  // calls and internal modules remain fail-closed after withdrawal.
  client.opt_out_capturing();
}
