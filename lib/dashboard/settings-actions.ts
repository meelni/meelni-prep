export type SettingsLoadState = "idle" | "loading" | "ready" | "error";

export interface AccountDeletionResult {
  ok: boolean;
  error?: string;
}

type DashboardFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export function shouldShowSettingsLoading(loadState: SettingsLoadState) {
  return loadState === "idle" || loadState === "loading";
}

export async function requestAccountDeletion(
  fetcher: DashboardFetch = fetch
): Promise<AccountDeletionResult> {
  try {
    const response = await fetcher("/api/user/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirmation: "DELETE" }),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: "We could not delete the account. Please try again.",
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "We could not delete the account. Please try again.",
    };
  }
}
