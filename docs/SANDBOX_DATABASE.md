# Local sandbox database foundation

The identity schema is a local test foundation, not a login system. Use synthetic
fixtures only. No API endpoint uses these tables; there are no sessions, password
hashing, signup, login, MFA or active role permissions. Do not enter real data.

Create a dedicated local PostgreSQL database and account. The migration creates
`users`, `merchants`, `merchant_memberships`, and a migration tracking table.
It must never be pointed at an existing or production database. Its runner
accepts only a loopback database host and `APP_ENV=development`.

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

For rollback on a disposable local database, create a new empty test database or
restore its backup. Do not drop tables containing data; a production rollback and
data recovery plan requires separate review before any deployment.

The automated SQL test uses an in-memory PostgreSQL emulator. A real PostgreSQL
integration test, migration verification, backup/restore testing, secure login,
tenant authorization and operational review remain required.
