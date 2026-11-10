import { appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { newToken, newTotpSecret } from '../dist/sandbox-security.js';

const path = fileURLToPath(new URL('../.env', import.meta.url));
try {
  process.loadEnvFile(path);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const values = {
  ENABLE_SANDBOX_WORKSPACE: 'true',
  SANDBOX_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  SANDBOX_MERCHANT_PASSWORD: newToken(),
  SANDBOX_ADMIN_PASSWORD: newToken(),
  SANDBOX_APPROVER_PASSWORD: newToken(),
  SANDBOX_ADMIN_TOTP_SECRET: newTotpSecret(),
  SANDBOX_APPROVER_TOTP_SECRET: newTotpSecret(),
};
const missing = Object.entries(values).filter(([key]) => !process.env[key]);
if (missing.length)
  await appendFile(
    path,
    '\n# Private sandbox settings; never commit this file.\n' +
      missing.map(([key, value]) => `${key}=${value}`).join('\n') +
      '\n',
    { mode: 0o600 },
  );
console.log('Private sandbox settings are ready in apps/api/.env. No secrets were printed.');
