// Disposable loopback preview. Never connects to the configured Neon database.
import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PGlite } from '@electric-sql/pglite';
import { SandboxService } from '../dist/sandbox.service.js';
import { SandboxController } from '../dist/sandbox.controller.js';

if (process.env.RENDER === 'true') throw new Error('Preview is local only');
const db = new PGlite();
for (const id of ['002_workspace', '003_collections'])
  await db.exec(await readFile(new URL(`../migrations/${id}.sql`, import.meta.url), 'utf8'));
let tail = Promise.resolve();
async function connect() {
  const previous = tail;
  let release = () => {};
  tail = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  return {
    query: async (sql, values = []) => {
      const result = await db.query(sql, values);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    },
    release,
  };
}
const pool = {
  connect,
  query: async (sql, values = []) => {
    const client = await connect();
    try {
      return await client.query(sql, values);
    } finally {
      client.release();
    }
  },
  end: () => db.close(),
};
const service = new SandboxService(pool, '5'.repeat(64));
const seed = await service.register(
  {
    email: 'checkout-owner@example.test',
    password: 'Browser-test-password-123!',
    merchantName: 'Checkout Preview Merchant',
  },
  'local-preview',
);
await service.logout(await service.authenticate(`Bearer ${seed.token}`));
class PreviewModule {}
Module({
  controllers: [SandboxController],
  providers: [{ provide: SandboxService, useValue: service }],
})(PreviewModule);
const app = await NestFactory.create(PreviewModule, { logger: false });
app.enableCors({ origin: 'http://127.0.0.1:3107' });
await app.listen(3108, '127.0.0.1');
console.log(
  'Disposable checkout API ready at http://127.0.0.1:3108 (in-memory test database only).',
);
process.on('SIGINT', () => {
  void app.close().then(() => process.exit(0));
});
process.on('SIGTERM', () => {
  void app.close().then(() => process.exit(0));
});
