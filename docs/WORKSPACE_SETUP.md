# Connected sandbox accounts

The workspace uses `sb_users`, not the older `users` fixture table. It supports
Argon2id passwords, expiring bearer sessions, merchant-scoped records and
authenticator-based MFA for administrators. All payment operations are simulations.

## Prepare and seed

From the repository root, using Node 22 or later:

```powershell
npm.cmd run build --workspace=@platform/api
node apps/api/scripts/prepare-workspace.mjs
$env:APP_ENV = 'development'
$env:MIGRATION_TARGET = 'neon-sandbox'
node --env-file=apps/api/.env apps/api/scripts/migrate.mjs
node --env-file=apps/api/.env apps/api/scripts/seed-workspace.mjs
node --env-file=apps/api/.env apps/api/scripts/verify-workspace.mjs
```

The preparation command adds missing private settings to the ignored
`apps/api/.env` file. It does not print passwords or overwrite existing settings.
The seed creates the following test accounts. No passwords are stored in Git.

| Account                 | Password variable in private `.env` | MFA setup key                  |
| ----------------------- | ----------------------------------- | ------------------------------ |
| `merchant@example.test` | `SANDBOX_MERCHANT_PASSWORD`         | Not required                   |
| `admin@example.test`    | `SANDBOX_ADMIN_PASSWORD`            | `SANDBOX_ADMIN_TOTP_SECRET`    |
| `approver@example.test` | `SANDBOX_APPROVER_PASSWORD`         | `SANDBOX_APPROVER_TOTP_SECRET` |

For each administrator, add a time-based account to an authenticator using its
setup key (SHA-1, six digits, 30-second period). Enter the current six-digit code
at login, not the setup key. A used code cannot be reused; wait for the next one
if necessary. The second administrator exists to test separate-person fee approval.
These sandbox TOTP controls do not replace production phishing-resistant MFA.

For easier enrollment, generate a private offline QR page from the existing
encrypted administrator record. This verifies the saved password and setup key
without consuming a login code:

```powershell
npm.cmd run build --workspace=@platform/api
$env:APP_ENV = 'development'
$env:MIGRATION_TARGET = 'neon-sandbox'
node apps/api/scripts/prepare-admin-authenticator.mjs
```

Open `apps/api/.env.admin-authenticator.html` locally in a browser, then scan its
QR code using the authenticator app's Add account option. Use the changing code
shown in that app at login. The page is Git-ignored, makes no network requests,
and contains the MFA setup secret but no password. Do not upload or screenshot it;
delete it after enrollment. This does not rotate any exposed credentials.

Keep `SANDBOX_ADMIN_TOTP_SECRET` as the permanent setup key in `.env`. Never replace
it with a six-digit login code. If that local value was accidentally overwritten,
the following local-only recovery verifies the seeded administrator password and
restores the existing setup key from its encrypted database record:

```powershell
$env:APP_ENV = 'development'
$env:MIGRATION_TARGET = 'neon-sandbox'
node apps/api/scripts/repair-admin-mfa-env.mjs
```

It changes only the private local setting, without resetting the database account
or its MFA enrolment. It does not rotate an exposed key. Add the restored key to
your authenticator and enter the current six-digit code on the website; the key
itself and passwords should never be shared in chat or screenshots.

The seed also adds captured/failed payments, a full refund, a simulated settlement,
a test link and balanced ledger records. Running it again does not duplicate the
example operations. Conflicting existing credentials cause an error instead of
silently resetting accounts.

Verification starts a temporary loopback API against the configured sandbox,
checks all three HTTP logins and workspace records, then revokes its sessions.
It uses the current administrator authenticator codes; wait for the next code
before signing in manually or repeating verification.

## Render environment

Set the following on the existing API service, then redeploy:

