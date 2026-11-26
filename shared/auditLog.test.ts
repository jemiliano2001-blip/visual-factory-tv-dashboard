import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuditEntry } from './auditLog';

test('buildAuditEntry excluye PII/secretos, trunca cadenas y conserva metadata', () => {
  const entry = buildAuditEntry({
    action: 'invoice_requests.create',
    actor: { uid: 'u-123', name: '  Ana   López  ' },
    resource: 'visual_factory_state/invoice_requests',
    outcome: 'success',
    details: {
      createdCount: 2,
      replayed: false,
      email: 'ana@smv.mx',
      actorEmail: 'ana@smv.mx',
      password: '123',
      token: 'abc',
      note: 'x'.repeat(250),
    },
    requestId: 'req-trace-001',
    now: '2026-11-23T12:00:00.000Z',
  });

  assert.equal(entry.actorUid, 'u-123');
  assert.equal(entry.actorName, 'Ana López');
  assert.equal(entry.requestId, 'req-trace-001');
  assert.equal(entry.createdAt, '2026-11-23T12:00:00.000Z');
  assert.equal(entry.details.createdCount, 2);
  assert.equal(entry.details.replayed, false);
  assert.equal(Object.hasOwn(entry.details, 'email'), false);
  assert.equal(Object.hasOwn(entry.details, 'actorEmail'), false);
  assert.equal(Object.hasOwn(entry.details, 'password'), false);
  assert.equal(Object.hasOwn(entry.details, 'token'), false);
  assert.equal((entry.details.note as string).length, 200);
});
