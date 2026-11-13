import { writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { readSandboxConfig } from '../dist/sandbox-config.js';

if (process.env.RENDER === 'true') throw new Error('Prepare the private Render settings locally');
process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
const config = readSandboxConfig(process.env);
if (!config.enabled)
  throw new Error('Set ENABLE_SANDBOX_WORKSPACE=true in private apps/api/.env first');
const values = {
  APP_ENV: 'production',
  NODE_VERSION: '22',
  ENABLE_SANDBOX_WORKSPACE: 'true',
  CORS_ORIGINS: 'https://merchant-web-chi.vercel.app',
  DATABASE_URL: config.databaseUrl,
  SANDBOX_ENCRYPTION_KEY: config.encryptionKey,
};
for (const value of Object.values(values))
  if (/[\r\n]/.test(value)) throw new Error('Deployment settings must contain single-line values');
await writeFile(
  new URL('../.env.render', import.meta.url),
  '# PRIVATE: import into the existing Render service Environment. Never commit or share.\n' +
    Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join('\n') +
    '\n',
  { mode: 0o600 },
);
console.log(
  'Prepared private apps/api/.env.render. Import it with Render Environment > Add from .env, then Save and deploy. No secrets were printed.',
);
