import console from 'node:console';
import process from 'node:process';
import pg from 'pg';
import { validateSandboxTarget } from './sandbox-target.mjs';

const connectionString = validateSandboxTarget(
  process.env.DATABASE_URL,
  process.env.APP_ENV,
  process.env.MIGRATION_TARGET,
);
if (process.env.RENDER === 'true') throw new Error('Run sandbox checks outside Render');
const client = new pg.Client({ connectionString });
const expected = ['merchant_memberships', 'merchants', 'sandbox_schema_migrations', 'users'];
await client.connect();
try {
  const result = await client.query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[]) ORDER BY table_name',
    [expected],
  );
  if (result.rows.map((row) => row.table_name).join(',') !== expected.join(',')) {
    throw new Error('One or more expected tables were not found');
  }
  const migration = await client.query('SELECT id FROM sandbox_schema_migrations WHERE id = $1', [
    '001_identity',
  ]);
  if (migration.rowCount !== 1) throw new Error('Identity migration record was not found');
  console.log('Verified identity tables and migration record');
} finally {
  await client.end();
}
