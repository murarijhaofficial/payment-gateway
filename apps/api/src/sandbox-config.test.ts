import assert from 'node:assert/strict';
import test from 'node:test';
import { readSandboxConfig } from './sandbox-config.js';

test('sandbox activation requires explicit valid deployment settings without disclosing secrets', () => {
  assert.deepEqual(readSandboxConfig({}), { enabled: false });
  assert.deepEqual(readSandboxConfig({ ENABLE_SANDBOX_WORKSPACE: 'false' }), { enabled: false });
  assert.throws(
    () => readSandboxConfig({ ENABLE_SANDBOX_WORKSPACE: ' true ' }),
    /must be exactly true or false/,
  );
  assert.throws(
    () => readSandboxConfig({ ENABLE_SANDBOX_WORKSPACE: 'true' }),
    /DATABASE_URL is missing; SANDBOX_ENCRYPTION_KEY is missing/,
  );
  const databaseUrl = 'postgresql://test:synthetic-password@localhost/test';
  const env = { ENABLE_SANDBOX_WORKSPACE: 'true', DATABASE_URL: databaseUrl };
  for (const invalidKey of [
    'EXAMPLEAUTHENTICATORSETUPKEY',
    'a'.repeat(63),
    'a'.repeat(65),
    'z'.repeat(64),
    ` ${'a'.repeat(64)}`,
  ]) {
    assert.throws(
      () => readSandboxConfig({ ...env, SANDBOX_ENCRYPTION_KEY: invalidKey }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /64 hexadecimal characters/);
        assert.ok(!error.message.includes(invalidKey));
        assert.ok(!error.message.includes(databaseUrl));
        return true;
      },
    );
  }
  const encryptionKey = 'a'.repeat(64);
  assert.deepEqual(readSandboxConfig({ ...env, SANDBOX_ENCRYPTION_KEY: encryptionKey }), {
    enabled: true,
    databaseUrl,
    encryptionKey,
  });
  assert.throws(
    () =>
      readSandboxConfig({
        ...env,
        DATABASE_URL: 'not-a-url-with-private-value',
        SANDBOX_ENCRYPTION_KEY: encryptionKey,
      }),
    /valid PostgreSQL connection URL/,
  );
});
