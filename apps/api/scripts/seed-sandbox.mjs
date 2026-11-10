import console from 'node:console';
import process from 'node:process';
import pg from 'pg';
import { validateSandboxTarget } from './sandbox-target.mjs';

// Fixed test fixtures. The marker is not a password hash and must never authenticate.
const disabledHash = '!sandbox-login-disabled!';
const users = [
  { id: '00000000-0000-4000-8000-000000000101', email: 'admin@example.test' },
  { id: '00000000-0000-4000-8000-000000000102', email: 'merchant@example.test' },
];
const merchant = { id: '00000000-0000-4000-8000-000000000201', name: 'Example Test Merchant' };
if (process.env.RENDER === 'true' || process.env.MIGRATION_TARGET !== 'neon-sandbox') {
  throw new Error('Seed only an explicitly selected Neon sandbox from a local terminal');
}
const connectionString = validateSandboxTarget(
  process.env.DATABASE_URL,
  process.env.APP_ENV,
  process.env.MIGRATION_TARGET,
);
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('sandbox_fixture_seed'))");
  for (const user of users) {
    await client.query(
      'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [user.id, user.email, disabledHash],
    );
    const found = await client.query(
      'SELECT id FROM users WHERE id = $1 AND email = $2 AND password_hash = $3',
      [user.id, user.email, disabledHash],
    );
    if (found.rowCount !== 1) throw new Error('User fixture conflicts with an existing record');
  }
  await client.query('INSERT INTO merchants (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
    merchant.id,
    merchant.name,
  ]);
  const foundMerchant = await client.query('SELECT id FROM merchants WHERE id = $1 AND name = $2', [
    merchant.id,
    merchant.name,
  ]);
  if (foundMerchant.rowCount !== 1)
    throw new Error('Merchant fixture conflicts with an existing record');
  await client.query(
    'INSERT INTO merchant_memberships (user_id, merchant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [users[1].id, merchant.id],
  );
  await client.query('COMMIT');
  console.log('Sandbox fixtures present: 2 users, 1 merchant, 1 membership; login disabled');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
