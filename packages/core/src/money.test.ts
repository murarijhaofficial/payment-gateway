import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_COMMISSION_BPS, createPaymentFeeSnapshot } from './fee-policy.js';
import { calculateBasisPointAmount } from './money.js';

test('calculates the default 2% commission in integer minor units', () => {
  assert.equal(calculateBasisPointAmount(10_000, DEFAULT_COMMISSION_BPS), 200);
});

test('rounds half of a minor unit up according to the documented policy', () => {
  assert.equal(calculateBasisPointAmount(25, DEFAULT_COMMISSION_BPS), 1);
});

test('retains the fee-policy version and value on an immutable snapshot', () => {
  const snapshot = createPaymentFeeSnapshot({
    currency: 'INR',
    paymentAmountMinor: 12_345,
    feePolicyVersion: {
      id: 'fee-policy-v1',
      commissionBps: DEFAULT_COMMISSION_BPS,
      effectiveAt: '2026-11-09T00:00:00.000Z',
    },
  });

  assert.deepEqual(snapshot, {
    currency: 'INR',
    paymentAmountMinor: 12_345,
    commissionAmountMinor: 247,
    feePolicyVersionId: 'fee-policy-v1',
    commissionBps: 200,
  });
  assert.equal(Object.isFrozen(snapshot), true);
});

test('rejects invalid minor amounts and fee rates', () => {
  assert.throws(() => calculateBasisPointAmount(1.5, 200), RangeError);
  assert.throws(() => calculateBasisPointAmount(-1, 200), RangeError);
  assert.throws(() => calculateBasisPointAmount(100, 10_001), RangeError);
});