```text
APP_ENV=production
NODE_VERSION=22
ENABLE_SANDBOX_WORKSPACE=true
CORS_ORIGINS=https://merchant-web-chi.vercel.app
DATABASE_URL=<private connection string for the same Neon sandbox>
SANDBOX_ENCRYPTION_KEY=<exact value generated in apps/api/.env>
```

Render supplies `PORT` and `RENDER`. Do not upload seed passwords, MFA setup keys,
or `MIGRATION_TARGET` to Render. The API uses the stored password hashes and
encrypted MFA secrets. Use the same encryption key that was used for seeding;
changing it arbitrarily makes existing administrator MFA secrets unreadable.

Build: `npm ci --include=dev && npm run build --workspace=@platform/api`.
Start: `node apps/api/dist/main.js`. Health path: `/health`.

### Login returns 503: workspace is not configured

To prepare the exact existing credentials for import without copying seed passwords
or MFA keys, run from the repository root:

```powershell
npm.cmd run build --workspace=@platform/api
node apps/api/scripts/export-render-env.mjs
```

The generated `apps/api/.env.render` is private and Git-ignored. In the existing
Render service, choose **Environment > Add from .env**, import its contents, check
that the listed variables replace any old values, then **Save and deploy**. Do not
commit this file. Regenerate it after changing the private database connection string.
Import the complete file through **Add from .env** so its quoting is parsed; when
editing one value manually, copy the value without surrounding quotes.

### Startup fails: database URL or encryption key invalid

The server must have both values before it can enable workspace login. The
encryption key is the existing **64 hexadecimal characters** in
`SANDBOX_ENCRYPTION_KEY`, not `SANDBOX_ADMIN_TOTP_SECRET` or a six-digit login code.
Use the private import file above. Do not generate a new encryption key for an
already seeded database, disable validation, or upload the full development `.env`.

### Workspace still disabled after deployment

This exact error means the running API's `ENABLE_SANDBOX_WORKSPACE` value is
missing or is not exactly `true`. The database URL and encryption key must also
be configured before enabling it. Editing your local `.env` does not update Render.

Open the existing API service in Render, select **Environment**, and add or update
the variables above. Copy the encryption key from the private `.env` used when
seeding; do not generate a different key. Choose **Save and deploy** so the running
service receives the new settings. **Save only** leaves the current process unchanged.
See [Render's environment-variable instructions](https://render.com/docs/configure-environment-variables).

An authenticator setup key is different from an encryption key and from a login
code. Add `SANDBOX_ADMIN_TOTP_SECRET` to an authenticator as a time-based account;
enter only the app's current six-digit code in the login form. Keep setup keys
private; a setup key shown in chat or screenshots needs replacement in both the
encrypted database record and the private configuration, followed by enrolling
the replacement in the authenticator. Changing `.env` alone will not rotate an
already-seeded administrator's MFA secret.

## Vercel environment

```text
NEXT_PUBLIC_SANDBOX_API_URL=https://payment-gateway-2fez.onrender.com
```

Use root directory `apps/merchant-web` and include files outside the root for
workspace configuration. Redeploy when changing this public build-time value.
Never add database credentials or encryption keys to `NEXT_PUBLIC_` variables.

## Rollback and limits

The new migration adds isolated `sb_` tables and preserves the older fixtures.
Disable `ENABLE_SANDBOX_WORKSPACE` and redeploy to stop access without deleting
records. To invalidate sessions in a controlled maintenance operation, delete
only `sb_sessions`; do not delete posted journals or financial records. Preserve
a branch backup before destructive cleanup. Removing tables is not an automatic
rollback. Commission changes require a distinct administrator to approve; existing
payments are not repriced.

Public test checkout and shareable collection links are described in
[payment collection](PAYMENT_COLLECTION.md). No live UPI/card processing, bank withdrawals, outgoing
webhook delivery, email verification or password recovery is connected. Use only
synthetic `.test` account data. Rotate any previously exposed database password
and update the private connection string before making this sandbox publicly
available. Do not commit `.env` or publish its contents.
