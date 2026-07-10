import { NextRequest, NextResponse } from "next/server";
import { getAccountDeletionAuthDecision } from "@meelni/core";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";

import {
  markAccountDeletionFailed,
  requestAccountDeletionWithCurrentSubjects,
} from "@/lib/db/account-deletions";
import { inngest } from "@/lib/inngest/client";
import { createClient } from "@/lib/supabase/server";

const deletionRequestSchema = z
  .object({ confirmation: z.literal("DELETE") })
  .strict();

const REAUTHENTICATION_PATH =
  "/auth/signin?redirectTo=%2Fdashboard%2Fsettings%3Fsection%3Ddata-privacy";

/**
 * POST /api/user/delete
 *
 * Persists and queues an irreversible, retryable account deletion after a
 * server-verified recent sign-in. A 202 response means the request is durable;
 * it never means every provider has completed deletion synchronously.
 */
export async function POST(request: NextRequest) {
  const parsedBody = deletionRequestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "confirmation_required",
        message: "Type DELETE exactly to confirm account deletion.",
      },
      { status: 400 }
    );
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  let user: User | null = null;
  let authError: unknown;
  try {
    supabase = await createClient();
    const authResult = await supabase.auth.getUser();
    user = authResult.data.user;
    authError = authResult.error;
  } catch {
    console.error("Account deletion authentication check failed");
    return NextResponse.json(
      {
        error: "authentication_check_failed",
        message: "We could not verify your session. Please try again.",
      },
      { status: 503 }
    );
  }
  if (authError || !user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Sign in to delete your account." },
      { status: 401 }
    );
  }

  const authDecision = getAccountDeletionAuthDecision({
    lastSignInAt: user.last_sign_in_at,
  });
  if (!authDecision.allowed) {
    return NextResponse.json(
      {
        error: authDecision.reason,
        message: "Sign in again before deleting your account.",
        reauthenticateAt: REAUTHENTICATION_PATH,
      },
      { status: 409 }
    );
  }

  try {
    await requestAccountDeletionWithCurrentSubjects(user.id);

    let status: "deletion_requested" | "deletion_retry_scheduled" =
      "deletion_requested";
    try {
      await inngest.send({
        name: "account/deletion.requested",
        data: { userId: user.id },
      });
    } catch {
      status = "deletion_retry_scheduled";
      try {
        await markAccountDeletionFailed(user.id, "event_enqueue_failed");
      } catch {
        console.error("Account deletion retry state could not be recorded");
      }
    }

    try {
      await supabase.auth.signOut();
    } catch {
      // The middleware rejects any surviving session because the tombstone is
      // already durable. Do not turn a saved deletion request into false failure.
      console.error("Account deletion local sign-out did not complete");
    }

    return NextResponse.json(
      {
        status,
        message:
          status === "deletion_requested"
            ? "Deletion request saved. Account cleanup is in progress."
            : "Deletion request saved. Cleanup will retry automatically.",
      },
      { status: 202 }
    );
  } catch {
    console.error("Account deletion request could not be persisted");
    return NextResponse.json(
      {
        error: "account_deletion_request_failed",
        message: "We could not save the deletion request. Please try again.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: "confirmation_required",
      message: "Use the confirmation form to request account deletion.",
    },
    { status: 405, headers: { Allow: "POST" } }
  );
}
