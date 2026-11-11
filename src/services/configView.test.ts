import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanyConfig } from '../types';
import { buildScheduleRows, filterScheduleRows, resolveClientName, validateScheduleInput } from './configView';

const cfg = (company_name: string, delivery_schedule: string, updatedAt = new Date('2026-11-01T10:00:00Z'), id = company_name): CompanyConfig =>
  ({ id, company_name, delivery_schedule, updatedAt });
const ord = (partner_name: string, delivery_times: string | null = null) => ({ partner_name, delivery_times });

test('Odoo manda: con delivery_times y config manual → source odoo y conserva el manual', () => {
  const [row] = buildScheduleRows([ord('SUPRAJIT', 'L-V 9-11')], [cfg('SUPRAJIT', 'L-V 8-17')]);
  assert.equal(row.source, 'odoo');
  assert.equal(row.odoo, 'L-V 9-11');
  assert.equal(row.manual, 'L-V 8-17');
});

test('solo manual → source manual y no huérfano si tiene órdenes', () => {
  const [row] = buildScheduleRows([ord('BOSCH')], [cfg('BOSCH', 'L-V 8-17')]);
  assert.equal(row.source, 'manual');
  assert.equal(row.orphan, false);
});

test('config sin órdenes → huérfano y aparece', () => {
  const rows = buildScheduleRows([], [cfg('VIEJO SA', 'L-V 8-17')]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].orphan, true);
  assert.equal(rows[0].configId, 'VIEJO SA');
});

test('cliente con órdenes y sin horario → none', () => {
  const [row] = buildScheduleRows([ord('MECALUX')], []);
  assert.equal(row.source, 'none');
  assert.equal(row.configId, null);
});

test('"Bosch " en Firestore y "BOSCH" en órdenes → una sola fila con nombre de Odoo', () => {
  const rows = buildScheduleRows([ord('BOSCH')], [cfg('Bosch ', 'L-V 8-17')]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'BOSCH');
  assert.equal(rows[0].manual, 'L-V 8-17');
});

test('delivery_times vacío o de solo espacios no cuenta como horario de Odoo', () => {
  const rows = buildScheduleRows([ord('A', '   '), ord('B', null)], []);
  assert.deepEqual(rows.map(r => r.odoo), [null, null]);
});

test('toma el primer delivery_times no vacío entre las órdenes del cliente', () => {
  const [row] = buildScheduleRows([ord('A', null), ord('A', ' L-V 9 ')], []);
  assert.equal(row.odoo, 'L-V 9');
});

test('updatedAt Date(0) → null', () => {
  const [row] = buildScheduleRows([], [cfg('A', 'x', new Date(0))]);
  assert.equal(row.updatedAt, null);
});

test('ordena por nombre con es-MX', () => {
  const rows = buildScheduleRows([ord('ZETA'), ord('ÁLAMO'), ord('BETA')], []);
  assert.deepEqual(rows.map(r => r.name), ['ÁLAMO', 'BETA', 'ZETA']);
});

test('filterScheduleRows ignora acentos y mayúsculas; término vacío devuelve todo', () => {
  const rows = buildScheduleRows([ord('PEREZ SA'), ord('BOSCH')], []);
  assert.deepEqual(filterScheduleRows(rows, 'pérez').map(r => r.name), ['PEREZ SA']);
  assert.equal(filterScheduleRows(rows, '  ').length, 2);
});

test('resolveClientName usa el nombre exacto de Odoo ("Bosch" → "BOSCH") porque la TV compara exacto', () => {
  const rows = buildScheduleRows([ord('BOSCH')], []);
  assert.equal(resolveClientName('  bosch ', rows), 'BOSCH');
});

test('resolveClientName deja el nombre recortado si no coincide con ningún cliente', () => {
  const rows = buildScheduleRows([ord('BOSCH')], []);
  assert.equal(resolveClientName(' Nuevo SA ', rows), 'Nuevo SA');
});

test('validateScheduleInput: mensajes y límites', () => {
  assert.deepEqual(validateScheduleInput('  ', 'x'), { ok: false, error: 'Escribe el nombre del cliente.' });
  assert.deepEqual(validateScheduleInput('A', '   '), { ok: false, error: 'Escribe el horario de entrega.' });
  assert.deepEqual(validateScheduleInput('a'.repeat(101), 'x'), { ok: false, error: 'El nombre admite hasta 100 caracteres.' });
  assert.deepEqual(validateScheduleInput('A', 'x'.repeat(501)), { ok: false, error: 'El horario admite hasta 500 caracteres.' });
  assert.deepEqual(validateScheduleInput(' ' + 'a'.repeat(100) + ' ', 'x'.repeat(500)), { ok: true });
});
