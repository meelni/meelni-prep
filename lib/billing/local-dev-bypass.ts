import type {
  CompleteReservationInput,
  CompleteReservationResult,
  CreditReservationStatus,
  ReserveCreditInput,
  ReserveCreditResult,
} from "./credits";

export interface LocalDevBypassEnv {
  NODE_ENV?: string;
  VERCEL?: string;
  MEELNI_LOCAL_CREDIT_BYPASS?: string;
  MEELNI_DISABLE_LOCAL_CREDIT_BYPASS?: string;
}

export interface LocalDevCreditBalanceResponse {
  availableCredits: number;
  reservedCredits: number;
  expiringCredits: number;
  nextCreditExpiresAt: null;
  trialAvailable: false;
  grants: [];
  localDevBypass: true;
}

export function isLocalDevCreditBypassEnabled(
  env: LocalDevBypassEnv = process.env
): boolean {
  if (env.NODE_ENV === "production") {
    return false;
  }

  if (env.MEELNI_DISABLE_LOCAL_CREDIT_BYPASS === "1") {
    return false;
  }

  if (env.MEELNI_LOCAL_CREDIT_BYPASS === "1") {
    return env.VERCEL !== "1";
  }

  return env.NODE_ENV === "development";
}

export function getLocalDevCreditBalanceResponse(): LocalDevCreditBalanceResponse {
  return {
    availableCredits: 999,
    reservedCredits: 0,
    expiringCredits: 0,
    nextCreditExpiresAt: null,
    trialAvailable: false,
    grants: [],
    localDevBypass: true,
  };
}

export function createLocalDevCreditLedgerService({
  now = () => new Date(),
}: {
  now?: () => Date;
} = {}) {
  const completedReservations = new Map<string, CompleteReservationResult>();

  function buildReservation(
    input: ReserveCreditInput,
    status: CreditReservationStatus = "active"
  ): ReserveCreditResult["reservation"] {
    const timestamp = now();

    return {
      id: `local-dev:${input.reservationKey}`,
      userId: input.userId,
      reservationKey: input.reservationKey,
      status,
      credits: input.credits ?? 1,
      sessionId: input.sessionId ?? null,
      expiresAt: input.expiresAt ?? new Date(timestamp.getTime() + 30 * 60_000),
      metadata: input.metadata ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  function completeReservation(
    input: CompleteReservationInput,
    status: Exclude<CreditReservationStatus, "active">
  ): CompleteReservationResult {
    const existing = completedReservations.get(input.idempotencyKey);
    if (existing) {
      return { ...existing, duplicate: true };
    }

    const timestamp = now();
    const result = {
      duplicate: false,
      reservation: {
        id: `local-dev:${input.reservationKey}`,
        userId: "local-dev-user",
        reservationKey: input.reservationKey,
        status,
        credits: 1,
        sessionId: null,
        expiresAt: new Date(timestamp.getTime() + 30 * 60_000),
        metadata: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };

    completedReservations.set(input.idempotencyKey, result);
    return result;
  }

  return {
    async reserveCredit(
      input: ReserveCreditInput
    ): Promise<ReserveCreditResult> {
      return {
        reservation: buildReservation(input),
        allocations: [],
      };
    },
    async consumeReservation(
      input: CompleteReservationInput
    ): Promise<CompleteReservationResult> {
      return completeReservation(input, "consumed");
    },
    async releaseReservation(
      input: CompleteReservationInput
    ): Promise<CompleteReservationResult> {
      return completeReservation(input, "released");
    },
  };
}
