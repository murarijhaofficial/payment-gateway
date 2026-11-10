import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSandboxTarget } from './sandbox-target.mjs';

test('allows local development and explicitly selected TLS-verified Neon sandbox', () => {
  assert.doesNotThrow(() => validateSandboxTarget('postgresql://localhost/test', 'development'));
  assert.doesNotThrow(() =>
    validateSandboxTarget(
      'postgresql://test:secret@ep-test.eu.neon.tech/test?sslmode=verify-full',
      'development',
      'neon-sandbox',
    ),
  );
});

test('rejects unselected, insecure, ambiguous and non-Neon remote URLs', () => {
  const base = 'postgresql://test:secret@ep-test.eu.neon.tech/test';
  assert.throws(() => validateSandboxTarget(`${base}?sslmode=verify-full`, 'development'));
  assert.match(
    validateSandboxTarget(`${base}?sslmode=require`, 'development', 'neon-sandbox'),
    /sslmode=verify-full/,
  );
  assert.throws(() =>
    validateSandboxTarget(`${base}?sslmode=disable`, 'development', 'neon-sandbox'),
  );
  assert.throws(() =>
    validateSandboxTarget(
      `${base}?sslmode=verify-full&sslmode=disable`,
      'development',
      'neon-sandbox',
    ),
  );
  assert.throws(() =>
    validateSandboxTarget(
      'postgresql://other.example/test?sslmode=verify-full',
      'development',
      'neon-sandbox',
    ),
  );
  assert.throws(() =>
    validateSandboxTarget(`${base}?sslmode=verify-full`, 'production', 'neon-sandbox'),
  );
});
