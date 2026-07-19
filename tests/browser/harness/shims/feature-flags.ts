export function useFeatureFlag() {
  return true;
}

export function useFeatureFlags() {
  return {
    apiHost: null,
    clientAvailable: false,
    enabled: false,
    lastError: null,
    localOverrides: {},
    localDevId: "browser-qa-local",
    ready: true,
    checkGate: () => true,
    setLocalOverride: () => undefined,
    logEvent: () => undefined,
    flush: async () => undefined,
  };
}

export function usePublicActivationDecision() {
  return { canActivate: true, state: "available" as const };
}

export function StatsigProvider({ children }: { children: React.ReactNode }) {
  return children;
}
