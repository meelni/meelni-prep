import { listInterviewPresenceReconciliationSessions } from "@/lib/db/session-reconnects";
import { inngest } from "@/lib/inngest/client";
import { getLiveKitEnvironment } from "@/lib/internal/integrations";
import { reconcileInterviewPresenceWorkflow } from "@/lib/workflows/reconcile-interview-presence";

export const INTERVIEW_PRESENCE_RECONCILIATION_EVENT_NAME =
  "interview/presence.reconciliation.requested" as const;

export function buildInterviewPresenceReconciliationEvents(
  sessions: Array<{ sessionId: string }>,
  deliveryId: string
) {
  return sessions.map((session) => ({
    id: `interview-presence:${session.sessionId}:${deliveryId}`,
    name: INTERVIEW_PRESENCE_RECONCILIATION_EVENT_NAME,
    data: { sessionId: session.sessionId, deliveryId },
  }));
}

export const reconcileInterviewPresence = inngest.createFunction(
  {
    id: "interview-presence-reconciliation",
    name: "Reconcile Interview Participant Presence",
    retries: 5,
    concurrency: [{ limit: 1, key: "event.data.sessionId" }],
  },
  { event: INTERVIEW_PRESENCE_RECONCILIATION_EVENT_NAME },
  async ({ event, step }) => {
    const env = getLiveKitEnvironment();
    if (!env.ok) throw new Error(env.error.code);

    return step.run("inspect-and-reconcile-participant", () =>
      reconcileInterviewPresenceWorkflow({
        sessionId: String(event.data.sessionId ?? ""),
        deliveryId: String(event.data.deliveryId ?? event.id),
        env: env.data,
      })
    );
  }
);

export const recoverInterviewPresenceReconciliation = inngest.createFunction(
  {
    id: "interview-presence-reconciliation-recovery",
    name: "Recover Interview Presence Reconciliation",
    retries: 2,
    concurrency: [{ limit: 1 }],
  },
  { cron: "* * * * *" },
  async ({ event, step }) => {
    const sessions = await step.run("find-presence-to-reconcile", () =>
      listInterviewPresenceReconciliationSessions()
    );
    if (sessions.length > 0) {
      await step.sendEvent(
        "fan-out-presence-reconciliation",
        buildInterviewPresenceReconciliationEvents(
          sessions,
          String(event.id ?? "recovery")
        )
      );
    }
    return { scheduled: sessions.length };
  }
);
