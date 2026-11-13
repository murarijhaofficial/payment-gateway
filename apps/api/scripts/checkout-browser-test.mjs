// Run against checkout-preview.mjs and Next.js on loopback 3107 only.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import { chromium } from '@playwright/test';

const api = 'http://127.0.0.1:3108/v1/sandbox';
const web = 'http://127.0.0.1:3107';
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (process.platform === 'win32'
    ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
    : undefined);
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
let session;
async function workspace() {
  const response = await globalThis.fetch(`${api}/workspace`, {
    headers: { Authorization: `Bearer ${session}` },
  });
  assert.equal(response.status, 200);
  return response.json();
}
try {
  const merchant = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
  const errors = [];
  merchant.on('pageerror', (error) => errors.push(error.message));
  await merchant.goto(web);
  await merchant.locator('input[name=email]').fill('checkout-owner@example.test');
  await merchant.locator('input[name=password]').fill('Browser-test-password-123!');
  const loginResponse = merchant.waitForResponse((r) => r.url() === `${api}/auth/login`);
  await merchant.getByRole('button', { name: 'Sign in', exact: true }).click();
  const login = await loginResponse;
  assert.equal(login.status(), 201);
  session = (await login.json()).token;
  await merchant.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
  const before = Number((await workspace()).totals.merchant_balance);
  await merchant
    .locator('#workspace-nav')
    .getByRole('button', { name: 'Payment links', exact: true })
    .click();
  const reference = `BROWSER-${Date.now()}`;
  await merchant.locator('input[name=reference]').fill(reference);
  await merchant.locator('input[name=amount]').fill('123.45');
  await merchant.locator('select[name=expiresInMinutes]').selectOption('60');
  await merchant.getByRole('button', { name: 'Create test link', exact: true }).click();
  const linkRow = merchant.getByRole('row').filter({ hasText: reference });
  await linkRow.getByRole('button', { name: 'Share checkout', exact: true }).click();
  const share = merchant.getByRole('region', { name: 'Share checkout', exact: true });
  await share.waitFor();
  const checkoutUrl = await share.getByLabel('Checkout URL', { exact: true }).inputValue();
  assert.equal(new URL(checkoutUrl).pathname, '/pay');
  assert.equal(
    await share.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0),
    true,
  );
  const customerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const customer = await customerContext.newPage();
  customer.on('pageerror', (error) => errors.push(error.message));
  await customer.goto(checkoutUrl);
  await customer
    .getByRole('heading', { name: 'Complete your test payment', exact: true })
    .waitFor();
  assert.equal(await customer.locator('input[type=password]').count(), 0);
  assert.equal(
    await customer.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth,
    ),
    true,
  );
  await customer.getByRole('button', { name: 'Simulate a declined payment', exact: true }).click();
  await customer.getByRole('status').filter({ hasText: 'Test payment declined' }).waitFor();
  assert.equal(Number((await workspace()).totals.merchant_balance), before);
  await customer.locator('input[value=card]').check();
  await customer.getByRole('button', { name: /Complete test payment/ }).click();
  await customer.getByRole('heading', { name: 'Test payment successful', exact: true }).waitFor();
  const after = await workspace();
  assert.equal(Number(after.totals.merchant_balance), before + 12098);
  const captured = after.payments.filter(
    (p) => p.reference === reference && p.status === 'captured',
  );
  assert.equal(captured.length, 1);
  assert.equal(Number(captured[0].fee_minor), 247);
  await customer.reload();
  await customer.getByRole('heading', { name: 'Test payment successful', exact: true }).waitFor();
  assert.equal(Number((await workspace()).totals.merchant_balance), before + 12098);
  await merchant.getByRole('button', { name: 'Refresh', exact: true }).click();
  await linkRow.getByText('paid', { exact: true }).waitFor();
  await merchant
    .locator('#workspace-nav')
    .getByRole('button', { name: 'Transactions', exact: true })
    .click();
  const paymentRow = merchant
    .getByRole('row')
    .filter({ hasText: reference })
    .filter({ hasText: 'captured' });
  await paymentRow.getByRole('button', { name: reference, exact: true }).click();
  await merchant.locator('input[name=reason]').fill('Browser checkout refund');
  await merchant.getByRole('button', { name: 'Refund test payment', exact: true }).click();
  await merchant
    .getByRole('row')
    .filter({ hasText: reference })
    .filter({ hasText: 'refunded' })
    .waitFor();
  assert.equal(Number((await workspace()).totals.merchant_balance), before);
  await customer.reload();
  await customer.getByRole('heading', { name: 'Test payment refunded', exact: true }).waitFor();

  await merchant
    .locator('#workspace-nav')
    .getByRole('button', { name: 'Developers', exact: true })
    .click();
  await merchant.locator('input[name=label]').fill(`Collection-${reference}`);
  await merchant.locator('input[name=collectionsEnabled]').check();
  await merchant.getByRole('button', { name: 'Create test key', exact: true }).click();
  await merchant.locator('.secret-display code').waitFor();
  const key = await merchant.locator('.secret-display code').innerText();
  const orderRef = `API-${reference}`;
  const orderResponse = await globalThis.fetch(`${api}/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': randomUUID(),
    },
    body: JSON.stringify({ amountMinor: 75000, reference: orderRef }),
  });
  assert.equal(orderResponse.status, 201);
  const order = await orderResponse.json();
  const publish = await globalThis.fetch(`${api}/orders/${order.id}/checkout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Idempotency-Key': randomUUID() },
  });
  assert.equal(publish.status, 201);
  const capability = (await publish.json()).checkoutToken;
  await customer.goto(`${web}/pay#token=${capability}`);
  await customer
    .getByRole('heading', { name: 'Complete your test payment', exact: true })
    .waitFor();
  await merchant.getByRole('button', { name: 'Refresh', exact: true }).click();
  await merchant
    .locator('#workspace-nav')
    .getByRole('button', { name: 'Payment links', exact: true })
    .click();
  const orderRow = merchant.getByRole('row').filter({ hasText: orderRef });
  await orderRow.getByRole('button', { name: 'Cancel', exact: true }).click();
  await orderRow.getByText('cancelled', { exact: true }).waitFor();
  await customer.reload();
  await customer.getByRole('heading', { name: 'Payment request cancelled', exact: true }).waitFor();
  assert.equal(await customer.getByRole('button', { name: /Complete test payment/ }).count(), 0);
  assert.deepEqual(errors, []);
  await customerContext.close();
  console.log(
    'Browser collection flow passed: merchant creates/shares link and QR; unauthenticated mobile checkout declines then captures once; exact commission/balance; reload receipt; full refund; scoped API order; cancellation. No real database or funds used.',
  );
} finally {
  if (session)
    await globalThis.fetch(`${api}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  await browser.close();
}
