import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { PoolClient } from 'pg';
import { DataType, newDb } from 'pg-mem';
import { createSandboxIdentity } from './identity-store.js';

test('stores a user, merchant, and membership with normalized email', async () => {
  const db = newDb();
  db.public.registerFunction({
    name: 'trim',
    args: [DataType.text],
    returns: DataType.text,
    implementation: (value: string) => value.trim(),
  });
  db.public.registerFunction({
    name: 'length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (value: string) => value.length,
  });
  db.public.none(
    await readFile(new URL('../migrations/001_identity.sql', import.meta.url), 'utf8'),
  );
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();
  const client = await pool.connect();
  try {
    await createSandboxIdentity(client as unknown as PoolClient, {
      userId: '00000000-0000-4000-8000-000000000001',
      email: ' TEST@example.com ',
      passwordHash: 'fixture-hash-not-a-password',
      merchantId: '00000000-0000-4000-8000-000000000002',
      merchantName: ' Test merchant ',
    });
    assert.equal(db.public.many('SELECT email FROM users')[0]?.['email'], 'test@example.com');
    assert.equal(db.public.many('SELECT * FROM merchant_memberships').length, 1);
    assert.throws(() =>
      db.public.none(
        "INSERT INTO merchant_memberships (user_id, merchant_id) VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')",
      ),
    );
  } finally {
    client.release();
    await pool.end();
  }
});

test('rolls back identity creation when a write fails', async () => {
  const queries: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.startsWith('INSERT INTO merchants')) throw new Error('write failed');
    },
  };
  await assert.rejects(
    createSandboxIdentity(client as unknown as PoolClient, {
      userId: 'user',
      email: 'test@example.com',
      passwordHash: 'fixture',
      merchantId: 'merchant',
      merchantName: 'test',
    }),
    /write failed/,
  );
  assert.equal(queries[0], 'BEGIN');
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.equal(queries.includes('COMMIT'), false);
});
