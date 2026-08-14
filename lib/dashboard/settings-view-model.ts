import {
  SETTINGS_CATEGORY_LABELS,
  SETTINGS_CATEGORY_ORDER,
  initialsForUser,
  type DashboardSettings,
  type SettingsCategoryId,
} from "./settings-contracts";

export interface SettingsNavItem {
  id: SettingsCategoryId;
  label: string;
}

export interface SettingsAccountViewModel {
  accountName: string;
  email: string;
  initials: string;
  signInMethod: string;
  sessionStartedAt: string;
  displayName: string;
}

export interface SettingsSubscriptionSummary {
  tier?: string;
  status?: string;
  planName?: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  portalAvailable?: boolean;
}

export interface SettingsCreditSummary {
  availableCredits?: number;
  reservedCredits?: number;
  nextCreditExpiresAt?: string | null;
}

export interface SettingsSummaryTile {
  label: string;
  value: string;
  description: string;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] =
  SETTINGS_CATEGORY_ORDER.map((id) => ({
    id,
    label: SETTINGS_CATEGORY_LABELS[id],
  }));

export function canOpenBillingPortal(
  subscription: SettingsSubscriptionSummary | null
) {
  return subscription?.portalAvailable === true;
}

export function resolveSettingsCategory(
  value: string | null | undefined,
  fallback: SettingsCategoryId = "account"
): SettingsCategoryId {
  if (value && SETTINGS_CATEGORY_ORDER.includes(value as SettingsCategoryId)) {
    return value as SettingsCategoryId;
  }

  return fallback;
}

export function buildSettingsAccountViewModel({
  settings,
  fallbackName,
  email,
  provider,
  sessionExpiresAt,
}: {
  settings: DashboardSettings;
  fallbackName: string;
  email?: string | null;
  provider?: string | null;
  sessionExpiresAt?: number | null;
}): SettingsAccountViewModel {
  const accountName = settings.displayName || fallbackName || "User";
  const normalizedEmail = email || "";

  return {
    accountName,
    email: normalizedEmail,
    initials: initialsForUser(accountName, normalizedEmail),
    signInMethod: labelForSignInProvider(provider),
    sessionStartedAt: sessionExpiresAt
      ? "Signed in on this device"
      : "Active session",
    displayName: settings.displayName,
  };
}

export function buildSettingsPlanSummary({
  subscription,
  credits,
}: {
  subscription: SettingsSubscriptionSummary | null;
  credits: SettingsCreditSummary | null;
}): SettingsSummaryTile[] {
  const nextExpiration = formatSettingsDateLabel(credits?.nextCreditExpiresAt);
  const availableCredits = credits?.availableCredits ?? 0;
  const reservedCredits = credits?.reservedCredits ?? 0;
  const periodEnd = formatSettingsDateLabel(subscription?.currentPeriodEnd);

  return [
    {
      label: "Plan",
      value: subscription?.planName || subscription?.tier || "Unavailable",
      description: formatPlanTiming({
        status: subscription?.status,
        periodEnd,
        cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd,
      }),
    },
    {
      label: "Available credits",
      value: `${availableCredits} credit${availableCredits === 1 ? "" : "s"}`,
      description:
        reservedCredits === 0
          ? "None reserved"
          : `${reservedCredits} reserved for an interview`,
    },
    {
      label: "Next expiration",
      value: nextExpiration,
      description:
        nextExpiration === "None"
          ? "No credits currently expire"
          : subscription?.cancelAtPeriodEnd
            ? "Plan scheduled to end"
            : "Earliest credit expiration",
    },
  ];
}

export function formatSettingsDateLabel(value?: string | null) {
  if (!value) {
    return "None";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function labelForSignInProvider(provider?: string | null) {
  if (provider === "google") {
    return "Google sign-in";
  }

  return "Email sign-in";
}

function formatSettingsStatus(value?: string | null) {
  if (!value) {
    return "Current status not loaded";
  }

  return value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatPlanTiming({
  status,
  periodEnd,
  cancelAtPeriodEnd,
}: {
  status?: string | null;
  periodEnd: string;
  cancelAtPeriodEnd?: boolean;
}) {
  const statusLabel = formatSettingsStatus(status);
  if (periodEnd === "None") return statusLabel;
  if (cancelAtPeriodEnd) return `${statusLabel} · Ends ${periodEnd}`;
  return `${statusLabel} · Renews ${periodEnd}`;
}
