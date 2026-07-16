import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import type { StripeSubscriptionEventCursor } from "@/lib/billing/stripe-subscription-event-order";
import { subscription } from "./schema";

export function stripeSubscriptionCursorIsNewer(
  cursor: StripeSubscriptionEventCursor
) {
  return or(
    isNull(subscription.lastEventTimestamp),
    lt(subscription.lastEventTimestamp, cursor.createdAt),
    and(
      eq(subscription.lastEventTimestamp, cursor.createdAt),
      or(
        isNull(subscription.lastEventPriority),
        lt(subscription.lastEventPriority, cursor.priority),
        and(
          eq(subscription.lastEventPriority, cursor.priority),
          or(
            isNull(subscription.lastEventId),
            sql`${subscription.lastEventId} COLLATE "C" < ${cursor.eventId} COLLATE "C"`
          )
        )
      )
    )
  );
}
