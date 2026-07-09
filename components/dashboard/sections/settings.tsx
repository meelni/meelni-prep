"use client";

import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/app/providers/auth-provider";
import { Button } from "@/components/ui/button";
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
  shouldShowSettingsLoading,
  type SettingsLoadState,
} from "@/lib/dashboard/settings-actions";
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
        console.error("Failed to load settings:", error);

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
        console.error("Failed to load billing summary:", error);

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
      console.error("Failed to save settings:", error);
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
            <InlineNotice
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
              settings={settings}
              onChange={updateSettings}
              onSave={saveSettings}
              saveState={saveState}
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
      <SettingsSwitchRow
        title="Save transcripts"
        description="Keep transcripts available for feedback review."
        checked={settings.saveTranscripts}
        onCheckedChange={(saveTranscripts) => onChange({ saveTranscripts })}
      />
      <SettingsSwitchRow
        title="Auto-save transcripts"
        description="Store completed interview transcripts without asking each time."
        checked={settings.autoSaveTranscripts}
        onCheckedChange={(autoSaveTranscripts) =>
          onChange({ autoSaveTranscripts })
        }
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
      console.error("Failed to open billing portal:", error);
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
        <InlineNotice
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
            <InlineNotice
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
  settings,
  onChange,
  onSave,
  saveState,
}: SettingsPaneProps) {
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    setDeleteError(null);

    const confirmed = window.confirm(
      "Delete your account and all interview data? This cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    const userInput = window.prompt("Type DELETE to confirm account deletion.");

    if (userInput !== "DELETE") {
      return;
    }

    const result = await requestAccountDeletion();

    if (!result.ok) {
      setDeleteError(
        result.error ?? "We could not delete the account. Please try again."
      );
      return;
    }

    window.location.href = "/";
  };

  return (
    <PaneShell
      title="Data & privacy"
      description="Transcript storage, product improvement, and account data actions."
      footer={<SettingsSaveFooter onSave={onSave} saveState={saveState} />}
    >
      <SettingsSwitchRow
        title="Save transcripts"
        description="Store transcripts so prior interviews can be reviewed later."
        checked={settings.saveTranscripts}
        onCheckedChange={(saveTranscripts) => onChange({ saveTranscripts })}
      />
      <SettingsSwitchRow
        title="Share anonymous product data"
        description="Help improve Meelni with de-identified usage patterns."
        checked={settings.shareAnonymousData}
        onCheckedChange={(shareAnonymousData) =>
          onChange({ shareAnonymousData })
        }
      />

      {deleteError && (
        <InlineNotice
          title="Deletion failed"
          description={deleteError}
          tone="warning"
        />
      )}

      <SettingsGroup label="Account data">
        <SettingsActionRow
          title="Data export"
          description="Automated export is not available in this first pass."
          actionLabel="Future"
          disabled
        />
        <SettingsActionRow
          title="Delete account"
          description="Permanently delete account data, transcripts, billing records, and progress."
          actionLabel="Delete"
          onClick={handleDeleteAccount}
          destructive
        />
      </SettingsGroup>
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
    <div className="flex items-center justify-between gap-6 py-4">
      <p className="text-dashboard-foreground text-sm font-semibold">{label}</p>
      <p className="text-dashboard-muted text-right text-sm">{value}</p>
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

function InlineNotice({
  title,
  description,
  tone = "default",
}: {
  title: string;
  description: string;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={cn(
        "border-dashboard-panel-border bg-dashboard-muted/10 mb-6 flex gap-3 rounded-lg border p-4",
        tone === "warning" && "border-warning/30 bg-warning/10"
      )}
    >
      <AlertTriangle
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          tone === "warning" ? "text-warning" : "text-dashboard-muted"
        )}
        aria-hidden="true"
      />
      <div>
        <p className="text-dashboard-foreground text-sm font-bold">{title}</p>
        <p className="text-dashboard-muted mt-1 text-sm leading-5">
          {description}
        </p>
      </div>
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
