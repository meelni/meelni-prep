"use client";

import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/app/providers/auth-provider";
import { useAnalyticsConsent } from "@/app/providers/analytics-consent-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DashboardLoadingState,
  DashboardSidebarNavItem,
} from "@/components/dashboard/dashboard-surface";
import { DashboardPage } from "@/components/dashboard/layout/dashboard-page";
import { SettingsNotice } from "@/components/dashboard/settings-notice";
import {
  SETTINGS_CATEGORY_LABELS,
  SETTINGS_CATEGORY_ORDER,
  initialsForUser,
  labelForDifficulty,
  labelForInterviewType,
  labelForQuestionRecency,
  normalizeDashboardSettings,
  type DashboardSettings,
  type SettingsCategoryId,
} from "@/lib/dashboard/settings-contracts";
import {
  requestAccountDeletion,
  requestAccountExport,
  shouldShowSettingsLoading,
  type AccountDeletionResult,
  type SettingsLoadState,
} from "@/lib/dashboard/settings-actions";
import { scrubRetiredTranscriptBrowserStorage } from "@/lib/privacy/transcript-browser-storage";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";
import { cn } from "@/lib/utils";

interface SubscriptionSummary {
  tier?: string;
  status?: string;
  planName?: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
}

interface CreditSummary {
  availableCredits?: number;
  reservedCredits?: number;
  nextCreditExpiresAt?: string | null;
}

type LoadState = SettingsLoadState;

