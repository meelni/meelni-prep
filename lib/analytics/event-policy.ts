import { sanitizeAnalyticsPath } from "./privacy";
import { LEGACY_INTERVIEW_LAUNCH_EVENTS } from "./types";

const ALLOWED_PROPERTIES: Record<string, readonly string[]> = {
  landing_page_viewed: [],
  cta_clicked: ["location", "destination"],
  demo_modal_opened: ["trigger_source"],
  demo_modal_closed: [
    "duration_seconds",
    "completed",
    "agent_joined",
    "user_spoke",
  ],
  demo_completed: ["duration_seconds", "turn_count"],
  demo_mic_toggled: ["new_state", "time_in_demo_seconds"],
  demo_failed: ["stage", "error_code", "retryable"],
  demo_conversion_clicked: ["destination", "duration_seconds", "turn_count"],
  explore_page_viewed: ["total_questions"],
  explore_cta_clicked: ["cta_position"],
  explore_cta_dismissed: ["cta_position"],
  explore_search: ["results_count"],
  explore_filter_type: ["filter_type", "results_count"],
  explore_question_clicked: ["question_type", "company", "page"],
  explore_page_changed: ["page", "total_pages"],
  auth_signup_started: ["source"],
  auth_signup_completed: ["method"],
  auth_signup_failed: ["method", "error_code"],
  auth_signin_started: ["source"],
  auth_signin_completed: ["method"],
  auth_signin_failed: ["method", "error_code"],
  auth_signout_completed: [],
  auth_password_reset_requested: [],
  auth_error: ["error_code", "auth_method"],
  setup_started: ["user_authenticated"],
  interview_type_selected: ["interview_type"],
  skill_level_selected: [
    "skill_level",
    "interview_type",
    "is_default_selection",
  ],
  setup_completed: [
    "interview_type",
    "skill_level",
    "mode",
    "time_to_complete_seconds",
    "selections_changed",
  ],
  new_interview_launcher_viewed: [
    "source",
    "recommended_round_type",
    "recommended_difficulty",
    "recommendation_source",
    "entry_source",
  ],
  new_interview_recommendation_accepted: [
    "recommended_round_type",
    "recommended_difficulty",
    "recommendation_source",
    "entry_source",
  ],
  new_interview_recommendation_changed: [
    "field",
    "value",
    "recommended_round_type",
    "recommended_difficulty",
    "entry_source",
  ],
  new_interview_start_attempted: [
    "interview_type",
    "skill_level",
    "recommendation_source",
    "accepted_recommendation",
    "entry_source",
  ],
  new_interview_start_succeeded: [
    "interview_type",
    "skill_level",
    "entry_source",
  ],
  new_interview_start_failed: [
    "interview_type",
    "skill_level",
    "error_code",
    "entry_source",
  ],
  interview_started: ["interview_type", "mode", "skill_level"],
  interview_deadline_reached: ["interview_type"],
  interview_ended: ["duration_seconds", "ended_naturally", "interview_type"],
  interview_completed: ["duration_seconds", "turn_count"],
  interview_error: ["error_code"],
  mic_toggled: ["new_state"],
  hint_mode_changed: ["hint_mode", "interview_type"],
  hint_dismissed: ["hint_type", "hint_mode"],
  dashboard_viewed: ["section"],
  ftue_cta_clicked: [],
  ftue_viewed: [],
  session_history_viewed: ["section", "total_sessions", "has_feedback"],
  session_details_clicked: [
    "interview_type",
    "session_age_days",
    "has_feedback",
  ],
  feedback_viewed: ["feedback_available", "overall_score"],
  chart_interacted: ["chart_type", "interaction_type", "time_spent_seconds"],
  competency_radar_viewed: [
    "competencies_count",
    "has_scores",
    "avg_competency_score",
  ],
  score_trend_analyzed: ["time_range", "sessions_in_range", "trend_direction"],
  billing_credit_granted: billingProperties(),
  billing_credit_reserved: billingProperties(),
  billing_credit_consumed: billingProperties(),
  billing_credit_released: billingProperties(),
  billing_credit_refunded: billingProperties(),
  billing_credit_expired: billingProperties(),
  billing_credit_rollover_created: billingProperties(),
  billing_no_credits: billingProperties(),
  page_performance: ["page", "lcp", "fid", "cls", "ttfb", "fcp"],
  livekit_connection_established: [
    "connection_time_ms",
    "region",
    "connection_quality",
  ],
  error_boundary_triggered: ["error_code", "page"],
  public_demo_authorization: ["outcome", "reason"],
};

const EVENT_POLICY_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(LEGACY_INTERVIEW_LAUNCH_EVENTS).map(
    ([canonicalEvent, legacyEvent]) => [legacyEvent, canonicalEvent]
  )
);

const PATH_KEYS = new Set(["destination", "page"]);
const ERROR_KEYS = new Set(["error_code"]);

export function sanitizeAnalyticsEventProperties(
  event: string,
  properties: Record<string, unknown>
): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  const policyEvent = EVENT_POLICY_ALIASES[event] ?? event;
  for (const key of ALLOWED_PROPERTIES[policyEvent] ?? []) {
    const value = properties[key];
    if (value === undefined || value === null) continue;
    const normalized = normalizeValue(key, value);
    if (normalized !== null) output[key] = normalized;
  }
  return output;
}

export function hasAnalyticsEventPolicy(event: string): boolean {
  return (EVENT_POLICY_ALIASES[event] ?? event) in ALLOWED_PROPERTIES;
}

export function toSafeAnalyticsErrorCode(error: unknown): string {
  const candidate =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.name
        : "unexpected_error";
  const token = candidate.trim().toLowerCase();
  return /^[a-z][a-z0-9_]{0,63}$/.test(token) ? token : "unexpected_error";
}

export function sanitizeAnalyticsTraits(
  traits: Record<string, unknown>
): Record<string, string> {
  const signupMethod = normalizeToken(traits.signup_method);
  return signupMethod ? { signup_method: signupMethod } : {};
}

function normalizeValue(
  key: string,
  value: unknown
): string | number | boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? Math.max(-1_000_000, Math.min(value, 1_000_000))
      : null;
  }
  if (PATH_KEYS.has(key)) return sanitizeAnalyticsPath(String(value)) ?? null;
  if (ERROR_KEYS.has(key)) return toSafeAnalyticsErrorCode(value);
  return normalizeToken(value);
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return normalized || null;
}

function billingProperties(): readonly string[] {
  return [
    "catalog_id",
    "credit_source",
    "transaction_type",
    "credits",
    "balance_after",
    "reason_code",
    "duplicate",
  ];
}
