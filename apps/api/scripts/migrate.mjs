import { readFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import pg from 'pg';
import { validateSandboxTarget } from './sandbox-target.mjs';

// The remote target must be a dedicated empty sandbox, not a production branch.
const connectionString = validateSandboxTarget(
  process.env.DATABASE_URL,
  process.env.APP_ENV,
  process.env.MIGRATION_TARGET,
);
if (process.env.RENDER === 'true') throw new Error('Run sandbox migrations outside Render');
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('sandbox_identity_migrations'))");
  await client.query('CREATE TABLE IF NOT EXISTS sandbox_schema_migrations (id TEXT PRIMARY KEY)');
  for (const id of ['001_identity', '002_workspace']) {
    const applied = await client.query('SELECT id FROM sandbox_schema_migrations WHERE id = $1', [
      id,
    ]);
    if (applied.rowCount === 0) {
      const sql = await readFile(new URL(`../migrations/${id}.sql`, import.meta.url), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO sandbox_schema_migrations (id) VALUES ($1)', [id]);
      console.log(`Applied ${id}`);
    } else console.log(`${id} already applied`);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
