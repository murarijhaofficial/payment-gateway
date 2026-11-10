import assert from 'node:assert/strict';
import test from 'node:test';

import { getPlatformStatus } from './platform-status.js';

test('returns a verified sandbox-only health payload', async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({ status: 'ok', mode: 'sandbox-only', payments: 'not-enabled' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  const status = await getPlatformStatus(fetcher, 'http://127.0.0.1:3001');
  assert.deepEqual(status, { status: 'ok', mode: 'sandbox-only', payments: 'not-enabled' });
});

test('rejects a malformed health payload', async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({ status: 'ok', mode: 'live', payments: 'enabled' }), {
      status: 200,
    });

  await assert.rejects(() => getPlatformStatus(fetcher, 'http://127.0.0.1:3001'));
});
