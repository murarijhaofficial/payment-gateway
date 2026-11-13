# Sandbox deployment environment

The API supports database-backed sandbox login, administrator MFA, merchant-scoped
transactions, simulated wallets and settlements. Use synthetic data only.
See [workspace setup](WORKSPACE_SETUP.md) to migrate, prepare private credentials,
seed accounts and verify login before configuring the hosted services.

## Render API

| Variable                   | Value                                                                |
| -------------------------- | -------------------------------------------------------------------- |
| `APP_ENV`                  | `production`                                                         |
| `NODE_VERSION`             | `22`                                                                 |
| `ENABLE_SANDBOX_WORKSPACE` | `true`                                                               |
| `CORS_ORIGINS`             | `https://merchant-web-chi.vercel.app`                                |
| `DATABASE_URL`             | Private connection string for the same Neon sandbox used for seeding |
| `SANDBOX_ENCRYPTION_KEY`   | Exact 64-character hex value from private `apps/api/.env`            |

Render supplies `PORT` and `RENDER`. The encryption key must match the one used
when seeding administrator MFA. Never upload seed passwords or MFA setup keys.
`CORS_ORIGINS` accepts comma-separated exact origins without trailing slashes.
The application remains a sandbox even though `APP_ENV=production` enables the
hosted-server configuration.

Build: `npm ci --include=dev && npm run build --workspace=@platform/api`.
Start: `node apps/api/dist/main.js`. Health check: `/health`.

## Vercel dashboard

| Variable                      | Value                                       |
| ----------------------------- | ------------------------------------------- |
| `NEXT_PUBLIC_SANDBOX_API_URL` | `https://payment-gateway-2fez.onrender.com` |

Use root directory `apps/merchant-web`, with access to workspace files outside
the root. Include development dependencies during installation for TypeScript.
The API URL is public and embedded at build time: redeploy after changing it.
Database credentials, passwords and encryption keys must never be public variables.

## Local seed and verification only

Use `APP_ENV=development`, `MIGRATION_TARGET=neon-sandbox` and the private
`DATABASE_URL` for the documented scripts. `prepare-workspace.mjs` generates
`SANDBOX_MERCHANT_PASSWORD`, `SANDBOX_ADMIN_PASSWORD`, `SANDBOX_APPROVER_PASSWORD`,
`SANDBOX_ADMIN_TOTP_SECRET`, `SANDBOX_APPROVER_TOTP_SECRET` and
`SANDBOX_ENCRYPTION_KEY` in the ignored `.env`. These are not frontend variables.

Rotate the previously exposed Neon password before publicly enabling access.
Disabling `ENABLE_SANDBOX_WORKSPACE` and redeploying stops workspace access
without deleting records. No live payment processing or bank payouts are connected.
