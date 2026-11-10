import { readFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import pg from 'pg';

// Prevent accidental application to a hosted database; this migration is test-only.
const connectionString = process.env.DATABASE_URL;
if (process.env.APP_ENV !== 'development' || !connectionString) {
  throw new Error('Set APP_ENV=development and DATABASE_URL to a local test database');
}
const url = new URL(connectionString);
if (
  !['postgres:', 'postgresql:'].includes(url.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
) {
  throw new Error('Only a local PostgreSQL test database is allowed');
}
const sql = await readFile(new URL('../migrations/001_identity.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('sandbox_identity_migrations'))");
  await client.query('CREATE TABLE IF NOT EXISTS sandbox_schema_migrations (id TEXT PRIMARY KEY)');
  const applied = await client.query('SELECT id FROM sandbox_schema_migrations WHERE id = $1', [
    '001_identity',
  ]);
  if (applied.rowCount === 0) {
    await client.query(sql);
    await client.query('INSERT INTO sandbox_schema_migrations (id) VALUES ($1)', ['001_identity']);
    console.log('Applied 001_identity');
  } else {
    console.log('001_identity already applied');
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
