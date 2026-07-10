import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { AccountDeletionPendingError, upsertUser } from "@/lib/db/users";
import { buildSafeInternalRedirectUrl } from "@/lib/auth/safe-redirect";
import {
  buildAuthFailureHref,
  resolveAuthCallbackDestination,
} from "@/lib/auth/auth-handoff";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;
  const next = requestUrl.searchParams.get("next");
  const cancelTo = requestUrl.searchParams.get("cancelTo");

  if (!code) {
    return NextResponse.redirect(
      buildSafeInternalRedirectUrl(
        origin,
        resolveAuthCallbackDestination(requestUrl.searchParams),
        "/"
      )
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Error exchanging code for session:", error);
      const retryUrl = new URL(
        buildAuthFailureHref({
          redirectTo: next ?? undefined,
          cancelTo: cancelTo ?? undefined,
        }),
        origin
      );
      return NextResponse.redirect(retryUrl);
    }

    // Get the authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // Create or update user in app_user table
      try {
        await upsertUser({
          id: user.id,
          email: user.email!,
          name:
            user.user_metadata?.name || user.user_metadata?.full_name || null,
        });
      } catch (error) {
        if (error instanceof AccountDeletionPendingError) {
          await supabase.auth.signOut();
          return NextResponse.redirect(
            `${origin}/auth/signin?error=account_deletion_pending`
          );
        }
        console.error("Error upserting user:", error);
        // Continue anyway - user is authenticated even if DB insert fails
      }
    }
  }

  return NextResponse.redirect(
    buildSafeInternalRedirectUrl(
      origin,
      resolveAuthCallbackDestination(requestUrl.searchParams)
    )
  );
}
