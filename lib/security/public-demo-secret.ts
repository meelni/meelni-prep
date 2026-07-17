export const PUBLIC_DEMO_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** A 32-byte value encoded without base64 padding. */
export function isValidPublicDemoSecret(
  value: string | undefined
): value is string {
  return Boolean(value && PUBLIC_DEMO_SECRET_PATTERN.test(value));
}
