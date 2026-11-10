import process from 'node:process';
import console from 'node:console';
import pg from 'pg';
import { validateSandboxTarget } from './sandbox-target.mjs';
import {
  hashPassword,
  checkPassword,
  encryptSecret,
  decryptSecret,
} from '../dist/sandbox-security.js';
import { SandboxService } from '../dist/sandbox.service.js';

if (process.env.RENDER === 'true') throw new Error('Seed test data from a local terminal only');
const connectionString = validateSandboxTarget(
  process.env.DATABASE_URL,
  process.env.APP_ENV,
  process.env.MIGRATION_TARGET,
);
const encryption = process.env.SANDBOX_ENCRYPTION_KEY;
if (!/^[a-f0-9]{64}$/i.test(encryption ?? ''))
  throw new Error('Prepare the sandbox encryption key first');
const pool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 10000 });
const merchantId = '00000000-0000-4000-8000-000000000301';
const users = [
  {
    id: '00000000-0000-4000-8000-000000000401',
    email: 'merchant@example.test',
    password: process.env.SANDBOX_MERCHANT_PASSWORD,
    role: 'merchant_owner',
    merchant: merchantId,
    secret: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000402',
    email: 'admin@example.test',
    password: process.env.SANDBOX_ADMIN_PASSWORD,
    role: 'platform_admin',
    merchant: null,
    secret: process.env.SANDBOX_ADMIN_TOTP_SECRET,
  },
  {
    id: '00000000-0000-4000-8000-000000000403',
    email: 'approver@example.test',
    password: process.env.SANDBOX_APPROVER_PASSWORD,
    role: 'platform_admin',
    merchant: null,
    secret: process.env.SANDBOX_APPROVER_TOTP_SECRET,
  },
];
for (const user of users)
  if (
    !user.password ||
    user.password.length < 12 ||
    (user.role === 'platform_admin' && !user.secret)
  )
    throw new Error('Run prepare-workspace.mjs before seeding');
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('sandbox_workspace_seed'))");
    await client.query('INSERT INTO sb_merchants (id,name) VALUES ($1,$2) ON CONFLICT DO NOTHING', [
      merchantId,
      'Example Test Merchant',
    ]);
    for (const user of users) {
      await client.query(
        'INSERT INTO sb_users (id,email,password_hash,role,merchant_id,mfa_secret) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
        [
          user.id,
          user.email,
          await hashPassword(user.password),
          user.role,
          user.merchant,
          user.secret ? encryptSecret(user.secret, encryption) : null,
        ],
      );
      const existing = (await client.query('SELECT * FROM sb_users WHERE id=$1', [user.id]))
        .rows[0];
      if (
        !existing ||
        existing.email !== user.email ||
        existing.role !== user.role ||
        existing.merchant_id !== user.merchant ||
        !(await checkPassword(existing.password_hash, user.password)) ||
        (user.secret && decryptSecret(existing.mfa_secret, encryption) !== user.secret)
      )
        throw new Error(
          'A seeded account already exists with different credentials. No accounts were overwritten.',
        );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const service = new SandboxService(pool, encryption);
  const owner = {
    userId: users[0].id,
    merchantId,
    email: users[0].email,
    role: 'merchant_owner',
    keyId: null,
    tokenHash: '',
  };
  await service.createPayment(owner, 'seed-upi-capture-0001', {
    amountMinor: 129900,
    reference: 'DEMO-1001',
    method: 'upi',
    outcome: 'captured',
  });
  const card = await service.createPayment(owner, 'seed-card-capture-0001', {
    amountMinor: 45500,
    reference: 'DEMO-1002',
    method: 'card',
    outcome: 'captured',
  });
  await service.createPayment(owner, 'seed-card-failure-0001', {
    amountMinor: 92000,
    reference: 'DEMO-1003',
    method: 'card',
    outcome: 'failed',
  });
  await service.refund(owner, 'seed-card-refund-0001', card.id, { reason: 'Example full refund' });
  await service.settlement(owner, 'seed-settlement-0001', { amountMinor: 50000 });
  await service.createLink(owner, 'seed-payment-link-0001', {
    amountMinor: 75000,
    reference: 'DEMO-LINK-1001',
  });
  console.log(
    'Workspace seeded: merchant, two MFA administrators, example transactions, refund, settlement, link and ledger. Credentials remain in local .env.',
  );
} finally {
  await pool.end();
}
