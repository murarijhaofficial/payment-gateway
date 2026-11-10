# Fee policy baseline

## Default policy

- `commission_bps`: **200** (2%).
- Amounts and fees use integer minor currency units; binary floating point is prohibited.
- For positive amounts, commission rounds to the nearest minor unit with halves rounded up:
  `floor((amount_minor * commission_bps + 5,000) / 10,000)`.
- The calculator accepts only a commission rate from 0 through 10,000 basis points and returns a safe integer minor-unit amount.

## Versioning requirements

The initial helper is deliberately not a persistence layer. When payment processing is approved, each fee policy version must be immutable and record effective time, proposer, distinct approver, activation reason, and the policy terms. Each payment must retain the exact fee version and computed fee snapshot; historical payments are never repriced.

## Open policy decisions

GST, PSP fees, merchant-specific overrides, partial captures, partial refunds, chargebacks, and fee reversals need written approval before implementation. The internal ledger must never be presented as a bank balance.
