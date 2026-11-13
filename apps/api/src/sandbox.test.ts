import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { SandboxService } from './sandbox.service.js';
import { SandboxController } from './sandbox.controller.js';
import {
  checkPassword,
  decryptSecret,
  encryptSecret,
  hashPassword,
  newTotpSecret,
  totpAt,
} from './sandbox-security.js';

test('security primitives hash passwords, protect MFA secrets, and match the TOTP test vector', async () => {
  const password = 'Synthetic-passphrase-123!';
  const hash = await hashPassword(password);
  assert.equal(await checkPassword(hash, password), true);
  assert.equal(await checkPassword(hash, 'wrong'), false);
  const key = '1'.repeat(64),
    encrypted = encryptSecret('secret', key);
  assert.equal(decryptSecret(encrypted, key), 'secret');
  assert.throws(() => decryptSecret(encrypted, '2'.repeat(64)));
  assert.equal(totpAt('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1), '287082');
});

test('PostgreSQL sandbox: authentication, tenant isolation, money, refunds, keys and dual-control fees', async () => {
  const db = new PGlite();
  await db.exec(
    await readFile(new URL('../migrations/002_workspace.sql', import.meta.url), 'utf8'),
  );
  await db.exec(
    await readFile(new URL('../migrations/003_collections.sql', import.meta.url), 'utf8'),
  );
  let tail = Promise.resolve();
  async function connect() {
    const previous = tail;
    let release = () => {};
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return {
      query: async (sql: string, values: unknown[] = []) => {
        const r = await db.query(sql, values);
        return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
      },
      release,
    };
  }
  const adapter = {
    connect,
    query: async (sql: string, values: unknown[] = []) => {
      const c = await connect();
      try {
        return await c.query(sql, values);
      } finally {
        c.release();
      }
    },
  };
  const key = '3'.repeat(64),
    service = new SandboxService(adapter as unknown as Pool, key);
  const password = 'Synthetic-passphrase-123!';
  try {
    const first = await service.register(
      { email: 'owner@example.test', password, merchantName: 'Demo One' },
      'test-1',
    );
    const second = await service.register(
      { email: 'other@example.test', password, merchantName: 'Demo Two' },
      'test-2',
    );
    const one = await service.authenticate(`Bearer ${first.token}`),
      two = await service.authenticate(`Bearer ${second.token}`);
    await assert.rejects(() =>
      service.register({ email: 'real@example.com', password, merchantName: 'Invalid' }, 'test-3'),
    );
    await assert.rejects(() =>
      service.login({ email: 'owner@example.test', password: 'Incorrect-password-123!' }, 'test-4'),
    );
    const login = await service.login({ email: 'owner@example.test', password }, 'test-4');
    assert.equal((await service.authenticate(`Bearer ${login.token}`)).merchantId, one.merchantId);
    const input = {
      amountMinor: 100000,
      reference: 'test-order',
      method: 'upi',
      outcome: 'captured',
    };
    const idem = randomUUID();
    const [payment, replay] = await Promise.all([
      service.createPayment(one, idem, input),
      service.createPayment(one, idem, input),
    ]);
    assert.deepEqual(payment, replay);
    const id = (payment as { id: string }).id;
    await assert.rejects(() => service.createPayment(one, idem, { ...input, amountMinor: 200000 }));
    await assert.rejects(() => service.refund(two, randomUUID(), id, { reason: 'Cross tenant' }));
    assert.equal((await service.transactions(two)).length, 0);
    let view = await service.workspace(one);
    assert.equal(Number(view.totals?.['merchant_balance']), 98000);
    await service.refund(one, randomUUID(), id, { reason: 'Test refund' });
    view = await service.workspace(one);
    assert.equal(Number(view.totals?.['merchant_balance']), 0);
    await assert.rejects(() =>
      service.refund(one, randomUUID(), id, { reason: 'Duplicate refund' }),
    );
    await service.createPayment(one, randomUUID(), { ...input, outcome: 'failed' });
    assert.equal(Number((await service.workspace(one)).totals?.['merchant_balance']), 0);
    await service.createPayment(one, randomUUID(), input);
    await service.settlement(one, randomUUID(), { amountMinor: 80000 });
    await assert.rejects(() => service.settlement(one, randomUUID(), { amountMinor: 20000 }));
    assert.equal(Number((await service.workspace(one)).totals?.['merchant_balance']), 18000);
    const link = (await service.createLink(one, randomUUID(), {
      amountMinor: 50000,
      reference: 'Link test',
    })) as { id: string };
    await service.createPayment(one, randomUUID(), {
      ...input,
      amountMinor: 50000,
      linkId: link.id,
    });
    await assert.rejects(() =>
      service.createPayment(one, randomUUID(), { ...input, amountMinor: 50000, linkId: link.id }),
    );
    const apiKey = await service.createKey(one, { label: 'Integration test' });
    const machine = await service.authenticate(`Bearer ${apiKey.secret}`);
    await assert.rejects(() => service.workspace(machine));
    await assert.rejects(() => service.revokeKey(two, apiKey.id));
    assert.equal((await service.transactions(machine)).length, 4);
    await service.revokeKey(one, apiKey.id);
    await assert.rejects(() => service.authenticate(`Bearer ${apiKey.secret}`));
    await assert.rejects(() =>
      service.proposeFee(one, randomUUID(), { bps: 350, reason: 'No permission' }),
    );
    const admins = [];
    for (let i = 0; i < 2; i++) {
      const secret = newTotpSecret(),
        email = `admin${i}@example.test`;
      await adapter.query(
        "INSERT INTO sb_users (id,email,password_hash,role,mfa_secret) VALUES ($1,$2,$3,'platform_admin',$4)",
        [randomUUID(), email, await hashPassword(password), encryptSecret(secret, key)],
      );
      await assert.rejects(() => service.login({ email, password }, `admin-${i}`));
      const otp = totpAt(secret, Math.floor(Date.now() / 30000));
      const logged = await service.login({ email, password, otp }, `admin-${i}`);
      await assert.rejects(() => service.login({ email, password, otp }, `admin-${i}`));
      admins.push(await service.authenticate(`Bearer ${logged.token}`));
    }
    const adminA = admins[0]!,
      adminB = admins[1]!;
    const proposal = (await service.proposeFee(adminA, randomUUID(), {
      bps: 350,
      reason: 'Sandbox pricing test',
    })) as { id: string };
    await assert.rejects(() => service.approveFee(adminA, randomUUID(), proposal.id));
    await service.approveFee(adminB, randomUUID(), proposal.id);
    const repriced = (await service.createPayment(one, randomUUID(), input)) as {
      feeMinor: number;
    };
    assert.equal(repriced.feeMinor, 3500);
    const old = await adapter.query('SELECT fee_minor FROM sb_payments WHERE id=$1', [id]);
    assert.equal(Number((old.rows[0] as Record<string, unknown>)['fee_minor']), 2000);
    const countBefore = (await service.transactions(one)).length;
    await db.exec(
      "CREATE FUNCTION sb_test_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test failure'; END; $$; CREATE TRIGGER test_reject_event BEFORE INSERT ON sb_webhook_events FOR EACH ROW EXECUTE FUNCTION sb_test_reject_event();",
    );
    await assert.rejects(() => service.createPayment(one, randomUUID(), input));
    assert.equal(
      (await service.transactions(one)).length,
      countBefore,
      'financial writes roll back when a later operation fails',
    );
    await db.exec(
      'DROP TRIGGER test_reject_event ON sb_webhook_events; DROP FUNCTION sb_test_reject_event();',
    );
    // Public collection capabilities never grant merchant or administrator access.
    const limitedKey = await service.createKey(one, { label: 'No collection scope' });
    const limited = await service.authenticate(`Bearer ${limitedKey.secret}`);
    await assert.rejects(() =>
      service.createOrder(limited, randomUUID(), { amountMinor: 99900, reference: 'ORDER' }),
    );
    const collectionKey = await service.createKey(one, {
      label: 'Collection server',
      collectionsEnabled: true,
    });
    const collectionMachine = await service.authenticate(`Bearer ${collectionKey.secret}`);
    const orderKey = randomUUID();
    const orderInput = { amountMinor: 99900, reference: 'ORDER', expiresInMinutes: 60 };
    const order = (await service.createOrder(collectionMachine, orderKey, orderInput)) as {
      id: string;
    };
    assert.equal(
      ((await service.createOrder(collectionMachine, orderKey, orderInput)) as { id: string }).id,
      order.id,
    );
    await assert.rejects(() =>
      service.createOrder(collectionMachine, orderKey, { ...orderInput, amountMinor: 1 }),
    );
    await assert.rejects(() => service.publishCheckout(two, randomUUID(), order.id));
    await assert.rejects(() => service.publishCheckout(limited, randomUUID(), order.id));
    await assert.rejects(() => service.order(two, order.id));
    await assert.rejects(() => service.order(limited, order.id));
    const checkout = await service.publishCheckout(collectionMachine, randomUUID(), order.id);
    const publishedAgain = await service.publishCheckout(collectionMachine, randomUUID(), order.id);
    assert.equal(
      checkout.checkoutToken,
      publishedAgain.checkoutToken,
      'publishing keeps the same active capability',
    );
    const details = await service.checkoutDetails({ token: checkout.checkoutToken }, 'public-test');
    assert.equal(details.amountMinor, 99900);
    assert.equal(details.merchantName, 'Demo One');
    assert.equal(details.status, 'active');
    await assert.rejects(() => service.authenticate(`Bearer ${checkout.checkoutToken}`));
    await assert.rejects(() => service.checkoutDetails({ token: 'x'.repeat(43) }, 'public-test'));
    const beforeCheckout = Number((await service.workspace(one)).totals?.['merchant_balance']);
    const payInput = { token: checkout.checkoutToken, method: 'upi', outcome: 'captured' };
    await assert.rejects(() =>
      service.payCheckout(randomUUID(), { ...payInput, amountMinor: 1 }, 'public-test'),
    );
    await assert.rejects(() =>
      service.payCheckout(randomUUID(), { ...payInput, merchantId: two.merchantId }, 'public-test'),
    );
    const failed = (await service.payCheckout(
      randomUUID(),
      { ...payInput, outcome: 'failed' },
      'public-test',
    )) as { status: string };
    assert.equal(failed.status, 'failed');
    assert.equal(
      Number((await service.workspace(one)).totals?.['merchant_balance']),
      beforeCheckout,
    );
    assert.equal(
      (await service.checkoutDetails({ token: checkout.checkoutToken }, 'public-test')).status,
      'active',
    );
    const payKey = randomUUID();
    const [collected, collectedReplay] = await Promise.all([
      service.payCheckout(payKey, payInput, 'public-test'),
      service.payCheckout(payKey, payInput, 'public-test'),
    ]);
    assert.deepEqual(collected, collectedReplay);
    const collectedId = (collected as { id: string }).id;
    assert.equal(
      Number((await service.workspace(one)).totals?.['merchant_balance']),
      beforeCheckout + 96403,
    );
    const collectionRows = await adapter.query('SELECT * FROM sb_journals WHERE source_id=$1', [
      collectedId,
    ]);
    assert.equal(collectionRows.rows.length, 1);
    assert.equal(Number((collectionRows.rows[0] as Record<string, unknown>)['income_delta']), 3497);
    assert.equal((await service.order(collectionMachine, order.id)).status, 'paid');
    assert.equal(
      (await service.checkoutDetails({ token: checkout.checkoutToken }, 'public-test')).status,
      'paid',
    );
    await assert.rejects(() => service.payCheckout(randomUUID(), payInput, 'public-test'));
    await assert.rejects(() =>
      service.payCheckout(payKey, { ...payInput, method: 'card' }, 'public-test'),
    );
    const publicAudit = await adapter.query(
      "SELECT actor FROM sb_audit WHERE resource_id=$1 AND action='sandbox.checkout.captured'",
      [collectedId],
    );
    assert.equal((publicAudit.rows[0] as Record<string, unknown>)['actor'], null);
    const privateLinks = (await service.workspace(one)).links;
    assert.ok(
      privateLinks.every(
        (row) => !('checkout_token_ciphertext' in row) && !('checkout_token_hash' in row),
      ),
    );
    const expiredOrder = (await service.createOrder(one, randomUUID(), orderInput)) as {
      id: string;
    };
    const expiredCheckout = await service.publishCheckout(one, randomUUID(), expiredOrder.id);
    await adapter.query(
      "UPDATE sb_payment_links SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [expiredOrder.id],
    );
    assert.equal(
      (await service.checkoutDetails({ token: expiredCheckout.checkoutToken }, 'public-test'))
        .status,
      'expired',
    );
    await assert.rejects(() =>
      service.payCheckout(
        randomUUID(),
        { ...payInput, token: expiredCheckout.checkoutToken },
        'public-test',
      ),
    );
    const cancelledOrder = (await service.createOrder(one, randomUUID(), orderInput)) as {
      id: string;
    };
    const cancelledCheckout = await service.publishCheckout(one, randomUUID(), cancelledOrder.id);
    await service.cancelLink(one, randomUUID(), cancelledOrder.id);
    await assert.rejects(() =>
      service.payCheckout(
        randomUUID(),
        { ...payInput, token: cancelledCheckout.checkoutToken },
        'public-test',
      ),
    );
    await service.refund(one, randomUUID(), collectedId, { reason: 'Public checkout test refund' });
    assert.equal(
      (await service.checkoutDetails({ token: checkout.checkoutToken }, 'public-test')).payment?.[
        'status'
      ],
      'refunded',
    );
    assert.equal(
      Number((await service.workspace(one)).totals?.['merchant_balance']),
      beforeCheckout,
    );
    await service.revokeKey(one, collectionKey.id);
    await assert.rejects(() => service.authenticate(`Bearer ${collectionKey.secret}`));
    await assert.rejects(() => adapter.query('UPDATE sb_journals SET income_delta=0'));
    await assert.rejects(() => adapter.query('DELETE FROM sb_audit'));
    await assert.rejects(() => adapter.query('UPDATE sb_fee_versions SET bps=0'));
    await service.logout(one);
    await assert.rejects(() => service.authenticate(`Bearer ${first.token}`));
    @Module({
      controllers: [SandboxController],
      providers: [{ provide: SandboxService, useValue: service }],
    })
    class TestModule {}
    const app = await NestFactory.create(TestModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    try {
      const base = await app.getUrl();
      assert.equal((await fetch(`${base}/v1/sandbox/workspace`)).status, 401);
      const checkoutHttp = await fetch(`${base}/v1/sandbox/checkout/details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: checkout.checkoutToken }),
      });
      assert.equal(
        checkoutHttp.status,
        201,
        'public checkout details do not require a merchant login',
      );
      assert.equal(((await checkoutHttp.json()) as { status: string }).status, 'paid');
      assert.equal(
        (
          await fetch(`${base}/v1/sandbox/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderInput),
          })
        ).status,
        401,
      );
      const response = await fetch(`${base}/v1/sandbox/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'other@example.test', password }),
      });
      assert.equal(response.status, 201);
      const payload = (await response.json()) as { token: string };
      const workspace = await fetch(`${base}/v1/sandbox/workspace`, {
        headers: { Authorization: `Bearer ${payload.token}` },
      });
      assert.equal(workspace.status, 200);
      const snapshot = (await workspace.json()) as { payments: unknown[] };
      assert.equal(snapshot.payments.length, 0);
      const bad = await fetch(`${base}/v1/sandbox/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${payload.token}`,
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({ ...input, merchantId: one.merchantId }),
      });
      assert.equal(bad.status, 400, 'caller cannot choose another merchant');
    } finally {
      await app.close();
    }
  } finally {
    await db.close();
  }
});
