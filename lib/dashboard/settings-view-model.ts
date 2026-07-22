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
  return [
    {
      label: "Plan",
      value: subscription?.planName || subscription?.tier || "Unavailable",
      description: subscription?.status || "Current status not loaded",
    },
    {
      label: "Available credits",
      value: String(credits?.availableCredits ?? "0"),
      description: `${credits?.reservedCredits ?? 0} reserved`,
    },
    {
      label: "Next expiration",
      value: formatSettingsDateLabel(credits?.nextCreditExpiresAt),
      description: subscription?.cancelAtPeriodEnd
        ? "Subscription ending"
        : "Credit-based access",
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
