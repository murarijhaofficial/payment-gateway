# Payment Gateway Platform — Master Project Plan

## 1. Product objective
Develop a multi-tenant, Razorpay-style merchant payment experience: hosted checkout, payment orders, payment links, transaction dashboard, refunds, settlement tracking, reconciliation, reporting, APIs, SDKs, webhooks and a separate platform administration console. Launch through an authorized payment partner unless the business independently obtains the requisite RBI authorization.

## 2. Regulatory and operational prerequisites
- Obtain qualified Indian fintech legal advice on RBI Payment Aggregator / Payment Gateway classification, authorization and partner operating model; determine who legally handles funds, KYC, settlement and disputes.
- Contract with licensed payment aggregators/acquirers/banks; document partner capabilities and permitted branding/API use.
- Determine applicable RBI directions, merchant due diligence, AML/KYC, sanctions screening, grievance handling, privacy/DPDP requirements, record retention, and data localization.
- Perform PCI DSS scoping with a qualified assessor; use hosted fields/redirects and network tokenization to minimize cardholder-data exposure. Never store CVV or PIN.
- Define settlement accounts, escrow/nodal arrangements where applicable, reconciliation SLAs, merchant T&Cs, refunds, chargebacks and tax invoicing.
- A partner integration is not itself authorization to operate a standalone aggregator; verify the actual legal model.

## 3. Product modules
1. Public site: features, pricing, documentation, status, support, legal pages.
2. Merchant onboarding: registration, email/phone verification, business profile, KYB/KYC submission, manual/partner review, activation.
3. Authentication: OIDC-compatible identity, MFA, recovery, device/session controls, invitations, RBAC/ABAC.
4. Merchant dashboard: overview, transactions, payment links, customers, refunds, disputes, settlements, analytics, team, API keys, webhooks, settings.
5. Hosted checkout: branded accessible payment page, mobile-responsive, provider-hosted sensitive payment inputs, return URLs, signed result verification.
6. Payments: order creation, attempts, authorization, capture, failures, expiration, partial capture if supported, refunds and status polling.
7. Orchestration: provider adapters, routing/fallback under provider rules, retries that do not duplicate charges, circuit breakers.
8. Financials: double-entry ledger, immutable fee snapshots, reconciliation, settlement/payout status, reserves, adjustments and reports.
9. Commission: default 200 bps; admin-only proposal/approval/activation; policy versions, taxes, provider costs, refunds.
10. Fraud and compliance: velocity rules, risk scoring, holds, KYB review, disputes, suspicious activity workflows.
11. Integrations: REST API, OpenAPI, JavaScript checkout SDK, Android/iOS SDK wrappers, PHP/Python/Node examples, WooCommerce plugin, webhook signing, sandbox.
12. Admin console: merchant approvals, payments overview, provider health, settlement exceptions, risk queues, fee rules, support, access management, audit logs.
13. Operations: observability, alerting, incident response, backups, disaster recovery, status page, support tooling.

## 4. Architecture
- Frontends: Next.js + TypeScript + Tailwind + accessible component system; separate admin and merchant deployments.
- Backend: NestJS modular monolith, strict DTO/schema validation, OpenAPI, PostgreSQL, Redis, BullMQ, provider adapter interfaces.
- Infrastructure: managed cloud with private database, WAF/CDN, load balancer, secrets manager, KMS, TLS, central logs, managed backups, CI/CD, IaC.
- Modules: identity, tenants, onboarding, merchants, orders, payment attempts, provider adapters, refunds, fee policy, ledger, reconciliation, settlement, disputes, webhook inbox/outbox, notifications, audit, reporting.
- Use transactional outbox, idempotency records, row locking, uniqueness constraints and asynchronous jobs for durable workflows.
- Partition data by merchant ID and enforce tenant authorization at service and data layers.
- Avoid shared hosting for production payment processing; use an appropriately secured managed environment.

## 5. Suggested core tables
users, roles, permissions, role_permissions, user_memberships, sessions, mfa_credentials, merchants, merchant_documents, merchant_bank_accounts (tokenized/encrypted), api_credentials, webhook_endpoints, orders, payment_attempts, payment_events, refunds, disputes, fee_policies, fee_policy_versions, payment_fee_snapshots, ledger_accounts, ledger_journals, ledger_entries, provider_reconciliation_items, settlements, settlement_items, payout_instructions, webhook_events, webhook_deliveries, idempotency_keys, audit_events, risk_cases, notifications.

Add FK constraints, tenant-scoped indexes, unique provider event IDs, strict state transitions, immutable accounting records, and retention policies. Keep tokenized/encrypted sensitive fields out of general search indexes.

## 6. API contract (illustrative)
- POST /v1/orders — create order (idempotency required)
- GET /v1/orders/{id} — retrieve order
- POST /v1/checkout/sessions — create short-lived hosted checkout session
- GET /v1/payments/{id} — get verified status
- POST /v1/payments/{id}/capture — capture if supported
- POST /v1/payments/{id}/refunds — request refund (idempotency required)
- GET /v1/refunds/{id} — refund status
- GET /v1/settlements — settlement records
- GET /v1/transactions — paginated merchant-scoped transaction search
- POST /v1/webhook-endpoints — configure destination with ownership verification
- POST /v1/admin/fee-policy-changes — propose fee change (privileged)
- POST /v1/admin/fee-policy-changes/{id}/approve — separate approver
- POST /v1/admin/fee-policy-changes/{id}/activate — controlled activation

Use OAuth/OIDC for user sessions and scoped API credentials for server integrations. Never put secret keys in browser/mobile code. Provider callbacks must be authenticated and idempotently processed. Public redirect query parameters are not proof of payment.

