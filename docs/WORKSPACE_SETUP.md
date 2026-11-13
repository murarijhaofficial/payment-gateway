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

No live UPI/card processing, bank withdrawals, public hosted checkout, outgoing
webhook delivery, email verification or password recovery is connected. Use only
synthetic `.test` account data. Rotate any previously exposed database password
and update the private connection string before making this sandbox publicly
available. Do not commit `.env` or publish its contents.
