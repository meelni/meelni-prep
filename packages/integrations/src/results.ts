import type { IntegrationProvider } from "./providers";

export interface ProviderError {
  code: string;
  message: string;
  retryable: boolean;
  cause?: unknown;
}

export type ProviderResult<T> =
  | {
      ok: true;
      provider: IntegrationProvider;
      data: T;
      meta?: Record<string, unknown>;
    }
  | {
      ok: false;
      provider: IntegrationProvider;
      error: ProviderError;
      meta?: Record<string, unknown>;
    };

export function providerSuccess<T>(
  provider: IntegrationProvider,
  data: T,
  meta?: Record<string, unknown>
): ProviderResult<T> {
  return {
    ok: true,
    provider,
    data,
    ...(meta ? { meta } : {}),
  };
}

export function providerFailure<T = never>(
  provider: IntegrationProvider,
  error: ProviderError,
  meta?: Record<string, unknown>
): ProviderResult<T> {
  return {
    ok: false,
    provider,
    error,
    ...(meta ? { meta } : {}),
  };
}

export function isProviderFailure<T>(
  result: ProviderResult<T>
): result is Extract<ProviderResult<T>, { ok: false }> {
  return !result.ok;
}
