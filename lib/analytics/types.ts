/**
 * Analytics Types
 * Type-safe event tracking system for Meelni
 */

// =============================================================================
// Event Names
// =============================================================================

/**
 * All trackable events in the application
 * Add new events here to maintain type safety
 */
export type AnalyticsEvent =
  // Landing Page Events
  | "landing_page_viewed"
  | "cta_clicked"
  | "demo_modal_opened"
  | "demo_modal_closed"
  | "demo_completed"
  | "demo_mic_toggled"
  // Auth Events
  | "auth_signup_started"
  | "auth_signup_completed"
  | "auth_signup_failed"
  | "auth_signin_started"
  | "auth_signin_completed"
  | "auth_signin_failed"
  | "auth_signout_completed"
  | "auth_password_reset_requested"
  | "auth_error"
  // Setup Events
  | "setup_started"
  | "new_rep_launcher_viewed"
  | "new_rep_recommendation_accepted"
  | "new_rep_recommendation_changed"
  | "new_rep_start_attempted"
  | "new_rep_start_succeeded"
  | "new_rep_start_failed"
  | "interview_type_selected"
  | "skill_level_selected"
  | "setup_completed"
  // Interview Events
  | "interview_started"
  | "interview_ended"
  | "interview_completed"
  | "interview_error"
  | "mic_toggled"
  | "hint_mode_changed"
  | "hint_dismissed"
  // Dashboard Events
  | "dashboard_viewed"
  | "ftue_cta_clicked"
  | "ftue_viewed"
  | "session_history_viewed"
  | "session_details_clicked"
  | "feedback_viewed"
  | "chart_interacted"
  | "competency_radar_viewed"
  | "score_trend_analyzed"
  // Billing Events
  | "billing_credit_granted"
  | "billing_credit_reserved"
  | "billing_credit_consumed"
  | "billing_credit_released"
  | "billing_credit_refunded"
  | "billing_credit_expired"
  | "billing_credit_rollover_created"
  | "billing_no_credits"
  // Performance Events
  | "page_performance"
  | "livekit_connection_established"
  | "error_boundary_triggered";

// =============================================================================
// Event Properties
// =============================================================================

/**
 * Landing Page Event Properties
 */
interface LandingPageProperties {
  landing_page_viewed: {
    referrer?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  };
  cta_clicked: {
    button_text: string;
    location: string;
    destination: string;
  };
  demo_modal_opened: {
    trigger_source: string;
  };
  demo_modal_closed: {
    duration_seconds: number;
    completed: boolean;
    agent_joined: boolean;
    user_spoke: boolean;
  };
  demo_completed: {
    duration_seconds: number;
    turn_count?: number;
    converted_to_signup: boolean;
  };
  demo_mic_toggled: {
    new_state: "muted" | "unmuted";
    time_in_demo_seconds: number;
  };
}

/**
 * Auth Event Properties
 */
interface AuthProperties {
  auth_signup_started: {
    source?: string;
  };
  auth_signup_completed: {
    method: "google" | "email";
  };
  auth_signup_failed: {
    method: "google" | "email";
    error: string;
  };
  auth_signin_started: {
    source?: string;
  };
  auth_signin_completed: {
    method: "google" | "email";
  };
  auth_signin_failed: {
    method: "google" | "email";
    error: string;
  };
  auth_signout_completed: Record<string, never>; // No properties
  auth_password_reset_requested: {
    email_domain?: string;
  };
  auth_error: {
    error_type: string;
    auth_method: "google" | "email";
  };
}

/**
 * Setup Event Properties
 */
interface SetupProperties {
  setup_started: {
    user_id: string;
    referrer_page?: string;
    user_authenticated: boolean;
  };
  interview_type_selected: {
    user_id: string;
    interview_type: "product_sense" | "behavioral" | "execution" | "strategy";
  };
  skill_level_selected: {
    skill_level: "beginner" | "intermediate" | "advanced";
    interview_type: string;
    is_default_selection: boolean;
  };
  setup_completed: {
    user_id: string;
    interview_type: "product_sense" | "behavioral" | "execution" | "strategy";
    skill_level: "beginner" | "intermediate" | "advanced";
    mode: "voice_video";
    time_to_complete_seconds: number;
    selections_changed: number;
  };
  new_rep_launcher_viewed: {
    source: "dashboard" | "selected_question";
    recommended_round_type: string;
    recommended_difficulty: string;
    recommendation_source: string;
  };
  new_rep_recommendation_accepted: {
    recommended_round_type: string;
    recommended_difficulty: string;
    recommendation_source: string;
  };
  new_rep_recommendation_changed: {
    field: "round_type" | "difficulty";
    value: string;
    recommended_round_type?: string;
    recommended_difficulty?: string;
  };
  new_rep_start_attempted: {
    interview_type: string;
    skill_level: string;
    recommendation_source: string;
    accepted_recommendation: boolean;
    question_id?: string;
  };
  new_rep_start_succeeded: {
    session_id: string;
    interview_type: string;
    skill_level: string;
    question_id?: string;
  };
  new_rep_start_failed: {
    interview_type: string | null;
    skill_level: string | null;
    error: string;
  };
}

