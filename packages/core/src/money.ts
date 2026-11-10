export type CurrencyCode = 'INR';

export const BASIS_POINTS_DENOMINATOR = 10_000;

export function assertMinorAmount(
  value: number,
  fieldName = 'amountMinor',
): asserts value is number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${fieldName} must be a non-negative safe integer minor-unit amount`);
  }
}

export function assertBasisPoints(value: number): asserts value is number {
  if (!Number.isSafeInteger(value) || value < 0 || value > BASIS_POINTS_DENOMINATOR) {
    throw new RangeError(
      `commissionBps must be an integer between 0 and ${BASIS_POINTS_DENOMINATOR}`,
    );
  }
}

/**
 * Calculates a positive monetary percentage using nearest-minor-unit, half-up rounding.
 * BigInt intermediates prevent a multiplication overflow before the final safe-integer check.
 */
export function calculateBasisPointAmount(amountMinor: number, commissionBps: number): number {
  assertMinorAmount(amountMinor);
  assertBasisPoints(commissionBps);

  const numerator = BigInt(amountMinor) * BigInt(commissionBps);
  const rounded =
    (numerator + BigInt(BASIS_POINTS_DENOMINATOR / 2)) / BigInt(BASIS_POINTS_DENOMINATOR);

  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('calculated fee exceeds the safe integer range');
  }

  return Number(rounded);
}
