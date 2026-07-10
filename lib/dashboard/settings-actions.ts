import { getSafeInternalRedirect } from "@/lib/auth/safe-redirect";

export type SettingsLoadState = "idle" | "loading" | "ready" | "error";

export type AccountDeletionResult =
  | { state: "requested" | "retry_scheduled"; message: string }
  | {
      state: "reauthentication_required";
      message: string;
      reauthenticateAt: string;
    }
  | { state: "error"; message: string; retryable: true };

export type AccountExportResult =
  | { ok: true; file: Blob; filename: string }
  | { ok: false; error: string };

type DashboardFetch = (input: string, init?: RequestInit) => Promise<Response>;

export function shouldShowSettingsLoading(loadState: SettingsLoadState) {
  return loadState === "idle" || loadState === "loading";
}

export async function requestAccountDeletion(
  confirmation: string,
  fetcher: DashboardFetch = fetch
): Promise<AccountDeletionResult> {
  try {
    const response = await fetcher("/api/user/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      status?: string;
      message?: string;
      error?: string;
      reauthenticateAt?: string;
    };

    if (response.status === 409 && body.error === "reauthentication_required") {
      const fallback =
        "/auth/signin?redirectTo=%2Fdashboard%2Fsettings%3Fsection%3Ddata-privacy";
      return {
        state: "reauthentication_required",
        message: body.message ?? "Sign in again before deleting your account.",
        reauthenticateAt: getSafeInternalRedirect(
          body.reauthenticateAt,
          fallback
        )!,
      };
    }

    if (response.status === 202 && body.status === "deletion_requested") {
      return {
        state: "requested",
        message:
          body.message ??
          "Deletion request saved. Account cleanup is in progress.",
      };
    }

    if (response.status === 202 && body.status === "deletion_retry_scheduled") {
      return {
        state: "retry_scheduled",
        message:
          body.message ??
          "Deletion request saved. Cleanup will retry automatically.",
      };
    }

    return {
      state: "error",
      message:
        body.message ??
        "We could not save the deletion request. Please try again.",
      retryable: true,
    };
  } catch {
    return {
      state: "error",
      message:
        "We could not reach Meelni. Check your connection and try again.",
      retryable: true,
    };
  }
}

export async function requestAccountExport(
  fetcher: DashboardFetch = fetch
): Promise<AccountExportResult> {
  try {
    const response = await fetcher("/api/user/export", { method: "GET" });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      return {
        ok: false,
        error:
          body.message ?? "We could not prepare your export. Please try again.",
      };
    }

    return {
      ok: true,
      file: await response.blob(),
      filename: exportFilename(response.headers.get("content-disposition")),
    };
  } catch {
    return {
      ok: false,
      error: "We could not reach Meelni. Check your connection and try again.",
    };
  }
}

function exportFilename(contentDisposition: string | null) {
  const match = contentDisposition?.match(/filename="([^"\\/]+)"/i);
  return match?.[1] ?? "meelni-account-data.json";
}
