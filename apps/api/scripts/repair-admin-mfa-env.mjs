import { readFile, writeFile, rename } from 'node:fs/promises';
import { URL } from 'node:url';
import { parseEnv } from 'node:util';
import process from 'node:process';
import console from 'node:console';
import pg from 'pg';
import { checkPassword, decryptSecret } from '../dist/sandbox-security.js';
import { validateSandboxTarget } from './sandbox-target.mjs';

if (process.env.RENDER === 'true') throw new Error('Run this local sandbox repair outside Render');
const path = new URL('../.env', import.meta.url);
const original = await readFile(path, 'utf8');
const local = parseEnv(original);
const connectionString = validateSandboxTarget(
  local.DATABASE_URL,
  process.env.APP_ENV ?? local.APP_ENV,
  process.env.MIGRATION_TARGET,
);
if (!/^[a-f0-9]{64}$/i.test(local.SANDBOX_ENCRYPTION_KEY ?? ''))
  throw new Error('The original SANDBOX_ENCRYPTION_KEY is required');
if (!local.SANDBOX_ADMIN_PASSWORD) throw new Error('The seeded administrator password is required');
const pool = new pg.Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10000,
  statement_timeout: 15000,
});
try {
  const { rows } = await pool.query(
    "SELECT password_hash, mfa_secret FROM sb_users WHERE id=$1 AND email=$2 AND role='platform_admin' AND merchant_id IS NULL",
    ['00000000-0000-4000-8000-000000000402', 'admin@example.test'],
  );
  const account = rows[0];
  if (!account || !(await checkPassword(account.password_hash, local.SANDBOX_ADMIN_PASSWORD)))
    throw new Error(
      'Seeded administrator identity/password could not be verified; no settings changed',
    );
  let secret;
  try {
    secret = decryptSecret(account.mfa_secret, local.SANDBOX_ENCRYPTION_KEY);
  } catch {
    throw new Error(
      'Cannot read the stored MFA setup with this encryption key; no settings changed',
    );
  }
  if (!/^[A-Z2-7]{16,64}$/.test(secret))
    throw new Error('Stored MFA setup is invalid; no settings changed');
  const line = /^[ \t]*(?:export[ \t]+)?SANDBOX_ADMIN_TOTP_SECRET[ \t]*=.*$/gm;
  const occurrences = [...original.matchAll(line)];
  if (occurrences.length > 1)
    throw new Error('Duplicate administrator MFA settings need manual review');
  const repaired = occurrences.length
    ? original.replace(line, `SANDBOX_ADMIN_TOTP_SECRET=${secret}`)
    : `${original}\nSANDBOX_ADMIN_TOTP_SECRET=${secret}\n`;
  if (repaired !== original) {
    if ((await readFile(path, 'utf8')) !== original)
      throw new Error('The private file changed during verification; retry');
    const temporary = new URL('../.env.mfa-repair', import.meta.url);
    await writeFile(temporary, repaired, { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  }
  console.log(
    'Private administrator MFA setting matches the existing seeded database record. No database changes, passwords, keys or tokens printed. Enrol this setup key in your authenticator; use its current six-digit code only in the login form.',
  );
} finally {
  await pool.end();
}