/**
 * Interview Event Properties
 */
interface InterviewProperties {
  interview_started: {
    session_id: string;
    interview_type?: string;
    mode?: string;
    skill_level?: string;
  };
  interview_ended: {
    session_id: string;
    duration_seconds: number;
    ended_naturally: boolean;
    interview_type?: string;
  };
  interview_completed: {
    user_id: string;
    session_id: string;
    duration_seconds: number;
    turn_count: number;
  };
  interview_error: {
    user_id: string;
    session_id?: string;
    error_type: string;
    error_message: string;
  };
  mic_toggled: {
    session_id: string;
    new_state: "muted" | "unmuted";
  };
  hint_mode_changed: {
    session_id: string;
    hint_mode: "off" | "gentle" | "coach";
    interview_type?: string;
  };
  hint_dismissed: {
    session_id: string;
    hint_type: string;
    hint_mode: "off" | "gentle" | "coach";
  };
}

/**
 * Dashboard Event Properties
 */
interface DashboardProperties {
  dashboard_viewed: {
    section: "overview" | "history" | "analytics" | "feedback" | "settings" | "questions";
  };
  ftue_cta_clicked: {
    user_id?: string;
    cta_text: string;
  };
  ftue_viewed: {
    user_id?: string;
  };
  session_history_viewed: {
    section: "history" | "overview";
    total_sessions: number;
    has_feedback: boolean;
  };
  session_details_clicked: {
    session_id: string;
    interview_type: string;
    session_age_days: number;
    has_feedback: boolean;
  };
  feedback_viewed: {
    session_id: string;
    feedback_available: boolean;
    overall_score?: number;
  };
  chart_interacted: {
    chart_type: "score_chart" | "competency_radar" | "stats_cards" | "interview_type_breakdown";
    interaction_type: "hover" | "click" | "expand";
    data_point?: string;
    time_spent_seconds?: number;
  };
  competency_radar_viewed: {
    competencies_count: number;
    has_scores: boolean;
    avg_competency_score?: number;
  };
  score_trend_analyzed: {
    time_range: "all_time" | "last_7_days" | "last_30_days";
    sessions_in_range: number;
    trend_direction: "improving" | "declining" | "stable";
  };
}

/**
 * Billing Event Properties
 */
interface BillingProperties {
  billing_credit_granted: BillingCreditProperties;
  billing_credit_reserved: BillingCreditProperties;
  billing_credit_consumed: BillingCreditProperties;
  billing_credit_released: BillingCreditProperties;
  billing_credit_refunded: BillingCreditProperties;
  billing_credit_expired: BillingCreditProperties;
  billing_credit_rollover_created: BillingCreditProperties;
  billing_no_credits: BillingCreditProperties;
}

interface BillingCreditProperties {
  catalog_id?: "trial" | "interview_pass" | "starter" | "pro" | "admin_grant";
  credit_source?:
    | "trial"
    | "checkout"
    | "subscription_renewal"
    | "rollover"
    | "admin"
    | "refund"
    | "migration";
  transaction_type?:
    | "grant"
    | "reserve"
    | "consume"
    | "release"
    | "refund"
    | "expire"
    | "adjustment"
    | "rollover";
  credits?: number;
  balance_after?: number | null;
  idempotency_key?: string;
  source_id?: string | null;
  session_id?: string | null;
  grant_id?: string | null;
  reservation_id?: string | null;
  reason?: string;
  duplicate?: boolean;
}

/**
 * Performance Event Properties
 */
interface PerformanceProperties {
  page_performance: {
    page: string;
    lcp?: number; // Largest Contentful Paint (ms)
    fid?: number; // First Input Delay (ms)
    cls?: number; // Cumulative Layout Shift (score)
    ttfb?: number; // Time to First Byte (ms)
    fcp?: number; // First Contentful Paint (ms)
  };
  livekit_connection_established: {
    session_id: string;
    connection_time_ms: number;
    region?: string;
    connection_quality: "excellent" | "good" | "poor";
  };
  error_boundary_triggered: {
    error_message: string;
    component_stack?: string;
    page: string;
    user_action?: string;
  };
}

/**
 * Combined Event Properties Map
 * Maps each event to its required properties
 */
export type EventProperties = LandingPageProperties &
  AuthProperties &
  SetupProperties &
  InterviewProperties &
  DashboardProperties &
  BillingProperties &
  PerformanceProperties;

// =============================================================================
// User Traits
// =============================================================================

/**
 * User identification traits
 * Used with analytics.identify()
 */
export interface UserTraits {
  user_id: string;
  email?: string; // Will be sanitized before sending
  email_domain?: string; // Domain part of email (e.g., gmail.com)
  name?: string;
  created_at?: string;
  signup_method?: "google" | "email"; // How the user signed up
  total_sessions?: number;
  avg_score?: number;
  subscription_tier?: "free" | "pro";
}

// =============================================================================
// Type Utilities
// =============================================================================

/**
 * Helper type to ensure event properties are correct
 */
export type ValidEventProperties<E extends AnalyticsEvent> = E extends keyof EventProperties
  ? EventProperties[E]
  : never;
