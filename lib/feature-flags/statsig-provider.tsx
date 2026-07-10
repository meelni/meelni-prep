"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StatsigClient, type StatsigUser } from "@statsig/js-client";
import { useAnalyticsConsent } from "@/app/providers/analytics-consent-provider";
import { useAuth } from "@/app/providers/auth-provider";
import {
  clearStatsigAnonymousIdentifiers,
  getOrCreateStatsigAnonymousId,
} from "./anonymous-id";
import { buildStatsigUser, getStatsigConfig } from "./config";
import {
  applyFeatureFlagOverride,
  readFeatureFlagOverrides,
  setFeatureFlagOverride,
  type FeatureFlagOverrideMode,
  type FeatureFlagOverrides,
} from "./local-overrides";

interface FeatureFlagsContextValue {
  apiHost: string | null;
  clientAvailable: boolean;
  enabled: boolean;
  lastError: string | null;
  localOverrides: FeatureFlagOverrides;
  localDevId: string | null;
  ready: boolean;
  checkGate: (name: string, defaultValue?: boolean) => boolean;
  setLocalOverride: (name: string, mode: FeatureFlagOverrideMode) => void;
  logEvent: (
    eventName: string,
    value?: string | number,
    metadata?: Record<string, string>
  ) => void;
  flush: () => Promise<void>;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | undefined>(
  undefined
);
const statsigConfig = getStatsigConfig({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_STATSIG_API_URL: process.env.NEXT_PUBLIC_STATSIG_API_URL,
  NEXT_PUBLIC_STATSIG_CLIENT_KEY: process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY,
  NEXT_PUBLIC_STATSIG_ENVIRONMENT: process.env.NEXT_PUBLIC_STATSIG_ENVIRONMENT,
  VERCEL_ENV: process.env.VERCEL_ENV,
});

export function StatsigProvider({
  children,
  initialGateValues = {},
}: {
  children: React.ReactNode;
  initialGateValues?: Record<string, boolean>;
}) {
  const { user } = useAuth();
  const { decision, resolved } = useAnalyticsConsent();
  const accepted = resolved && decision === "accepted";
  const [anonymousId, setAnonymousId] = useState<string | null>(null);
  const [clientAvailable, setClientAvailable] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [localOverrides, setLocalOverrides] = useState<FeatureFlagOverrides>(
    {}
  );
  const [ready, setReady] = useState(false);
  const clientRef = useRef<StatsigClient | null>(null);
  const initializedUserKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setLocalOverrides(readFeatureFlagOverrides(window.localStorage));
  }, []);

  useEffect(() => {
    if (accepted) {
      setAnonymousId(getOrCreateStatsigAnonymousId());
      return;
    }
    setAnonymousId(null);
    clearStatsigAnonymousIdentifiers();
    setReady(false);
    setClientAvailable(false);
    initializedUserKeyRef.current = null;
    const client = clientRef.current;
    clientRef.current = null;
    if (client) void client.shutdown();
  }, [accepted]);

  const statsigUser = useMemo(
    () => (anonymousId ? buildStatsigUser({ anonymousId, user }) : null),
    [anonymousId, user]
  );
  const statsigUserKey = useMemo(
    () => (statsigUser ? JSON.stringify(statsigUser) : null),
    [statsigUser]
  );

  useEffect(() => {
    if (!accepted || !statsigConfig.enabled || !statsigUser || !statsigUserKey)
      return;
    let active = true;

    async function initializeOrUpdate(userForStatsig: StatsigUser) {
      try {
        setReady(false);
        setLastError(null);
        if (!clientRef.current) {
          const client = new StatsigClient(
            statsigConfig.clientKey,
            userForStatsig,
            {
              disableStableID: true,
              disableStorage: true,
              includeCurrentPageUrlWithEvents: false,
              loggingEnabled: "disabled",
              environment: { tier: statsigConfig.environmentTier },
              networkConfig: statsigConfig.apiUrl
                ? { api: statsigConfig.apiUrl }
                : undefined,
            }
          );
          clientRef.current = client;
          setClientAvailable(true);
          initializedUserKeyRef.current = statsigUserKey;
          await client.initializeAsync({ timeoutMs: 3000 });
        } else if (initializedUserKeyRef.current !== statsigUserKey) {
          initializedUserKeyRef.current = statsigUserKey;
          await clientRef.current.updateUserAsync(userForStatsig, {
            timeoutMs: 3000,
          });
        }
        if (active) setReady(true);
      } catch (error) {
        initializedUserKeyRef.current = null;
        if (active) {
          setLastError(
            error instanceof Error
              ? error.message
              : "Statsig initialization failed"
          );
          setReady(false);
        }
      }
    }

    void initializeOrUpdate(statsigUser);
    return () => {
      active = false;
    };
  }, [accepted, statsigUser, statsigUserKey]);

  useEffect(
    () => () => {
      void clientRef.current?.shutdown();
    },
    []
  );

  const checkGate = useCallback(
    (name: string, defaultValue = false) => {
      const override = localOverrides[name] ?? "statsig";
      let value = initialGateValues[name] ?? defaultValue;
      if (accepted && ready && clientRef.current) {
        try {
          value = clientRef.current.checkGate(name);
        } catch {
          /* use bootstrap */
        }
      }
      return applyFeatureFlagOverride(value, override);
    },
    [accepted, initialGateValues, localOverrides, ready]
  );

  const setLocalOverride = useCallback(
    (name: string, mode: FeatureFlagOverrideMode) => {
      setLocalOverrides(
        setFeatureFlagOverride(window.localStorage, name, mode)
      );
      if (process.env.NODE_ENV === "development") {
        const cookieName = `meelni_feature_flag_${encodeURIComponent(name)}`;
        window.document.cookie =
          mode === "statsig"
            ? `${cookieName}=; Max-Age=0; Path=/; SameSite=Lax`
            : `${cookieName}=${mode}; Path=/; SameSite=Lax`;
        window.location.reload();
      }
    },
    []
  );

  const apiHost = useMemo(() => {
    if (!statsigConfig.apiUrl) return null;
    try {
      return new URL(statsigConfig.apiUrl).host;
    } catch {
      return statsigConfig.apiUrl;
    }
  }, []);
  const value = useMemo<FeatureFlagsContextValue>(
    () => ({
      apiHost,
      clientAvailable,
      enabled: statsigConfig.enabled,
      lastError,
      localOverrides,
      localDevId: anonymousId,
      ready,
      checkGate,
      setLocalOverride,
      logEvent: () => undefined,
      flush: async () => undefined,
    }),
    [
      anonymousId,
      apiHost,
      checkGate,
      clientAvailable,
      lastError,
      localOverrides,
      ready,
      setLocalOverride,
    ]
  );

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext);
  if (!context)
    throw new Error("useFeatureFlags must be used within a StatsigProvider");
  return context;
}

export function useFeatureFlag(name: string, defaultValue = false) {
  const { checkGate } = useFeatureFlags();
  return useMemo(
    () => checkGate(name, defaultValue),
    [checkGate, defaultValue, name]
  );
}
