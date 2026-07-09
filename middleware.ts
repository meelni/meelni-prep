import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasAccountDeletionTombstone } from "@/lib/db/account-deletions";
import { getAccountAccessDecision } from "@/lib/auth/account-access";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protected routes that require authentication
  const protectedRoutes = ["/dashboard", "/setup", "/interview"];

  // Public routes that don't require authentication
  const publicRoutes = ["/explore", "/browse"];

  // Check if the current path is a protected route (excluding public routes)
  const isProtectedRoute =
    protectedRoutes.some((route) => pathname.startsWith(route)) &&
    !publicRoutes.some((route) => pathname.startsWith(route));

  const checksAuthenticatedAccess =
    isProtectedRoute || pathname.startsWith("/api/");

  if (checksAuthenticatedAccess) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const hasDeletionTombstone = user
      ? await hasAccountDeletionTombstone(user.id)
      : false;
    const decision = getAccountAccessDecision({
      requiresAuthentication: isProtectedRoute,
      authenticatedUserId: user?.id,
      hasDeletionTombstone,
    });

    if (decision === "account_deletion_pending") {
      await supabase.auth.signOut();
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "account_deletion_pending" },
          { status: 401 }
        );
      }
      return NextResponse.redirect(
        new URL("/auth/signin?error=account_deletion_pending", request.url)
      );
    }

    if (decision === "unauthenticated") {
      const redirectUrl = new URL("/auth/signin", request.url);
      redirectUrl.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

export const runtime = "nodejs";
