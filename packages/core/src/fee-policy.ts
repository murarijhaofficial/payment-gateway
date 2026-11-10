import {
  assertBasisPoints,
  assertMinorAmount,
  calculateBasisPointAmount,
  type CurrencyCode,
} from './money.js';

export const DEFAULT_COMMISSION_BPS = 200;

export interface FeePolicyVersion {
  readonly id: string;
  readonly commissionBps: number;
  readonly effectiveAt: string;
}

export interface PaymentFeeSnapshot {
  readonly currency: CurrencyCode;
  readonly paymentAmountMinor: number;
  readonly commissionAmountMinor: number;
  readonly feePolicyVersionId: string;
  readonly commissionBps: number;
}

export function createPaymentFeeSnapshot(input: {
  readonly currency: CurrencyCode;
  readonly paymentAmountMinor: number;
  readonly feePolicyVersion: FeePolicyVersion;
}): PaymentFeeSnapshot {
  assertMinorAmount(input.paymentAmountMinor, 'paymentAmountMinor');
  assertBasisPoints(input.feePolicyVersion.commissionBps);

  if (input.feePolicyVersion.id.trim().length === 0) {
    throw new RangeError('feePolicyVersion.id must not be empty');
  }

  return Object.freeze({
    currency: input.currency,
    paymentAmountMinor: input.paymentAmountMinor,
    commissionAmountMinor: calculateBasisPointAmount(
      input.paymentAmountMinor,
      input.feePolicyVersion.commissionBps,
    ),
    feePolicyVersionId: input.feePolicyVersion.id,
    commissionBps: input.feePolicyVersion.commissionBps,
  });
}
