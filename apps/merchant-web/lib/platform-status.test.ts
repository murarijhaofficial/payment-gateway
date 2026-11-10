import assert from 'node:assert/strict';
import test from 'node:test';

import { getPlatformStatus, resolveSandboxApiUrl } from './platform-status.js';

test('validates deployment API URLs and supports local development', () => {
  assert.equal(resolveSandboxApiUrl(undefined, false), null);
  assert.equal(resolveSandboxApiUrl('http://localhost:3001', false), null);
  assert.equal(resolveSandboxApiUrl('https://example.com/health', false), null);
  assert.equal(resolveSandboxApiUrl('https://user:password@example.com', false), null);
  assert.equal(resolveSandboxApiUrl('https://example.com/', false), 'https://example.com');
  assert.equal(resolveSandboxApiUrl(undefined, true), 'http://127.0.0.1:3001');
});

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
