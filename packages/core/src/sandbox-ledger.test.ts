import assert from 'node:assert/strict';
import test from 'node:test';
import { sandboxBalanceSheet, type SandboxJournal } from './sandbox-ledger.js';

const payment: SandboxJournal = {
  id: 'journal-1',
  merchantId: 'merchant-a',
  currency: 'INR',
  entries: [
    { account: 'provider_receivable', side: 'debit', amountMinor: 10_000 },
    { account: 'merchant_payable', side: 'credit', amountMinor: 9_800 },
    { account: 'commission_revenue', side: 'credit', amountMinor: 200 },
  ],
};

test('projects a balanced payment and isolates merchant totals', () => {
  assert.deepEqual(sandboxBalanceSheet([payment], 'merchant-a'), {
    currency: 'INR',
    providerReceivableMinor: 10_000,
    merchantPayableMinor: 9_800,
    commissionRevenueMinor: 200,
  });
  assert.equal(sandboxBalanceSheet([payment], 'merchant-b').merchantPayableMinor, 0);
});

test('rejects duplicates, unbalanced entries, and invalid amounts', () => {
  assert.throws(() => sandboxBalanceSheet([payment, payment], 'merchant-a'), /duplicate/);
  assert.throws(
    () => sandboxBalanceSheet([{ ...payment, entries: payment.entries.slice(0, 2) }], 'merchant-a'),
    /balance/,
  );
  assert.throws(
    () =>
      sandboxBalanceSheet(
        [
          {
            ...payment,
            entries: [
              { account: 'provider_receivable', side: 'debit', amountMinor: 0 },
              ...payment.entries,
            ],
          },
        ],
        'merchant-a',
      ),
    /positive/,
  );
});
