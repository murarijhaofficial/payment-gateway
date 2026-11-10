# Sandbox deployment environment

The deployed API has only a read-only health endpoint. It does not connect to
the database or provide login, transactions, wallets or payments. Do not use real
user data. Publishing a sandbox does not make it production-ready.

## Render API

Set these in the Render service's environment settings:

| Variable       | Value                             | Purpose                                                                                |
| -------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| `APP_ENV`      | `production`                      | Keeps production CORS defaults and public binding. The app still reports sandbox-only. |
| `CORS_ORIGINS` | `https://your-project.vercel.app` | Exact allowed browser origins, comma-separated; no path or trailing slash.             |
| `NODE_VERSION` | `22`                              | Selects the Node version used by Render.                                               |

Render provides `PORT` and `RENDER`; do not set them manually. `PORT` selects
the listening port. The API does not use `DATABASE_URL`; setting it on Render
does not enable database access or login.

## Vercel merchant dashboard

Set the following for the intended Vercel deployment environment:

| Variable                      | Value                               |
| ----------------------------- | ----------------------------------- |
| `NEXT_PUBLIC_SANDBOX_API_URL` | `https://your-service.onrender.com` |

This is a public API origin, not a secret. Use the API base URL, with no `/health`
path. Next.js embeds it at build time, so redeploy after changing it. Ensure the
exact Vercel origin is present in `CORS_ORIGINS` on Render; preview deployments
may have different origins.

## Local sandbox migration tools

`DATABASE_URL`, `APP_ENV=development` and `MIGRATION_TARGET=neon-sandbox` are
used by the manual migration, verification and seed scripts, not the running
API. See [sandbox database instructions](SANDBOX_DATABASE.md). Never put a real
database URL in `.env.example`, client-side variables, Git or chat.
