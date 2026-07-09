import { StatsigClient, type StatsigUser } from "@statsig/js-client";

export interface ServerGateResolution {
  source: "statsig" | "configured-default";
  value: boolean;
}

interface StatsigGateClient {
  checkGate(name: string): boolean;
  initializeAsync(options: { timeoutMs: number }): Promise<{ source: string }>;
  shutdown(): Promise<void>;
}

interface ResolveServerGateOptions {
  apiUrl?: string;
  clientFactory?: (
    clientKey: string,
    user: StatsigUser,
    apiUrl?: string
  ) => StatsigGateClient;
  clientKey: string;
  gateName: string;
  fallbackValue?: boolean;
  timeoutMs?: number;
  user: StatsigUser;
}

function createStatsigGateClient(
  clientKey: string,
  user: StatsigUser,
  apiUrl?: string
): StatsigGateClient {
  return new StatsigClient(clientKey, user, {
    loggingEnabled: "disabled",
    networkConfig: apiUrl ? { api: apiUrl } : undefined,
  });
}

export async function resolveServerGate({
  apiUrl,
  clientFactory = createStatsigGateClient,
  clientKey,
  gateName,
  fallbackValue = false,
  timeoutMs = 1500,
  user,
}: ResolveServerGateOptions): Promise<ServerGateResolution> {
  if (!clientKey.trim()) {
    return { source: "configured-default", value: fallbackValue };
  }

  const client = clientFactory(clientKey, user, apiUrl);

  try {
    const result = await client.initializeAsync({ timeoutMs });
    if (result.source !== "Network" && result.source !== "NetworkNotModified") {
      return { source: "configured-default", value: fallbackValue };
    }

    return { source: "statsig", value: client.checkGate(gateName) };
  } catch {
    return { source: "configured-default", value: fallbackValue };
  } finally {
    await client.shutdown().catch(() => undefined);
  }
}
