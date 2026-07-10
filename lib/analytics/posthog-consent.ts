export interface PostHogConsentClient {
  opt_out_capturing(): void;
  reset(resetDeviceId?: boolean): void;
  stopSessionRecording(): void;
}

export function withdrawPostHogConsent(client: PostHogConsentClient): void {
  client.stopSessionRecording();
  client.reset(true);
  // PostHog reset clears its consent marker. Persist opt-out last so direct SDK
  // calls and internal modules remain fail-closed after withdrawal.
  client.opt_out_capturing();
}
