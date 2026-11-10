import assert from 'node:assert/strict';
import test from 'node:test';

import { canAccessMerchantResource } from './authorization.js';

test('requires an explicit permission on the requested merchant', () => {
  const grants = [
    { merchantId: 'merchant-a', permissions: ['payments:read'] },
    { merchantId: 'merchant-b', permissions: ['refunds:create'] },
  ];
  assert.equal(canAccessMerchantResource(grants, 'merchant-a', 'payments:read'), true);
  assert.equal(canAccessMerchantResource(grants, 'merchant-b', 'payments:read'), false);
  assert.equal(canAccessMerchantResource(grants, 'merchant-a', 'refunds:create'), false);
  assert.equal(canAccessMerchantResource(grants, 'merchant-c', 'payments:read'), false);
});

test('denies absent and malformed access requests', () => {
  assert.equal(canAccessMerchantResource([], 'merchant-a', 'payments:read'), false);
  assert.equal(canAccessMerchantResource([{ merchantId: '', permissions: [''] }], '', ''), false);
  assert.equal(
    canAccessMerchantResource([{ merchantId: 'a', permissions: ['*'] }], 'a', 'x'),
    false,
  );
});
