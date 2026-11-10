import { assertMinorAmount } from './money.js';

/** Illustrative accounting only; not a bank balance or an instruction to move funds. */
export type SandboxAccount = 'provider_receivable' | 'merchant_payable' | 'commission_revenue';
export interface SandboxEntry {
  readonly account: SandboxAccount;
  readonly side: 'debit' | 'credit';
  readonly amountMinor: number;
}
export interface SandboxJournal {
  readonly id: string;
  readonly merchantId: string;
  readonly currency: 'INR';
  readonly entries: readonly SandboxEntry[];
}

/** Validate all journals before producing a merchant-scoped accounting projection. */
export function sandboxBalanceSheet(journals: readonly SandboxJournal[], merchantId: string) {
  if (!merchantId.trim()) throw new RangeError('merchantId is required');
  const seen = new Set<string>();
  const totals: Record<SandboxAccount, bigint> = {
    provider_receivable: 0n,
    merchant_payable: 0n,
    commission_revenue: 0n,
  };
  for (const journal of journals) {
    if (!journal.id.trim() || !journal.merchantId.trim() || journal.currency !== 'INR') {
      throw new RangeError('invalid journal identity or currency');
    }
    if (seen.has(journal.id)) throw new RangeError('duplicate journal');
    seen.add(journal.id);
    let debits = 0n;
    let credits = 0n;
    if (journal.entries.length < 2) throw new RangeError('journal requires at least two entries');
    for (const entry of journal.entries) {
      if (!Object.hasOwn(totals, entry.account) || !['debit', 'credit'].includes(entry.side)) {
        throw new RangeError('invalid ledger entry');
      }
      assertMinorAmount(entry.amountMinor);
      if (entry.amountMinor === 0) throw new RangeError('entry amount must be positive');
      const amount = BigInt(entry.amountMinor);
      if (entry.side === 'debit') debits += amount;
      else credits += amount;
      if (journal.merchantId === merchantId) {
        const normalDebit = entry.account === 'provider_receivable';
        totals[entry.account] += (entry.side === 'debit') === normalDebit ? amount : -amount;
      }
    }
    if (debits !== credits) throw new RangeError('journal must balance');
  }
  const asSafeNumber = (amount: bigint): number => {
    if (amount > BigInt(Number.MAX_SAFE_INTEGER) || amount < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new RangeError('balance exceeds safe integer range');
    }
    return Number(amount);
  };
  return Object.freeze({
    currency: 'INR' as const,
    providerReceivableMinor: asSafeNumber(totals.provider_receivable),
    merchantPayableMinor: asSafeNumber(totals.merchant_payable),
    commissionRevenueMinor: asSafeNumber(totals.commission_revenue),
  });
}
