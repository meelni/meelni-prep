export function inferSupabaseProjectRef(value) {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export function inferDatabaseProjectRef(value) {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) {
      return undefined;
    }

    const directHostMatch = url.hostname.match(
      /^db\.([a-z0-9]{20})\.supabase\.co$/
    );
    if (directHostMatch) return directHostMatch[1];

    const poolerHostMatch = url.hostname.match(
      /^[a-z0-9-]+\.pooler\.supabase\.com$/
    );
    if (!poolerHostMatch) return undefined;

    const poolerUserMatch = decodeURIComponent(url.username).match(
      /^postgres\.([a-z0-9]{20})$/
    );
    return poolerUserMatch?.[1];
  } catch {
    return undefined;
  }

  return undefined;
}
