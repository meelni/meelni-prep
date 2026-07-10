const STRIPE_LIVE_SERVER_KEY = /^(?:sk|rk)_live_/;

export function isStripeLiveServerKey(
  value: string | undefined
): value is string {
  return Boolean(value && STRIPE_LIVE_SERVER_KEY.test(value));
}
