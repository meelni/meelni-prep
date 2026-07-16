/**
 * Analytics Tracking Utility
 *
 * Simple analytics wrapper for tracking user events.
 * Currently logs to console - easy to integrate with PostHog, Mixpanel, etc. later.
 *
 * Usage:
 * import { track } from '@/lib/analytics';
 * track('Event Name', { property: 'value' });
 */

interface EventProperties {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Track an analytics event
 * @param eventName - Name of the event to track
 * @param properties - Optional properties to include with the event
 */
export function track(_eventName: string, _properties?: EventProperties): void {
  void _eventName;
  void _properties;
  if (process.env.NODE_ENV === "development") {
    console.log("[Analytics] development_event_recorded");
  }

  // TODO: Add your analytics provider here
  // Example for PostHog:
  // if (typeof window !== 'undefined' && window.posthog) {
  //   window.posthog.capture(eventName, properties);
  // }

  // Example for Mixpanel:
  // if (typeof window !== 'undefined' && window.mixpanel) {
  //   window.mixpanel.track(eventName, properties);
  // }

  // Example for Segment:
  // if (typeof window !== 'undefined' && window.analytics) {
  //   window.analytics.track(eventName, properties);
  // }
}

/**
 * Identify a user (for analytics providers that support user identification)
 * @param userId - Unique identifier for the user
 * @param traits - Optional user traits/properties
 */
export function identify(_userId: string, _traits?: EventProperties): void {
  void _userId;
  void _traits;
  if (process.env.NODE_ENV === "development") {
    console.log("[Analytics] development_identity_recorded");
  }

  // TODO: Add your analytics provider here
  // Example for PostHog:
  // if (typeof window !== 'undefined' && window.posthog) {
  //   window.posthog.identify(userId, traits);
  // }
}

/**
 * Pre-defined event names for tier/pricing tracking
 * Using constants to avoid typos and make tracking consistent
 */
export const AnalyticsEvents = {
  // Setup Page Events
  SETUP_PAGE_VIEWED: "Setup Page Viewed",
  INTERVIEW_TYPE_SELECTED: "Interview Type Selected",

  // Tier/Pricing Events
  LOCKED_TYPE_CLICKED: "Locked Interview Type Clicked",
  UPGRADE_MODAL_VIEWED: "Upgrade Modal Viewed",
  UPGRADE_MODAL_DISMISSED: "Upgrade Modal Dismissed",
  UPGRADE_MODAL_CTA_CLICKED: "Upgrade Modal CTA Clicked",

  // Quota Events
  QUOTA_MODAL_VIEWED: "Quota Exceeded Modal Viewed",
  QUOTA_MODAL_DISMISSED: "Quota Exceeded Modal Dismissed",
  QUOTA_MODAL_CTA_CLICKED: "Quota Exceeded Modal CTA Clicked",
} as const;
