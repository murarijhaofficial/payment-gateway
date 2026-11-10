# M0 legal and operating-model decision log

## Current decision

**Status: unresolved — sandbox-only development.** No code in this repository may initiate, capture, settle, route, or represent a real payment until the items below have documented operator approval.

## Required external decisions

1. Qualified legal advice must determine the RBI Payment Aggregator/Payment Gateway classification and the entity that legally handles funds.
2. A regulated PSP/acquirer/bank partner arrangement, permitted API use, settlement responsibilities, and branding must be documented.
3. PCI DSS scope must be assessed. The product must use PSP-hosted or tokenized card entry; PAN, CVV, PIN, and OTP are prohibited from platform systems.
4. Privacy, DPDP, AML/KYC, merchant due diligence, sanctions, record-retention, grievance, and data-localization responsibilities must be allocated.
5. Settlement, refunds, disputes, reserves, taxes, and reconciliation ownership/SLA must be approved.

## Engineering constraints until approval

- Test fixtures only; no provider credentials or real merchant/customer data.
- No production deployment, payment endpoint, payout flow, or bank/PSP connector.
- Any future provider adapter must verify inbound events before financial posting and use idempotency, tenant authorization, audit logs, and a documented rollback.

## Approval record

The operator must append dated approval references, scope, and approver identities here before enabling a non-sandbox integration.
