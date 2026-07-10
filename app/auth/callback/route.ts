import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { AccountDeletionPendingError, upsertUser } from "@/lib/db/users";
import { buildSafeInternalRedirectUrl } from "@/lib/auth/safe-redirect";
import {
  buildAuthFailureHref,
  resolveAuthCallbackAction,
} from "@/lib/auth/auth-handoff";
import {
  readOperationalRequestId,
  reportOperationalFailure,
} from "@/lib/operations/operational-events";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;
  const next = requestUrl.searchParams.get("next");
  const cancelTo = requestUrl.searchParams.get("cancelTo");
  const callbackAction = resolveAuthCallbackAction(requestUrl.searchParams);

  if (callbackAction.type === "cancel") {
    return NextResponse.redirect(
      buildSafeInternalRedirectUrl(origin, callbackAction.destination, "/")
    );
  }

  if (callbackAction.type === "failure" || !code) {
    return NextResponse.redirect(
      new URL(
        buildAuthFailureHref(
          {
            redirectTo: next ?? undefined,
            cancelTo: cancelTo ?? undefined,
          },
          "auth_callback_failed"
        ),
        origin
      )
    );
  }

  if (callbackAction.type === "success") {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      reportOperationalFailure({
        operation: "auth_callback",
        errorCode: "auth_code_exchange_failed",
        severity: "warning",
        retryable: true,
        requestId: readOperationalRequestId(request),
      });
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
            new URL(
              buildAuthFailureHref(
                {
                  redirectTo: next ?? undefined,
                  cancelTo: cancelTo ?? undefined,
                },
                "account_deletion_pending"
              ),
              origin
            )
          );
        }
        reportOperationalFailure({
          operation: "auth_callback",
          errorCode: "auth_user_upsert_failed",
          severity: "critical",
          retryable: true,
          requestId: readOperationalRequestId(request),
        });
        // Continue anyway - user is authenticated even if DB insert fails
      }
    }
  }

  return NextResponse.redirect(
    buildSafeInternalRedirectUrl(origin, callbackAction.destination)
  );
}