## 7. Security acceptance checklist
### Application
- [ ] SQL injection: parameterized queries, no unsafe SQL interpolation, least-privilege DB credentials, adversarial tests.
- [ ] XSS: contextual encoding, CSP, sanitize allowed rich text, avoid dangerous HTML sinks, tests.
- [ ] CSRF: anti-CSRF tokens for cookie-based mutations, SameSite cookies, Origin/Referer checks as defense in depth.
- [ ] Authentication: MFA, secure recovery, account lock/rate limits, password hashing (Argon2id), session rotation/revocation.
- [ ] Authorization: deny-by-default, per-resource tenant checks, BOLA/IDOR tests, role matrix, segregation of duties.
- [ ] API security: schema validation, payload limits, rate limiting, replay protection, CORS allowlist, key rotation.
- [ ] SSRF: webhook URL validation, DNS/IP restrictions, redirect limits, egress controls.
- [ ] Webhooks: provider signature verification, raw-body handling, timestamp/replay defense, duplicate event handling, signed merchant delivery.
- [ ] Payments: idempotency, state-machine checks, concurrent request tests, ledger invariants, amount/currency checks.
- [ ] Secrets: vault, key rotation, no secrets in repository or logs, encryption at rest/in transit.
- [ ] Sensitive data: tokenization, masking, retention/deletion rules, access logging, privacy review.
- [ ] Infrastructure: WAF, DDoS mitigation, patched images, network isolation, hardened containers, backups, DR.
- [ ] Supply chain: SAST, SCA, secret scanning, dependency pinning, SBOM, signed builds, CI protections.
- [ ] Monitoring: security alerts, tamper-evident audit logs, fraud monitoring, incident runbooks.
- [ ] Independent penetration testing and PCI applicability assessment before live launch.

### Financial correctness
- [ ] All amounts in integer minor units / exact decimal, defined rounding and supported currencies.
- [ ] Default fee 200 bps; only privileged admins may initiate changes; separate approval and audit trail.
- [ ] Historical fee snapshots immutable; partial refunds and chargebacks follow written fee policy.
- [ ] Ledger entries always balance; no updates/deletes to posted entries, only reversing entries.
- [ ] Provider/bank reconciliation handles duplicates, missing transactions, timing differences and exceptions.
- [ ] Settlements only shown as completed on verified partner/bank confirmation.

## 8. UX/UI design system
Visual direction: professional fintech, restrained navy/indigo with a single teal accent, ample whitespace, clear typography, accessible contrast, consistent 8px spacing, compact but readable data tables. Desktop sidebar + top bar; mobile bottom/tab navigation where appropriate. Include search, filters, exports, pagination, skeletons, empty/error states, toast feedback, explicit confirmation dialogs, keyboard shortcuts where appropriate, and accessible forms.

Key screens: marketing homepage, signup/login/MFA, onboarding wizard, merchant overview, payments table/detail, hosted checkout, refunds, payment links, settlements, disputes, developer API keys/webhooks, team permissions, admin overview, merchant verification, risk queue, commission approval, reconciliation exceptions, audit explorer.

Accessibility target WCAG 2.2 AA; validate keyboard-only use, screen readers, focus order, contrast and touch targets. Never reveal sensitive values in notifications or analytics.

## 9. Milestones and acceptance gates
- [ ] M0 — Legal model, PSP/bank partnership, compliance scope, risk register, PRD and operational ownership approved.
- [ ] M1 — Repository, CI, infrastructure baseline, design system, DB migrations, threat model, test harness.
- [ ] M2 — Tenant identity, secure auth, MFA, role/permission matrix, merchant onboarding and approvals.
- [ ] M3 — Sandbox provider adapter, orders, hosted checkout, payment state machine, signed callback verification.
- [ ] M4 — Immutable ledger, 2% versioned fee engine, refund flow, admin dual approval, reconciliation tests.
- [ ] M5 — Merchant dashboard, payment links, transaction exports, signed webhooks, developer docs and SDK examples.
- [ ] M6 — Settlement tracking, disputes, risk/compliance operations, admin reports, support tooling.
- [ ] M7 — Integration plugins, mobile SDK wrappers, sandbox console, developer onboarding, accessibility testing.
- [ ] M8 — Load/security testing, independent pen test, incident drill, backup restore, partner UAT, compliance sign-offs.
- [ ] M9 — Controlled pilot with authorized partner, monitoring, reconciliation sign-off, gradual rollout.

Each milestone requires automated tests, code review, threat-model updates, accessibility check, documentation and an AGENT_PROGRESS.md entry. No milestone can be self-certified as legally compliant.

## 10. Suggested implementation sequence
Weeks 1–3: product/legal discovery, provider contracts, security and UX specs.
Weeks 4–6: foundation, infrastructure, authentication, onboarding.
Weeks 7–10: sandbox checkout, orders, payment state machine, webhooks.
Weeks 11–14: ledger, fee engine, refunds, reconciliation.
Weeks 15–18: dashboards, admin console, integrations, SDK examples.
Weeks 19–22: settlement/disputes, operations, security and load tests.
Weeks 23–26+: provider UAT, independent assessments, pilot and controlled rollout.

Timeline is illustrative, dependent on team capacity, external provider approvals and regulatory requirements; standalone licensing may take substantially longer.

## 11. Definition of done
Every feature includes acceptance criteria, threat assessment, access-control tests, financial correctness tests where relevant, migration/rollback, API documentation, responsive and accessible UI, monitoring, and agent progress logging. Live launch is blocked until external dependencies and compliance gates are independently signed off.
