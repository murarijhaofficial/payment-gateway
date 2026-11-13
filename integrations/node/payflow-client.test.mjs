import assert from 'node:assert/strict';
import test from 'node:test';
import { PayflowSandboxClient } from './payflow-client.mjs';

const id = '00000000-0000-4000-8000-000000000123';
const key = `sb_test_${'a'.repeat(43)}`;
const config = { apiOrigin: 'https://api.example.test', checkoutOrigin: 'https://checkout.example.test', secretKey: key };
const order = { id, reference: 'LOCAL-123', amountMinor: 10000, currency: 'INR', status: 'paid', mode: 'sandbox-only', payment: { id, amountMinor: 10000, status: 'captured' } };

test('website client verifies amount/reference and never treats simulated capture as fulfillable', async () => {
  let current = order;
  const client = new PayflowSandboxClient({ ...config, fetchImpl: async (url, options) => {
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    assert.equal(options.redirect, 'error');
    assert.ok(url.startsWith(config.apiOrigin));
    return new globalThis.Response(JSON.stringify(current));
  } });
  const verified = await client.verifyOrder(id, { amountMinor: 10000, reference: 'LOCAL-123' });
  assert.equal(verified.result, 'simulated-captured');
  assert.equal(verified.canFulfill, false);
  await assert.rejects(() => client.verifyOrder(id, { amountMinor: 9999, reference: 'LOCAL-123' }));
  await assert.rejects(() => client.verifyOrder(id, { amountMinor: 10000, reference: 'OTHER' }));
  current = { ...order, payment: { ...order.payment, amountMinor: 1 } };
  await assert.rejects(() => client.verifyOrder(id, { amountMinor: 10000, reference: 'LOCAL-123' }));
  current = { ...order, mode: 'live' };
  await assert.rejects(() => client.getOrder(id), /environment/);
});

test('website client rejects unsafe configuration and produces fragment checkout URLs without exposing API keys', async () => {
  assert.throws(() => new PayflowSandboxClient({ ...config, apiOrigin: 'http://remote.example.test' }));
  assert.throws(() => new PayflowSandboxClient({ ...config, apiOrigin: 'https://user:pass@example.test' }));
  assert.throws(() => new PayflowSandboxClient({ ...config, secretKey: 'live-key' }));
  const client = new PayflowSandboxClient({ ...config, fetchImpl: async () => new globalThis.Response(JSON.stringify({ id, checkoutToken: 'b'.repeat(43), expiresAt: '2030-01-01T00:00:00Z', mode: 'sandbox-only' })) });
  const checkout = await client.checkoutForOrder(id, 'checkout-request-001');
  assert.equal(checkout.checkoutUrl, `https://checkout.example.test/pay#token=${'b'.repeat(43)}`);
  assert.ok(!JSON.stringify(checkout).includes(key));
  await assert.rejects(() => client.checkoutForOrder('../other', 'checkout-request-001'));
  await assert.rejects(() => client.checkoutForOrder(id, 'short'));
  await assert.rejects(() => client.createOrder({ amountMinor: 10.5, reference: 'X' }, 'order-request-001'));
});
