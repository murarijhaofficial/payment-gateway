# Foundation threat-model baseline

## Assets

Tenant-scoped merchant data, API credentials, tokenized provider references, payment and refund state, fee versions, ledger journals, audit records, and webhook secrets are high-value assets. Raw card data, CVV, PIN, and OTP are out of scope and forbidden.

## Trust boundaries and controls

| Boundary                      | Primary risks                       | Required controls                                                                                                    |
| ----------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Browser to merchant UI/API    | XSS, CSRF, credential theft         | CSP, secure HttpOnly cookies, CSRF tokens, Origin checks, MFA, input validation                                      |
| API to data stores            | injection, cross-tenant access      | parameterized queries, tenant scope on every query, least-privilege roles, authorization tests                       |
| PSP callbacks to API          | forged/replayed/out-of-order events | raw-body HMAC verification, timestamp window, replay store, idempotency, provider verification before ledger posting |
| Platform to merchant webhooks | SSRF, disclosure, delivery replay   | URL validation/DNS-IP controls, signed timestamped payloads, durable outbox, retries/DLQ                             |
| Privileged administration     | fee/payout/role abuse               | phishing-resistant MFA, dual control, immutable audit events, deny by default                                        |

## Initial abuse cases to test before a payment endpoint

- A merchant cannot retrieve, mutate, or enumerate another tenant's resource.
- Duplicate and concurrent idempotency keys cannot create duplicate orders, refunds, or ledger entries.
- A forged, old, duplicate, or reordered provider event cannot change a payment state or post a journal.
- Fee activation cannot be performed by its proposer or without MFA and an audit trail.
- Webhook endpoints cannot target loopback, private, link-local, or metadata networks.
