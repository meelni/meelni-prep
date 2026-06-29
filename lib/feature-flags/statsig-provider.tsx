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
import { StatsigSessionReplayPlugin } from "@statsig/session-replay";
import { StatsigAutoCapturePlugin } from "@statsig/web-analytics";
import { useAuth } from "@/app/providers/auth-provider";
import { getOrCreateStatsigAnonymousId } from "./anonymous-id";
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

export function StatsigProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [anonymousId, setAnonymousId] = useState<string | null>(null);
  const [clientAvailable, setClientAvailable] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [localOverrides, setLocalOverrides] = useState<FeatureFlagOverrides>({});
  const [ready, setReady] = useState(false);
  const clientRef = useRef<StatsigClient | null>(null);
  const initializedUserKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setAnonymousId(getOrCreateStatsigAnonymousId());
    setLocalOverrides(readFeatureFlagOverrides(window.localStorage));
  }, []);

  const statsigUser = useMemo(() => {
    if (!anonymousId) {
      return null;
    }

    return buildStatsigUser({
      anonymousId,
      user,
    });
  }, [anonymousId, user]);

  const statsigUserKey = useMemo(
    () => (statsigUser ? JSON.stringify(statsigUser) : null),
    [statsigUser]
  );

  useEffect(() => {
    if (!statsigConfig.enabled || !statsigUser || !statsigUserKey) {
      return;
    }

    let active = true;

    async function initializeOrUpdate(userForStatsig: StatsigUser) {
      try {
        setReady(false);
        setLastError(null);

        if (!clientRef.current) {
          const client = new StatsigClient(statsigConfig.clientKey, userForStatsig, {
            environment: {
              tier: statsigConfig.environmentTier,
            },
            networkConfig: statsigConfig.apiUrl
              ? {
                  api: statsigConfig.apiUrl,
                }
              : undefined,
            plugins: [
              new StatsigSessionReplayPlugin(),
              new StatsigAutoCapturePlugin(),
            ],
          });

          clientRef.current = client;
          setClientAvailable(true);
          initializedUserKeyRef.current = statsigUserKey;
          await client.initializeAsync({ timeoutMs: 3000 });
        } else if (initializedUserKeyRef.current !== statsigUserKey) {
          initializedUserKeyRef.current = statsigUserKey;
          await clientRef.current.updateUserAsync(userForStatsig, { timeoutMs: 3000 });
        }

        if (active) {
          setReady(true);
        }
      } catch (error) {
        initializedUserKeyRef.current = null;
        const message = error instanceof Error ? error.message : "Statsig initialization failed";
        if (statsigConfig.debug) {
          console.error("[FeatureFlags] Failed to initialize Statsig", error);
        }
        if (active) {
          setLastError(message);
          setReady(false);
        }
      }
    }

    void initializeOrUpdate(statsigUser);

    return () => {
      active = false;
    };
  }, [statsigUser, statsigUserKey]);

  useEffect(() => {
    return () => {
      void clientRef.current?.shutdown();
    };
  }, []);

  const checkGate = useCallback(
    (name: string, defaultValue = false) => {
      const override = localOverrides[name] ?? "statsig";

      if (!statsigConfig.enabled || !ready || !clientRef.current) {
        return applyFeatureFlagOverride(defaultValue, override);
      }

      try {
        return applyFeatureFlagOverride(clientRef.current.checkGate(name), override);
      } catch (error) {
        if (statsigConfig.debug) {
          console.error("[FeatureFlags] Failed to check gate", name, error);
        }
        return applyFeatureFlagOverride(defaultValue, override);
      }
    },
    [localOverrides, ready]
  );

  const setLocalOverride = useCallback(
    (name: string, mode: FeatureFlagOverrideMode) => {
      setLocalOverrides(setFeatureFlagOverride(window.localStorage, name, mode));
    },
    []
  );

  const logEvent = useCallback(
    (
      eventName: string,
      value?: string | number,
      metadata?: Record<string, string>
    ) => {
      if (!statsigConfig.enabled || !clientRef.current) {
        return;
      }

      clientRef.current.logEvent(eventName, value, metadata);
    },
    []
  );

  const flush = useCallback(async () => {
    try {
      await clientRef.current?.flush();
      setLastError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Statsig flush failed";
      if (statsigConfig.debug) {
        console.error("[FeatureFlags] Failed to flush Statsig events", error);
      }
      setLastError(message);
    }
  }, []);

  const apiHost = useMemo(() => {
    if (!statsigConfig.apiUrl) {
      return null;
    }

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
      logEvent,
      flush,
    }),
    [
      anonymousId,
      apiHost,
      checkGate,
      clientAvailable,
      flush,
      lastError,
      localOverrides,
      logEvent,
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
  if (context === undefined) {
    throw new Error("useFeatureFlags must be used within a StatsigProvider");
  }

  return context;
}

export function useFeatureFlag(name: string, defaultValue = false) {
  const { checkGate } = useFeatureFlags();

  return useMemo(
    () => checkGate(name, defaultValue),
    [checkGate, defaultValue, name]
  );
}
