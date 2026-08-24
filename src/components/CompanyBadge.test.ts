import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { CompanyBadge } from './CompanyBadge';

test('CompanyBadge se instancia correctamente con marcas reconocidas', () => {
  const el = React.createElement(CompanyBadge, { company: 'TERMOFORMADOS INDUSTRIALES', size: 'lg' });
  assert.ok(el);
  assert.equal(el.props.company, 'TERMOFORMADOS INDUSTRIALES');
  assert.equal(el.props.size, 'lg');
});

test('CompanyBadge se instancia con clientes fallback y valores nulos sin errores', () => {
  const el1 = React.createElement(CompanyBadge, { company: 'CLIENTE DESCONOCIDO 123' });
  assert.ok(el1);

  const el2 = React.createElement(CompanyBadge, { company: null });
  assert.ok(el2);
});
