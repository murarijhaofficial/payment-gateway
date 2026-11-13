import { readFile, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { parseEnv } from 'node:util';
import process from 'node:process';
import console from 'node:console';
import pg from 'pg';
import QRCode from 'qrcode';
import { checkPassword, decryptSecret } from '../dist/sandbox-security.js';
import { validateSandboxTarget } from './sandbox-target.mjs';

if (process.env.RENDER === 'true') throw new Error('Prepare authenticator enrollment locally');
const local = parseEnv(await readFile(new URL('../.env', import.meta.url), 'utf8'));
const connectionString = validateSandboxTarget(
  local.DATABASE_URL,
  process.env.APP_ENV ?? local.APP_ENV,
  process.env.MIGRATION_TARGET,
);
if (!/^[a-f0-9]{64}$/i.test(local.SANDBOX_ENCRYPTION_KEY ?? ''))
  throw new Error('The original encryption key is required');
if (!local.SANDBOX_ADMIN_PASSWORD) throw new Error('The seeded administrator password is required');
const pool = new pg.Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10000,
  statement_timeout: 15000,
});
try {
  const { rows } = await pool.query(
    "SELECT password_hash,mfa_secret FROM sb_users WHERE id=$1 AND email=$2 AND role='platform_admin' AND merchant_id IS NULL",
    ['00000000-0000-4000-8000-000000000402', 'admin@example.test'],
  );
  const account = rows[0];
  if (!account || !(await checkPassword(account.password_hash, local.SANDBOX_ADMIN_PASSWORD)))
    throw new Error('The local administrator password does not match the seeded account');
  let secret;
  try {
    secret = decryptSecret(account.mfa_secret, local.SANDBOX_ENCRYPTION_KEY);
  } catch {
    throw new Error('The encryption key cannot read the stored administrator MFA setup');
  }
  if (!/^[A-Z2-7]{16,64}$/.test(secret))
    throw new Error('Stored administrator MFA setup is invalid');
  if (secret !== local.SANDBOX_ADMIN_TOTP_SECRET)
    throw new Error('Repair the local MFA setting with repair-admin-mfa-env.mjs before enrollment');
  const uri = new URL('otpauth://totp/Payflow%20Sandbox:admin%40example.test');
  uri.searchParams.set('secret', secret);
  uri.searchParams.set('issuer', 'Payflow Sandbox');
  uri.searchParams.set('algorithm', 'SHA1');
  uri.searchParams.set('digits', '6');
  uri.searchParams.set('period', '30');
  const qr = await QRCode.toDataURL(uri.toString(), {
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 320,
  });
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><title>Private Payflow administrator setup</title>
<style>body{font:17px/1.55 system-ui,sans-serif;background:#eef3f8;color:#10213b;margin:0;padding:24px}main{max-width:680px;margin:24px auto;background:white;padding:32px;border-radius:18px}h1{font-size:28px;line-height:1.2}img{display:block;width:320px;max-width:100%;height:auto;margin:24px auto}li{margin:12px 0}.private{color:#7b3f00;background:#fff3db;padding:12px;border-radius:8px}code{overflow-wrap:anywhere}summary{cursor:pointer}small{color:#425674}</style></head>
<body><main><p class="private">Private enrollment file. Keep this page and its QR code out of screenshots, chat and source control.</p>
<h1>Set up your administrator authenticator</h1><p>Account: <strong>admin@example.test</strong></p>
<ol><li>Open your authenticator app on your phone. Choose <strong>Add account</strong>, then <strong>Scan QR code</strong>.</li>
<li>Scan the QR code below. Your app should show <strong>Payflow Sandbox: admin@example.test</strong> with a code that changes every 30 seconds.</li>
<li>Open your Payflow sign-in page. Enter your email and password, then the <strong>current six-digit code from the app</strong>. Use a fresh code if the countdown is almost finished.</li></ol>
<img src="${qr}" width="320" height="320" alt="Private administrator authenticator enrollment QR code">
<details><summary>Cannot scan? Enter the setup key manually</summary><p>Choose a time-based account, then enter this setup key:</p><code>${secret}</code><p>SHA-1, 6 digits, 30 seconds.</p></details>
<p>Keep your phone's date and time set automatically. A fixed code will expire; an already used code cannot sign in again.</p>
<p><small>This file was generated offline after checking the existing database account. It makes no network requests and contains no password. Delete it after enrollment. It preserves existing MFA and does not rotate previously exposed credentials.</small></p>
</main></body></html>`;
  await writeFile(new URL('../.env.admin-authenticator.html', import.meta.url), html, {
    mode: 0o600,
  });
  console.log(
    'Administrator password and MFA setup match the database. Private QR setup saved to apps/api/.env.admin-authenticator.html. Open it locally in a browser and scan with your authenticator. No secret values printed; no login code consumed.',
  );
} finally {
  await pool.end();
}