export const SettingsSection = memo(function SettingsSection() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, session, signOut } = useAuth();
  const fallbackName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";
  const [activeCategory, setActiveCategory] =
    useState<SettingsCategoryId>("account");
  const [settings, setSettings] = useState<DashboardSettings>(() =>
    normalizeDashboardSettings(null, fallbackName)
  );
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<LoadState>("idle");
  const [billingState, setBillingState] = useState<LoadState>("idle");
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(
    null
  );
  const [credits, setCredits] = useState<CreditSummary | null>(null);

  useEffect(() => {
    const requestedCategory = searchParams.get("section");
    if (
      requestedCategory &&
      SETTINGS_CATEGORY_ORDER.includes(requestedCategory as SettingsCategoryId)
    ) {
      setActiveCategory(requestedCategory as SettingsCategoryId);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoadState("loading");

      try {
        const response = await fetch("/api/user/settings");

        if (!response.ok) {
          throw new Error("Failed to load settings");
        }

        const data = (await response.json()) as {
          settings?: Partial<DashboardSettings> | null;
        };

        if (!cancelled) {
          setSettings(normalizeDashboardSettings(data.settings, fallbackName));
          setLoadState("ready");
        }
      } catch (error) {
        console.error("settings_load_failed", {
          error_code: "SETTINGS_LOAD_FAILED",
          ...toSafeErrorLog(error),
        });

        if (!cancelled) {
          setSettings(normalizeDashboardSettings(null, fallbackName));
          setLoadState("error");
        }
      }
    }

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [fallbackName]);

  useEffect(() => {
    let cancelled = false;

    async function loadBilling() {
      setBillingState("loading");

      try {
        const [subscriptionResponse, creditsResponse] = await Promise.all([
          fetch("/api/billing/subscription"),
          fetch("/api/billing/credits"),
        ]);

        if (!subscriptionResponse.ok || !creditsResponse.ok) {
          throw new Error("Failed to load billing summary");
        }

        const [subscriptionData, creditData] = await Promise.all([
          subscriptionResponse.json() as Promise<SubscriptionSummary>,
          creditsResponse.json() as Promise<CreditSummary>,
        ]);

        if (!cancelled) {
          setSubscription(subscriptionData);
          setCredits(creditData);
          setBillingState("ready");
        }
      } catch (error) {
        console.error("billing_summary_load_failed", {
          error_code: "BILLING_SUMMARY_LOAD_FAILED",
          ...toSafeErrorLog(error),
        });

        if (!cancelled) {
          setBillingState("error");
        }
      }
    }

    loadBilling();

    return () => {
      cancelled = true;
    };
  }, []);

  const accountName = settings.displayName || fallbackName || "User";
  const signInMethod = useMemo(() => {
    const provider = user?.app_metadata?.provider;

    if (provider === "google") {
      return "Google sign-in";
    }

    if (provider === "email") {
      return "Email sign-in";
    }

    return "Email sign-in";
  }, [user?.app_metadata?.provider]);

  const updateSettings = (patch: Partial<DashboardSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
    setSaveState("idle");
  };

  const saveSettings = async () => {
    setSaveState("loading");

    try {
      const response = await fetch("/api/user/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      setSaveState("ready");
    } catch (error) {
      console.error("settings_save_failed", {
        error_code: "SETTINGS_SAVE_FAILED",
        ...toSafeErrorLog(error),
      });
      setSaveState("error");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  if (shouldShowSettingsLoading(loadState)) {
    return (
      <DashboardPage label="Settings">
        <DashboardLoadingState
          className="min-h-[420px]"
          label="Loading settings..."
        />
      </DashboardPage>
    );
  }

  return (
    <DashboardPage label="Settings" bodyClassName="px-0 py-0">
      <div className="flex min-h-full flex-col lg:flex-row">
        <aside className="border-dashboard-panel-border shrink-0 border-b px-6 py-6 sm:px-8 lg:w-64 lg:border-r lg:border-b-0">
          <p className="text-dashboard-muted text-xs font-bold tracking-[0.28em] uppercase">
            Settings
          </p>
          <nav
            aria-label="Settings"
            className="mt-5 flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible"
          >
            {SETTINGS_CATEGORY_ORDER.map((category) => {
              const selected = activeCategory === category;

              return (
                <DashboardSidebarNavItem
                  key={category}
                  selected={selected}
                  onClick={() => setActiveCategory(category)}
                >
                  <span>{SETTINGS_CATEGORY_LABELS[category]}</span>
                </DashboardSidebarNavItem>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 flex-1 px-6 py-6 sm:px-8 lg:px-9 lg:py-8">
          {loadState === "error" && (
            <SettingsNotice
              tone="warning"
              title="Using default settings"
              description="Saved settings could not be loaded. Changes you save from here will still use the supported settings API."
            />
          )}

          {activeCategory === "account" && (
            <AccountPane
              accountName={accountName}
              email={user?.email || ""}
              initials={initialsForUser(accountName, user?.email)}
              signInMethod={signInMethod}
              sessionStartedAt={
                session?.expires_at
                  ? "Signed in on this device"
                  : "Active session"
              }
              displayName={settings.displayName}
              onDisplayNameChange={(displayName) =>
                updateSettings({ displayName })
              }
              onSave={saveSettings}
              onSignOut={handleSignOut}
              saveState={saveState}
            />
          )}

          {activeCategory === "interview-defaults" && (
            <InterviewDefaultsPane
              settings={settings}
              onChange={updateSettings}
              onSave={saveSettings}
              saveState={saveState}
            />
          )}

          {activeCategory === "plan-credits" && (
            <PlanCreditsPane
              billingState={billingState}
              subscription={subscription}
              credits={credits}
            />
          )}

          {activeCategory === "notifications" && (
            <NotificationsPane
              settings={settings}
              onChange={updateSettings}
              onSave={saveSettings}
              saveState={saveState}
            />
          )}

          {activeCategory === "data-privacy" && (
            <DataPrivacyPane
              onReauthenticate={async (path) => {
                await signOut();
                window.location.href = path;
              }}
            />
          )}
        </section>
      </div>
    </DashboardPage>
  );
});

function AccountPane({
  accountName,
  email,
  initials,
  signInMethod,
  sessionStartedAt,
  displayName,
  onDisplayNameChange,
  onSave,
  onSignOut,
  saveState,
}: {
  accountName: string;
  email: string;
  initials: string;
  signInMethod: string;
  sessionStartedAt: string;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  onSave: () => void;
  onSignOut: () => void;
  saveState: LoadState;
}) {
  return (
    <PaneShell
      title="Account"
      description="Profile, login, and session controls."
      footer={<SettingsSaveFooter onSave={onSave} saveState={saveState} />}
    >
      <div className="divide-dashboard-panel-border border-dashboard-panel-border divide-y border-y">
        <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="border-primary/40 bg-primary/10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
              <span className="text-primary text-sm font-bold">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-dashboard-foreground truncate text-sm font-bold">
                {accountName}
              </p>
              <p className="text-dashboard-muted truncate text-sm">{email}</p>
            </div>
          </div>
          <div className="w-full sm:w-64">
            <Label htmlFor="display-name" className="sr-only">
              Display name
            </Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(event) => onDisplayNameChange(event.target.value)}
              placeholder="Display name"
              className="border-dashboard-panel-border text-dashboard-foreground placeholder:text-dashboard-muted bg-transparent"
            />
          </div>
        </div>

        <SettingsReadOnlyRow label="Target role" value="Not set yet" />
        <SettingsReadOnlyRow label="Interview timeline" value="Not set yet" />
      </div>

      <SettingsGroup label="Access">
        <SettingsActionRow
          title={signInMethod}
          description={email}
          actionLabel="Managed"
          disabled
        />
        <SettingsActionRow
          title="Password"
          description={
            signInMethod === "Google sign-in"
              ? "Managed by your Google account"
              : "Use password reset from the sign-in screen"
          }
          actionLabel="Reset"
          href="/auth/reset-password"
        />
        <SettingsActionRow
          title="Current session"
          description={sessionStartedAt}
          actionLabel="Sign out"
          onClick={onSignOut}
        />
      </SettingsGroup>
    </PaneShell>
  );
}

function InterviewDefaultsPane({
  settings,
  onChange,
  onSave,
  saveState,
}: SettingsPaneProps) {
  return (
    <PaneShell
      title="Interview defaults"
      description="Defaults used when you start a PM mock interview."
      footer={<SettingsSaveFooter onSave={onSave} saveState={saveState} />}
    >
      <SettingsSelectRow
        title="Default round"
        description="The PM interview style Meelni should preselect."
        value={settings.defaultInterviewType}
        valueLabel={labelForInterviewType(settings.defaultInterviewType)}
        onValueChange={(defaultInterviewType) =>
          onChange({
            defaultInterviewType:
              defaultInterviewType as DashboardSettings["defaultInterviewType"],
          })
        }
        options={[
          ["product_sense", "Product sense"],
          ["analytical", "Analytical"],
          ["behavioral", "Behavioral"],
          ["strategy", "Strategy"],
        ]}
      />
      <SettingsSelectRow
        title="Default difficulty"
        description="The starting challenge level for recommended interviews."
        value={settings.defaultDifficulty}
        valueLabel={labelForDifficulty(settings.defaultDifficulty)}
        onValueChange={(defaultDifficulty) =>
          onChange({
            defaultDifficulty:
              defaultDifficulty as DashboardSettings["defaultDifficulty"],
          })
        }
        options={[
          ["easy", "Easy"],
          ["medium", "Medium"],
          ["hard", "Hard"],
        ]}
      />
      <SettingsSelectRow
        title="Question recency"
        description="How current recommended company questions should be."
        value={settings.questionRecency}
        valueLabel={labelForQuestionRecency(settings.questionRecency)}
        onValueChange={(questionRecency) =>
          onChange({
            questionRecency:
              questionRecency as DashboardSettings["questionRecency"],
          })
        }
        options={[
          ["current", "Current interview loops"],
          ["recent", "Recent company questions"],
          ["all", "All available questions"],
        ]}
      />
    </PaneShell>
  );
}

function PlanCreditsPane({
  billingState,
  subscription,
  credits,
}: {
  billingState: LoadState;
  subscription: SubscriptionSummary | null;
  credits: CreditSummary | null;
}) {
  const [portalState, setPortalState] = useState<LoadState>("idle");

  const openBillingPortal = async () => {
    setPortalState("loading");

    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      const data = (await response.json()) as {
        portalUrl?: string;
        error?: string;
      };

      if (!response.ok || !data.portalUrl) {
        throw new Error(data.error || "Failed to open billing portal");
      }

      window.location.href = data.portalUrl;
    } catch (error) {
      console.error("billing_portal_open_failed", {
        error_code: "BILLING_PORTAL_OPEN_FAILED",
        ...toSafeErrorLog(error),
      });
      setPortalState("error");
    }
  };

  if (billingState === "loading") {
    return (
      <PaneShell
        title="Plan & credits"
        description="Current access and PM interview credit balance."
      >
        <DashboardLoadingState
          className="min-h-[280px]"
          label="Loading plan and credits..."
        />
      </PaneShell>
    );
  }

  return (
    <PaneShell
      title="Plan & credits"
      description="Current access and PM interview credit balance."
    >
      {billingState === "error" && (
        <SettingsNotice
          tone="warning"
          title="Billing summary unavailable"
          description="The billing endpoints did not respond. Use the billing portal or pricing page if you need to make account changes."
        />
      )}

      <div className="border-dashboard-panel-border grid gap-0 border-y md:grid-cols-3">
        <SummaryTile
          label="Plan"
          value={subscription?.planName || subscription?.tier || "Unavailable"}
          description={subscription?.status || "Current status not loaded"}
        />
        <SummaryTile
          label="Available credits"
          value={String(credits?.availableCredits ?? "0")}
          description={`${credits?.reservedCredits ?? 0} reserved`}
        />
        <SummaryTile
          label="Next expiration"
          value={formatDateLabel(credits?.nextCreditExpiresAt)}
          description={
            subscription?.cancelAtPeriodEnd
              ? "Subscription ending"
              : "Credit-based access"
          }
        />
      </div>

      <SettingsGroup label="Billing actions">
        {portalState === "error" && (
          <div className="py-4">
            <SettingsNotice
              tone="warning"
              title="Billing portal unavailable"
              description="The portal could not be opened for this account. Pricing is still available if you need to add credits."
            />
          </div>
        )}
        <SettingsActionRow
          title="Manage billing"
          description="Open the billing portal for payment methods, invoices, and subscription changes."
          actionLabel={portalState === "loading" ? "Opening" : "Open"}
          onClick={openBillingPortal}
          disabled={portalState === "loading"}
        />
        <SettingsActionRow
          title="Add interview credits"
          description="Choose an Interview Pass, Starter, or Pro credit plan."
          actionLabel="Pricing"
          href="/pricing"
        />
      </SettingsGroup>
    </PaneShell>
  );
}

function NotificationsPane({
  settings,
  onChange,
  onSave,
  saveState,
}: SettingsPaneProps) {
  return (
    <PaneShell
      title="Notifications"
      description="Emails tied to completed interviews and progress signals."
      footer={<SettingsSaveFooter onSave={onSave} saveState={saveState} />}
    >
      <SettingsSwitchRow
        title="Email notifications"
        description="Allow Meelni to send account and practice emails."
        checked={settings.emailNotifications}
        onCheckedChange={(emailNotifications) =>
          onChange({ emailNotifications })
        }
      />
      <SettingsSwitchRow
        title="Session completion email"
        description="Send a confirmation when a PM mock interview is complete."
        checked={settings.sessionCompletionEmail}
        disabled={!settings.emailNotifications}
        onCheckedChange={(sessionCompletionEmail) =>
          onChange({ sessionCompletionEmail })
        }
      />
      <SettingsSwitchRow
        title="Feedback ready email"
        description="Notify you when calibrated feedback is available."
        checked={settings.feedbackReadyEmail}
        disabled={!settings.emailNotifications}
        onCheckedChange={(feedbackReadyEmail) =>
          onChange({ feedbackReadyEmail })
        }
      />
      <SettingsSwitchRow
        title="Weekly progress report"
        description="Send a weekly digest of recent score trends and practice focus."
        checked={settings.weeklyProgressReport}
        disabled={!settings.emailNotifications}
        onCheckedChange={(weeklyProgressReport) =>
          onChange({ weeklyProgressReport })
        }
      />
    </PaneShell>
  );
}

function DataPrivacyPane({
  onReauthenticate,
}: {
  onReauthenticate: (path: string) => Promise<void>;
}) {
  const [exportState, setExportState] = useState<
    "idle" | "loading" | "success" | "reauthentication_required" | "error"
  >("idle");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportReauthenticateAt, setExportReauthenticateAt] = useState<
    string | null
  >(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleteState, setDeleteState] = useState<
    AccountDeletionResult["state"] | "idle" | "submitting"
  >("idle");
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [reauthenticateAt, setReauthenticateAt] = useState<string | null>(null);
  const {
    accountSyncPending,
    decision: analyticsDecision,
    error: analyticsError,
    retryAccountSync,
    savingDecision,
    setConsent: setAnalyticsConsent,
  } = useAnalyticsConsent();
  const analyticsSaving = savingDecision !== null;

  const handleAccountExport = async () => {
    setExportState("loading");
    setExportMessage(null);
    setExportReauthenticateAt(null);
    const result = await requestAccountExport();
    if (!result.ok) {
      setExportState(result.state);
      setExportMessage(result.error);
      if (result.state === "reauthentication_required") {
        setExportReauthenticateAt(result.reauthenticateAt);
      }
      return;
    }

    const url = URL.createObjectURL(result.file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.filename;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setExportState("success");
    setExportMessage(
      "Your JSON export was prepared. It does not change or delete account data."
    );
  };

  const handleDeleteAccount = async () => {
    setDeleteState("submitting");
    setDeleteMessage(null);
    setReauthenticateAt(null);
    const result = await requestAccountDeletion(confirmation);
    if (result.state === "requested" || result.state === "retry_scheduled") {
      scrubRetiredTranscriptBrowserStorage();
    }
    setDeleteState(result.state);
    setDeleteMessage(result.message);
    if (result.state === "reauthentication_required") {
      setReauthenticateAt(result.reauthenticateAt);
    }
  };

  return (
    <PaneShell
      title="Data & privacy"
      description="How interview data is handled, plus export and deletion actions."
    >
      <SettingsGroup label="Interview data">
        <SettingsReadOnlyRow
          label="Transcript text"
          value="Stored for feedback and review"
        />
        <SettingsReadOnlyRow
          label="Interview audio"
          value="Processed live by configured voice providers; no replayable interview recording is created or stored in the Meelni application"
        />
      </SettingsGroup>

      <SettingsGroup label="Optional analytics">
        <div className="border-dashboard-panel-border flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-dashboard-foreground text-sm font-medium">
              Product usage analytics
            </p>
            <p className="text-dashboard-muted max-w-xl text-sm">
              {analyticsDecision === "accepted"
                ? "Allowed. Meelni may send minimized usage events to PostHog and Statsig."
                : analyticsDecision === "declined"
                  ? "Off. Optional analytics providers do not initialize."
                  : "Not decided. Optional analytics remain off."}
            </p>
            <p className="text-dashboard-muted text-xs">
              Session replay is disabled. Interview audio, transcripts,
              questions, and answers are never included in analytics events.
            </p>
            {analyticsError && (
              <p className="text-destructive text-xs" role="alert">
                {analyticsError}
              </p>
            )}
            {accountSyncPending && (
              <Button
                type="button"
                size="sm"
                variant="link"
                className="h-auto px-0 text-xs"
                disabled={analyticsSaving}
                onClick={() => void retryAccountSync()}
              >
                Retry account sync
              </Button>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={analyticsSaving || analyticsDecision === "declined"}
              onClick={() => void setAnalyticsConsent("declined", "settings")}
            >
              {savingDecision === "declined" ? "Turning off..." : "Turn off"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={analyticsSaving || analyticsDecision === "accepted"}
              onClick={() => void setAnalyticsConsent("accepted", "settings")}
            >
              {savingDecision === "accepted" ? "Enabling..." : "Allow"}
            </Button>
          </div>
        </div>
      </SettingsGroup>

      {exportMessage && (
        <SettingsNotice
          title={
            exportState === "success"
              ? "Export prepared"
              : exportState === "reauthentication_required"
                ? "Sign in again"
                : "Export failed"
          }
          description={exportMessage}
          tone={exportState === "success" ? "success" : "warning"}
          announce={exportState === "success" ? "polite" : "assertive"}
          focusOnMount={exportState === "reauthentication_required"}
          action={
            exportState === "reauthentication_required" &&
            exportReauthenticateAt ? (
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  try {
                    await onReauthenticate(exportReauthenticateAt);
                  } catch {
                    setExportState("error");
                    setExportMessage(
                      "We could not sign you out for reauthentication. Please try again."
                    );
                  }
                }}
              >
                Sign in again
              </Button>
            ) : undefined
          }
        />
      )}

      {exportState === "loading" && (
        <span className="sr-only" role="status" aria-live="polite">
          Preparing your account data export.
        </span>
      )}

      <SettingsGroup label="Account data">
        <SettingsActionRow
          title="Data export"
          description="Download a versioned JSON copy of your profile, PM interview practice, feedback, preferences, and user-facing billing history. Provider secrets and raw operational payloads are excluded."
          actionLabel={exportState === "loading" ? "Preparing" : "Download"}
          onClick={handleAccountExport}
          disabled={exportState === "loading"}
        />
        <SettingsActionRow
          title="Delete account"
          description="Request account cleanup. You will be signed out while Meelni completes retryable authentication, billing-resource, and application-data steps."
          actionLabel="Delete"
          onClick={() => {
            setConfirmation("");
            setDeleteState("idle");
            setDeleteMessage(null);
            setDeleteDialogOpen(true);
          }}
          destructive
        />
      </SettingsGroup>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="border-dashboard-panel-border bg-dashboard-panel text-dashboard-foreground sm:max-w-xl">
          <DialogHeader>
            <div className="bg-destructive/10 text-destructive mb-3 flex h-10 w-10 items-center justify-center rounded-full">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle>Request account deletion</DialogTitle>
            <DialogDescription className="text-dashboard-muted leading-6">
              This stores a durable deletion request, signs you out, and starts
              retryable cleanup for your authentication account, captured
              billing-provider resources, interviews, transcripts, feedback,
              settings, and progress. The request cannot be undone after it is
              accepted. If you have a paid subscription, deletion ends access
              immediately and does not create an automatic proration, refund, or
              Stripe account credit; exceptional refund requests require
              separate support review. Limited security, deletion-audit, backup,
              and legally required billing records may be retained; Meelni does
              not claim a fixed deletion period for those records yet.
            </DialogDescription>
          </DialogHeader>

          {(deleteState === "requested" ||
            deleteState === "retry_scheduled") && (
            <SettingsNotice
              title={
                deleteState === "requested"
                  ? "Deletion request saved"
                  : "Deletion request saved; cleanup delayed"
              }
              description={
                deleteMessage ??
                "Your request is durable and cleanup will continue in the background."
              }
              tone={deleteState === "requested" ? "success" : "warning"}
              announce="polite"
              focusOnMount
            />
          )}

          {deleteState === "reauthentication_required" && (
            <SettingsNotice
              title="Sign in again"
              description={
                deleteMessage ??
                "For your security, account deletion requires a recent sign-in."
              }
              tone="warning"
              announce="assertive"
              focusOnMount
            />
          )}

          {deleteState === "error" && (
            <SettingsNotice
              title="Deletion request not saved"
              description={
                deleteMessage ??
                "We could not save the request. Review your connection and try again."
              }
              tone="warning"
              announce="assertive"
              focusOnMount
            />
          )}

          {deleteState !== "requested" &&
            deleteState !== "retry_scheduled" &&
            deleteState !== "reauthentication_required" && (
              <div className="space-y-2">
                <Label htmlFor="delete-confirmation">
                  Type DELETE to confirm
                </Label>
                <Input
                  id="delete-confirmation"
                  autoComplete="off"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="DELETE"
                  disabled={deleteState === "submitting"}
                  className="border-dashboard-panel-border bg-transparent"
                />
              </div>
            )}

          <DialogFooter className="gap-2 sm:space-x-0">
            {deleteState === "submitting" && (
              <span className="sr-only" role="status" aria-live="polite">
                Saving your account deletion request.
              </span>
            )}
            {deleteState === "requested" ||
            deleteState === "retry_scheduled" ? (
              <Button
                type="button"
                onClick={() => (window.location.href = "/")}
              >
                Return to home
              </Button>
            ) : deleteState === "reauthentication_required" ? (
              <>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  onClick={async () => {
                    if (!reauthenticateAt) return;
                    try {
                      await onReauthenticate(reauthenticateAt);
                    } catch {
                      setDeleteState("error");
                      setDeleteMessage(
                        "We could not sign you out for reauthentication. Please try again."
                      );
                    }
                  }}
                >
                  Sign in again
                </Button>
              </>
            ) : (
              <>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={deleteState === "submitting"}
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={
                    confirmation !== "DELETE" || deleteState === "submitting"
                  }
                  className="gap-2"
                >
                  {deleteState === "submitting" && (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  Request deletion
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PaneShell>
  );
}

interface SettingsPaneProps {
  settings: DashboardSettings;
  onChange: (patch: Partial<DashboardSettings>) => void;
  onSave: () => void;
  saveState: LoadState;
}

function PaneShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-7">
      <div className="border-dashboard-panel-border border-b pb-5">
        <h2 className="font-display text-dashboard-foreground text-3xl leading-tight font-semibold">
          {title}
        </h2>
        <p className="text-dashboard-muted mt-2 text-sm leading-6">
          {description}
        </p>
      </div>
      <div className="space-y-7">{children}</div>
      {footer}
    </div>
  );
}

function SettingsGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section>
      <p className="text-dashboard-muted text-xs font-bold tracking-[0.28em] uppercase">
        {label}
      </p>
      <div className="divide-dashboard-panel-border border-dashboard-panel-border mt-4 divide-y border-y">
        {children}
      </div>
    </section>
  );
}

function SettingsReadOnlyRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <p className="text-dashboard-foreground text-sm font-semibold">{label}</p>
      <p className="text-dashboard-muted text-sm sm:text-right">{value}</p>
    </div>
  );
}

function SettingsActionRow({
  title,
  description,
  actionLabel,
  href,
  disabled,
  destructive,
  onClick,
}: {
  title: string;
  description: string;
  actionLabel: string;
  href?: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick?: () => void;
}) {
  const actionClassName = cn(
    "border-dashboard-panel-border h-8 rounded-lg bg-transparent px-3 text-xs font-bold text-dashboard-foreground hover:bg-dashboard-muted/15 hover:text-dashboard-foreground",
    destructive &&
      "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
  );

  return (
    <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-dashboard-foreground text-sm font-bold">{title}</p>
        <p className="text-dashboard-muted mt-1 text-sm leading-5">
          {description}
        </p>
      </div>
      {href && !disabled ? (
        <Button asChild variant="outline" size="sm" className={actionClassName}>
          <Link href={href}>
            {actionLabel}
            <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={actionClassName}
          disabled={disabled}
          onClick={onClick}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

function SettingsSwitchRow({
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="border-dashboard-panel-border flex items-center justify-between gap-6 border-y py-4 first:border-t-0 last:border-b-0">
      <div className="min-w-0">
        <p className="text-dashboard-foreground text-sm font-bold">{title}</p>
        <p className="text-dashboard-muted mt-1 text-sm leading-5">
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={title}
        className="data-[state=unchecked]:bg-dashboard-muted/20"
      />
    </div>
  );
}

function SettingsSelectRow({
  title,
  description,
  value,
  valueLabel,
  options,
  onValueChange,
}: {
  title: string;
  description: string;
  value: string;
  valueLabel: string;
  options: [string, string][];
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="border-dashboard-panel-border flex flex-col gap-4 border-y py-4 first:border-t-0 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-dashboard-foreground text-sm font-bold">{title}</p>
        <p className="text-dashboard-muted mt-1 text-sm leading-5">
          {description}
        </p>
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="border-dashboard-panel-border text-dashboard-foreground bg-transparent sm:w-64">
          <SelectValue placeholder={valueLabel} />
        </SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, label]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SettingsSaveFooter({
  onSave,
  saveState,
}: {
  onSave: () => void;
  saveState: LoadState;
}) {
  return (
    <div className="border-dashboard-panel-border flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-dashboard-muted text-sm">
        Changes save to the existing settings API.
      </p>
      <div className="flex items-center gap-3">
        {saveState === "ready" && (
          <span className="text-success inline-flex items-center gap-1.5 text-sm">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Saved
          </span>
        )}
        {saveState === "error" && (
          <span className="text-destructive text-sm">Save failed</span>
        )}
        <Button
          type="button"
          onClick={onSave}
          disabled={saveState === "loading"}
          className="gap-2"
        >
          {saveState === "loading" && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          Save changes
        </Button>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="border-dashboard-panel-border py-5 md:border-r md:px-5 md:last:border-r-0">
      <p className="text-dashboard-muted text-xs font-bold tracking-[0.24em] uppercase">
        {label}
      </p>
      <p className="text-dashboard-foreground mt-3 text-2xl font-semibold">
        {value}
      </p>
      <p className="text-dashboard-muted mt-1 text-sm">{description}</p>
    </div>
  );
}

function formatDateLabel(value?: string | null) {
  if (!value) {
    return "None";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
