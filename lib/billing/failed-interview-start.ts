import { createDrizzleCreditLedgerStore } from "./credit-ledger-store";
import type { CreditLedgerReadStore } from "./credit-ledger-contracts";
import { createCreditLedgerService } from "./credit-ledger-service";
import {
  createLocalDevCreditLedgerService,
  isLocalDevCreditBypassEnabled,
} from "./local-dev-bypass";

export interface FailedInterviewStartSettlementDeps {
  store: Pick<CreditLedgerReadStore, "findReservationByKey">;
  release(input: {
    reservationKey: string;
    idempotencyKey: string;
  }): Promise<unknown>;
  refund(input: {
    reservationKey: string;
    idempotencyKey: string;
  }): Promise<unknown>;
}

export async function settleFailedInterviewStartReservation(
  reservationKey: string,
  deps: FailedInterviewStartSettlementDeps
): Promise<void> {
  const reservation = await deps.store.findReservationByKey(reservationKey);
  if (!reservation) return;

  if (reservation.status === "active") {
    await deps.release({
      reservationKey,
      idempotencyKey: `release:${reservationKey}`,
    });
    return;
  }
  if (reservation.status === "consumed") {
    await deps.refund({
      reservationKey,
      idempotencyKey: `refund:${reservationKey}`,
    });
  }
}

export function createFailedInterviewStartSettler(): (
  reservationKey: string
) => Promise<void> {
  if (isLocalDevCreditBypassEnabled()) {
    const service = createLocalDevCreditLedgerService();
    return async (reservationKey) => {
      try {
        await service.releaseReservation({
          reservationKey,
          idempotencyKey: `release:${reservationKey}`,
        });
      } catch {
        // The local bypass is process-memory only and has no durable recovery.
      }
    };
  }

  const store = createDrizzleCreditLedgerStore();
  const service = createCreditLedgerService({ store });
  return (reservationKey) =>
    settleFailedInterviewStartReservation(reservationKey, {
      store,
      release: service.releaseReservation,
      refund: service.refundReservation,
    });
}
