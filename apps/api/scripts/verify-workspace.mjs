import 'reflect-metadata';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { totpAt } from '../dist/sandbox-security.js';
import { validateSandboxTarget } from './sandbox-target.mjs';

if (process.env.RENDER === 'true') throw new Error('Verify test accounts locally');
process.env.DATABASE_URL = validateSandboxTarget(
  process.env.DATABASE_URL,
  process.env.APP_ENV,
  process.env.MIGRATION_TARGET,
);
assert.equal(process.env.ENABLE_SANDBOX_WORKSPACE, 'true', 'Enable the sandbox workspace first');
const app = await NestFactory.create(AppModule, { logger: false });
try {
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const request = (path, token, body) =>
    globalThis.fetch(`${origin}/v1/sandbox/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: globalThis.AbortSignal.timeout(60000),
    });
  assert.equal((await request('workspace')).status, 401);
  for (const [email, passwordKey, mfaKey, role] of [
    ['merchant@example.test', 'SANDBOX_MERCHANT_PASSWORD', null, 'merchant_owner'],
    ['admin@example.test', 'SANDBOX_ADMIN_PASSWORD', 'SANDBOX_ADMIN_TOTP_SECRET', 'platform_admin'],
    [
      'approver@example.test',
      'SANDBOX_APPROVER_PASSWORD',
      'SANDBOX_APPROVER_TOTP_SECRET',
      'platform_admin',
    ],
  ]) {
    assert.ok(process.env[passwordKey], `Missing ${passwordKey}`);
    if (mfaKey) assert.ok(process.env[mfaKey], `Missing ${mfaKey}`);
    const login = await request('auth/login', null, {
      email,
      password: process.env[passwordKey],
      ...(mfaKey ? { otp: totpAt(process.env[mfaKey], Math.floor(Date.now() / 30000)) } : {}),
    });
    assert.equal(
      login.status,
      201,
      `${role} login failed (wait for a fresh MFA code before retrying)`,
    );
    const { token } = await login.json();
    assert.equal(typeof token, 'string');
    try {
      const response = await request('workspace', token);
      assert.equal(response.status, 200, `${role} workspace failed`);
      const workspace = await response.json();
      assert.equal(workspace.user.role, role);
      assert.equal(workspace.user.email, email);
      assert.ok(workspace.payments.length >= 3, 'Example payments missing');
      assert.ok(workspace.refunds.length >= 1, 'Example refund missing');
      assert.ok(workspace.settlements.length >= 1, 'Example settlement missing');
      assert.ok(workspace.journals.length >= 4, 'Example ledger missing');
      console.log(`${email}: HTTP login, role, workspace and sample records verified`);
    } finally {
      assert.equal((await request('auth/logout', token, {})).status, 201);
    }
    assert.equal((await request('workspace', token)).status, 401, 'Logout did not revoke session');
  }
  console.log('All verification sessions revoked. No credentials or tokens printed.');
} finally {
  await app.close();
}
