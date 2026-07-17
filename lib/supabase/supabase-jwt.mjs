export const EXPECTED_PRODUCTION_SUPABASE_PROJECT_REF = "rarrrwkjuhfyfatcmrkw";
export const EXPECTED_PREVIEW_SUPABASE_PROJECT_REF = "kxpvidtxznllfosfemdl";

export function readSupabaseJwtClaims(value) {
  if (!value) return undefined;
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) return undefined;

  try {
    const decoded = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      return undefined;
    }
    return {
      iss: typeof decoded.iss === "string" ? decoded.iss : undefined,
      ref: typeof decoded.ref === "string" ? decoded.ref : undefined,
      role: typeof decoded.role === "string" ? decoded.role : undefined,
    };
  } catch {
    return undefined;
  }
}

export function supabaseJwtIssuerMatchesProject(issuer, projectRef) {
  if (issuer === "supabase") return true;
  if (!issuer) return false;
  try {
    const url = new URL(issuer);
    return (
      url.protocol === "https:" &&
      url.hostname === `${projectRef}.supabase.co` &&
      url.pathname.replace(/\/$/, "") === "/auth/v1" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function supabaseJwtMatchesIdentity(
  value,
  { expectedProjectRef, expectedRole, expectedIssuer }
) {
  const claims = readSupabaseJwtClaims(value);
  return Boolean(
    claims &&
      claims.ref === expectedProjectRef &&
      claims.role === expectedRole &&
      claims.iss === expectedIssuer &&
      supabaseJwtIssuerMatchesProject(claims.iss, expectedProjectRef)
  );
}
