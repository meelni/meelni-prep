import { analytics } from "@/lib/analytics/analytics-service";
import {
  LEGACY_INTERVIEW_LAUNCH_EVENTS,
  type EventProperties,
} from "@/lib/analytics/types";

export { LEGACY_INTERVIEW_LAUNCH_EVENTS } from "@/lib/analytics/types";

export type CanonicalInterviewLaunchEvent =
  keyof typeof LEGACY_INTERVIEW_LAUNCH_EVENTS;

export function getInterviewLaunchEventPair<
  E extends CanonicalInterviewLaunchEvent,
>(event: E): readonly [E, (typeof LEGACY_INTERVIEW_LAUNCH_EVENTS)[E]] {
  return [event, LEGACY_INTERVIEW_LAUNCH_EVENTS[event]];
}

/**
 * Dual-write launcher events with the exact same property object until the
 * compatibility window ends on 2026-08-09 (tracked by SAV-223).
 */
export function trackInterviewLaunchEvent<
  E extends CanonicalInterviewLaunchEvent,
>(event: E, properties: EventProperties[E]): void {
  const [canonicalEvent, legacyEvent] = getInterviewLaunchEventPair(event);
  // The public generic keeps each canonical event paired with its exact
  // property contract. The aliases intentionally share those same contracts.
  analytics.track(canonicalEvent, properties as never);
  analytics.track(legacyEvent, properties as never);
}
