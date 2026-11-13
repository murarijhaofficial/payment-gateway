# Sandbox database foundation

For working merchant and administrator logins, use [connected workspace setup](WORKSPACE_SETUP.md).
Migration `002_workspace` adds the `sb_` authentication, transaction and ledger tables.
The older `001_identity` tables and fixtures described below are retained for
compatibility; their placeholder passwords cannot sign in. Use synthetic data only.

Create a dedicated local PostgreSQL database and account. The migration creates
`users`, `merchants`, `merchant_memberships`, and a migration tracking table.
It must never be pointed at an existing or production database. Its runner
accepts a loopback database or an explicitly selected Neon sandbox, and requires
`APP_ENV=development`.

From the repository root in PowerShell, set environment variables for this
terminal session, using your own local test credentials:

```powershell
$env:APP_ENV = 'development'
$env:DATABASE_URL = 'postgresql://sandbox_user:your_password@127.0.0.1:5432/gateway_sandbox'
npm.cmd run db:migrate --workspace=@platform/api
```

The command applies the initial schema in a transaction and records its version.
Running it again skips the applied migration. It does not load `.env` files.
Never paste credentials into source control or client-side environment variables.

## Dedicated Neon sandbox

Use a new empty, disposable Neon branch and confirm the selected connection string
belongs to that branch. A new branch copied from an existing parent can contain
data and tables. Do not use a production database or real data. The runner does
not verify whether the named branch is production or whether it contains data.

In the untracked `apps/api/.env` file set `DATABASE_URL` to the Neon sandbox
connection string, using `sslmode=require` or `sslmode=verify-full`. The runner
upgrades `require` to `verify-full` in memory. Do not share the connection string.
From the repository root run:

```powershell
$env:APP_ENV = 'development'
$env:MIGRATION_TARGET = 'neon-sandbox'
node --env-file=apps/api/.env apps/api/scripts/migrate.mjs
node --env-file=apps/api/.env apps/api/scripts/verify-sandbox.mjs
```

To add synthetic fixtures to the same sandbox, run:

```powershell
node --env-file=apps/api/.env apps/api/scripts/seed-sandbox.mjs
```

The seed creates `admin@example.test`, `merchant@example.test`, an example
merchant and a membership for the merchant fixture. The admin address is only
a label: neither account has an active role or a usable login. The script does
not create transactions or wallets. It never updates conflicting existing records
and rolls back if the fixed fixture identities are already in use.

Node 22 or later is required. This explicit `--env-file` option loads the file;
the API itself does not load it. The migration requires a Neon hostname and TLS
certificate verification and is not run automatically when the API starts. It
creates only the initial identity tables, and rolls back on an error. If a table
already exists without the migration record, it fails rather than changing it.
Re-run only after investigating the existing schema. To undo changes in a
disposable branch, restore its prior branch state or discard the branch after
confirming it contains no data to retain. Never drop tables on a shared database.

For rollback on a disposable local database, create a new empty test database or
restore its backup. Do not drop tables containing data; a production rollback and
data recovery plan requires separate review before any deployment.

The automated SQL test uses an in-memory PostgreSQL emulator. Real PostgreSQL
integration tests, backup/restore testing, secure login, tenant authorization and
operational review remain required.
