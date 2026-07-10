const PLACEHOLDER_SECRET =
  /(?:change[-_ ]?me|placeholder|your[-_ ]?(?:contact|cron|operator)?[-_ ]?secret|test[-_ ]?secret|x{3,})/i;

export function isValidServerSecret(
  value: string | null | undefined
): value is string {
  if (!value || value !== value.trim()) return false;
  if (value.length < 32 || value.length > 256) return false;
  if (/\s|[\u0000-\u001f\u007f]/.test(value)) return false;
  if (PLACEHOLDER_SECRET.test(value)) return false;
  return new Set(value).size >= 8;
}
