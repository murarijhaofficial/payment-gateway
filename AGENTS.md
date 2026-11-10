# Payment Gateway Platform — AI Agent Operating Manual

## Mission
Build a secure, accessible, production-oriented, multi-tenant payment orchestration platform with hosted checkout, APIs, merchant dashboard, admin dashboard, payment links, refunds, reconciliation, settlement visibility, and integration SDKs. Default merchant processing commission is 2%, editable exclusively through authorized platform-admin workflows.

**Non-negotiable:** Do not claim to be a licensed payment aggregator or process real funds without the necessary RBI authorization or an approved regulated partner arrangement. Never collect/store raw card PAN, CVV, PIN, or OTP. Prefer PSP-hosted/tokenized card entry to reduce PCI scope. Do not invent bank integrations or assert compliance without independent assessment.

## Agent execution protocol
1. Read this file and `docs/PROJECT_PLAN.md` before modifying code.
2. Inspect the repository, identify the next incomplete milestone, and propose a small testable implementation slice.
3. Implement code, migrations, tests, documentation, and accessibility/security considerations together.
4. Run formatter, lint, type-check, unit tests, integration tests, dependency audit, and relevant security tests. Do not mark a step complete unless evidence exists.
5. **After every completed step**, append an entry to `docs/AGENT_PROGRESS.md` using the exact template below. Do not overwrite earlier entries. If a step fails, log it as BLOCKED or FAILED, with remediation.
6. Update milestone checkboxes in `docs/PROJECT_PLAN.md` only after acceptance criteria pass.
7. Never bypass security checks to make a build green. Never fabricate test output, regulator approvals, penetration-test results, or provider credentials.
8. Before risky migrations, deployments, fee changes, or access-policy changes, document rollback and obtain explicit operator approval.

## Required progress log entry
```markdown
### YYYY-MM-DD HH:MM UTC — STEP-ID: Short title
- Status: COMPLETE | BLOCKED | FAILED
- Objective:
- Files changed:
- Implementation summary:
- Security/privacy considerations:
- Tests executed (commands and results):
- Evidence (commit, PR, test artifact, screenshot, or logs):
- Open issues / risks:
- Next step:
- Operator approval required: Yes/No
```

## Engineering standards
- TypeScript strict mode; no `any` in security/payment-critical code.
- Backend NestJS; PostgreSQL with parameterized queries; Redis for rate limits and jobs; Next.js for admin/merchant UI.
- Use integer minor currency units or exact decimal arithmetic, never floating-point for money.
- Multi-tenant authorization on **every** query and resource; test cross-tenant access denial.
- Enforce server-side RBAC/ABAC and deny-by-default. UI visibility is not authorization.
- Validate all inputs using schemas, constrain payload size, use contextual output encoding, and avoid unsafe HTML rendering.
- Cookie sessions: HttpOnly, Secure, SameSite, session rotation, CSRF tokens on state-changing cookie-authenticated requests; OAuth/OIDC flows use state/nonce/PKCE where applicable.
- Protect APIs against SQL injection, XSS, CSRF, SSRF, broken object authorization, mass assignment, request smuggling, brute force, replay, and webhook forgery.
- Use HMAC-signed webhooks with timestamp and replay window, durable delivery queue, exponential retries, and dead-letter queue. Merchant must verify signatures.
- Use idempotency keys for create/capture/refund/payout actions and database uniqueness/locking to prevent duplicate processing.
- Payment states must be explicit and monotonic where appropriate; webhook delivery order is not guaranteed. Verify provider events before posting ledger entries.
- Immutable double-entry ledger, balanced journal entries, immutable audit trail, reconciliation and discrepancy workflows.
- Store secrets in managed secret store; use TLS, encryption at rest, rotation, least-privilege service accounts, and masked logs.
- No raw card data, CVV, OTP, access tokens, bank account details, or full PII in logs.
- WCAG 2.2 AA design target; keyboard navigation, focus states, contrast, error messages, mobile-first layouts, loading/empty/error states.
- Test coverage for authorization, monetary arithmetic, webhook verification, state transitions, fee versioning, refunds, disputes and concurrency.

## Role model
- Platform Super Admin: platform configuration and privileged access governance; protected by phishing-resistant MFA and approval controls.
- Platform Finance: reconciliation, settlement operations, financial reporting; no fee-rate editing.
- Platform Risk/Compliance: KYC review, AML/fraud review, holds and investigations.
- Platform Support: limited masked read access and support workflows; no credentials or sensitive finance changes.
- Merchant Owner: merchant settings, users, API key management, business-level reports.
- Merchant Admin: operational merchant settings and payment/refund permissions as delegated.
- Merchant Developer: sandbox/API keys, webhook configuration, integration diagnostics; no payouts or fee editing.
- Merchant Finance: settlement and reconciliation reporting, permitted refunds.
- Merchant Viewer: read-only scoped reports.
- Service Account: narrowly scoped machine access, no interactive login.

Every privilege must be separately mapped to resources/actions; use approval workflows for fee edits, payout destination changes, high-risk refunds, and privilege escalation. Enforce MFA and log privileged operations.

## Commission invariants
- Platform default `commission_bps = 200` (2%). Store rate as integer basis points.
- Only explicitly authorized Platform Super Admin/fee-management role may propose a rate change; require MFA and dual control for activation.
- Persist immutable fee-policy versions, effective times, actor, approver and reason.
- Snapshot fee version and computed fee per payment; never retroactively reprice.
- Define rounding, GST, provider fees, merchant-specific overrides, refunds, chargebacks and partial captures in policy before implementation.
- Ledger entries must balance; do not treat the internal ledger as a bank balance.

## Completion gates
A milestone is COMPLETE only when code is reviewed, tests pass, security requirements are checked, API docs are updated, user flows work on mobile and desktop, and progress is logged. Production launch additionally requires legal/regulatory clearance, provider contracts, incident-response drills, backup restoration proof, independent security assessment, PCI scope review, monitoring/alerts, and reconciliation sign-off.
