import {
  assessServiceHealth,
  createCachedServiceHealthReader,
  createDefaultServiceHealthDependencies,
} from "@/lib/operations/service-health";
import { createServiceHealthHandler } from "@/lib/operations/service-health-http";
import { createServiceHealthStore } from "@/lib/operations/service-health-store";

export const dynamic = "force-dynamic";
export const maxDuration = 5;

const healthStore = createServiceHealthStore();
const readServiceHealth = createCachedServiceHealthReader({
  assess: () =>
    assessServiceHealth(
      createDefaultServiceHealthDependencies({
        store: healthStore,
      })
    ),
  now: Date.now,
  ttlMs: 10_000,
});

export const GET = createServiceHealthHandler({ assess: readServiceHealth });
