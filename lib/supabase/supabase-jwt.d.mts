export interface SupabaseJwtClaims {
  iss: string | undefined;
  ref: string | undefined;
  role: string | undefined;
}

export const EXPECTED_PRODUCTION_SUPABASE_PROJECT_REF: string;
export const EXPECTED_PREVIEW_SUPABASE_PROJECT_REF: string;

export function readSupabaseJwtClaims(
  value: string | undefined
): SupabaseJwtClaims | undefined;

export function supabaseJwtIssuerMatchesProject(
  issuer: string | undefined,
  projectRef: string
): boolean;

export function supabaseJwtMatchesIdentity(
  value: string | undefined,
  expected: {
    expectedProjectRef: string;
    expectedRole: "anon" | "service_role";
    expectedIssuer: string;
  }
): boolean;
