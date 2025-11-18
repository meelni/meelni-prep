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
  | "interview_type_selected"
  | "setup_completed"
  // Interview Events
  | "interview_started"
  | "interview_ended"
  | "interview_completed"
  | "interview_error"
  | "mic_toggled"
  // Dashboard Events
  | "dashboard_viewed"
  | "session_history_viewed";

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
  };
  interview_type_selected: {
    user_id: string;
    interview_type: "product_sense" | "analytical" | "leadership" | "strategy";
  };
  setup_completed: {
    user_id: string;
    interview_type: "product_sense" | "analytical" | "leadership" | "strategy";
    skill_level: "junior" | "intermediate" | "senior";
    mode: "mock_interview" | "practice" | "learning";
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
}

/**
 * Dashboard Event Properties
 */
interface DashboardProperties {
  dashboard_viewed: {
    section: "overview" | "history" | "analytics" | "feedback" | "settings" | "questions";
  };
  session_history_viewed: {
    user_id: string;
    total_sessions: number;
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
  DashboardProperties;

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
