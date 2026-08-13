import assert from 'node:assert/strict';
import test from 'node:test';
import { hasAdminClaim } from './adminAccess';

test('solo reconoce el custom claim admin booleano', () => {
  assert.equal(hasAdminClaim({ admin: true }), true);
  assert.equal(hasAdminClaim({ admin: 'true' }), false);
  assert.equal(hasAdminClaim({}), false);
  assert.equal(hasAdminClaim(null), false);
});
