import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { upsertUser } from "@/lib/db/users";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Error exchanging code for session:", error);
      return NextResponse.redirect(`${origin}/auth/signin?error=auth_failed`);
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
        console.error("Error upserting user:", error);
        // Continue anyway - user is authenticated even if DB insert fails
      }
    }
  }

  // Redirect to dashboard by default
  // Note: redirectTo from sessionStorage will be handled by client-side navigation
  // We can't access sessionStorage from server-side code
  return NextResponse.redirect(`${origin}/dashboard`);
}
