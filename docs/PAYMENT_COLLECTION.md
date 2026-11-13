# Payment collection: connected sandbox

Merchants can create expiring payment links, share a checkout URL or QR, and let a
visitor complete a simulated UPI/card payment without a merchant login. Successful
checkout posts one balanced journal, snapshots the active commission policy and
updates the merchant balance. Declined attempts are recorded without crediting a
balance; the visitor can retry. Paid, expired and cancelled requests cannot be paid
again. Full refunds use the existing merchant refund workflow and original fee.

The checkout is your platform's page at `/pay`. It does not use a Razorpay account.
Its QR opens this checkout page; it is not a UPI transfer QR. No real card numbers,
CVV, UPI PIN, bank account or customer personal data is requested. All receipts
explicitly describe a simulation, not bank payment confirmation.

## Deploy and rollback

First run the additive migration against the same dedicated sandbox used by the
API. It adds collection metadata and optional scoped-key access while preserving
existing records, credentials, fee versions and balances:

```powershell
$env:APP_ENV = 'development'
$env:MIGRATION_TARGET = 'neon-sandbox'
node --env-file=apps/api/.env apps/api/scripts/migrate.mjs
```

Deploy the API before the frontend. Existing Render/Vercel variables from
[workspace setup](WORKSPACE_SETUP.md) are sufficient; no new secrets are required.
API build: `npm ci --include=dev && npm run build --workspace=@platform/api`.
Start: `node apps/api/dist/main.js`. Vercel root remains `apps/merchant-web`.

Old links are private until the owner clicks **Share checkout**. Old API keys keep
their previous payment permissions. Only newly created keys with **Allow order
creation and checkout links** enabled gain collection access. The owner can revoke
those keys. Public checkout audit records have no signed-in user and use explicit
`sandbox.checkout.*` action names.

Rollback: redeploy the prior API/frontend commit while leaving additive columns
and records intact, or disable `ENABLE_SANDBOX_WORKSPACE` to stop all sandbox
access. Do not drop tables or delete journals. Cancelling an unpaid request revokes
its checkout capability immediately. A published token remains the same when its
owner requests the URL again; keep the link available only to intended testers.

## Merchant workflow

1. Sign in as a merchant and open **Payment links**.
2. Enter a reference, amount in rupees and expiry, then create the link.
3. Click **Share checkout** and copy the URL, open it, or scan its QR on another device.
4. Choose UPI test or Card test and simulate success or failure.
5. Refresh the merchant dashboard. Transactions, commission, wallet/balance sheet,
   audit events and stored event history reflect the result. Refunds are available
   from captured transaction details, subject to available test balance.

## Server API

All amounts are integer paise, currency INR. These are sandbox endpoints.
Keep `sb_test_` keys on the merchant's server. Never embed them in a browser or app.
Create a key with collection permission in **Developers**.

```http
POST /v1/sandbox/orders
Authorization: Bearer <collection-enabled-test-key>
Idempotency-Key: order-request-unique-001
Content-Type: application/json

{"amountMinor":100000,"reference":"ORDER-1001","expiresInMinutes":1440}
```

The response includes `id`, `status`, `amountMinor`, `currency` and `expiresAt`.
Expiry accepts 1–10080 minutes and defaults to 1440 minutes. Preserve the response
ID and use a different idempotency key for each distinct operation.

```http
POST /v1/sandbox/orders/<id>/checkout
Authorization: Bearer <collection-enabled-test-key>
Idempotency-Key: checkout-request-unique-001
```

Use the returned `checkoutToken` to construct
`https://merchant-web-chi.vercel.app/pay#token=<checkoutToken>`. The fragment keeps
the capability out of the page request and referrer. Checkout sends it to the API
only in POST bodies. Do not log those bodies. Token hashes are indexed for lookup;
recoverable copies are encrypted with the existing server encryption key. Merchant
workspace listings omit both fields, and idempotency records omit the raw token.

```http
GET /v1/sandbox/orders/<id>
Authorization: Bearer <collection-enabled-test-key>
```

Verify saved order/payment status server-side. A URL redirect or a screenshot is
not proof of payment. Order lookup is tenant-scoped and includes the captured
payment's fee snapshot. Requests made from the dashboard and API appear together
in **Payment links**, with their type displayed.

Public checkout uses `POST /v1/sandbox/checkout/details` with `{ "token": "..." }`
and `POST /v1/sandbox/checkout/pay` with `token`, `method` (`upi`/`card`) and
`outcome` (`captured`/`failed`), plus `Idempotency-Key`. These public operations are
test-only and rate limited. The server derives amount, merchant and reference
from the stored request and rejects extra fields. Retry an uncertain response
with the same idempotency key and payload. Successful payments cannot be duplicated
by a new key, another tab or a reload.

## Local verification

`npm test` includes isolation, scope, expiry/cancellation, invalid capability,
amount tampering, failure/retry, duplicate payment, commission, refund and immutable
ledger checks. For a disposable browser preview, build the API then run:

```powershell
node apps/api/scripts/checkout-preview.mjs
```

This starts an in-memory PostgreSQL-compatible database on loopback port 3108;
it never reads `.env` or connects to Neon. Start the dashboard separately on 3107
with `NEXT_PUBLIC_SANDBOX_API_URL=http://127.0.0.1:3108`. The preview's synthetic
account is `checkout-owner@example.test`, password `Browser-test-password-123!`.
It is recreated on each preview start and has no access to the deployed system.

With both preview servers running, execute
`node apps/api/scripts/checkout-browser-test.mjs` from the repository root. It
checks share/QR, guest mobile checkout, decline/retry, exact commission, receipt
reload, refund, scoped API orders and cancellation in a real browser. On Windows
it uses installed Edge; elsewhere use a Playwright Chromium installation or set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`. The script never reads private credentials.

## Remaining live integration

Real collection requires an actual bank/acquirer/processor integration for this
platform's operating model. Provider-authenticated status must become the source
of truth for captures, refunds and settlement; public simulation choices cannot
be reused for live payments. Hosted/tokenized card input, verified provider
callbacks, reconciliation and operational onboarding remain necessary. Outgoing
merchant webhook delivery, recurring billing, disputes and bank payouts are not
implemented by this collection slice.
