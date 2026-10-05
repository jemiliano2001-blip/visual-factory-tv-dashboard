import assert from 'node:assert/strict';
import test from 'node:test';
import {
  abbreviate,
  generateTextLevels,
  generateOrderSmartSummary,
  extractAssignedEngineer,
  sanitizeOdooHtml,
} from './smartText';

test('abbreviate aplica el diccionario de manufactura y elimina conectores', () => {
  const input = 'Fabricación y maquinado de fixture para ensamble automático de piezas de aluminio';
  const result = abbreviate(input);
  assert.match(result, /Fab\./);
  assert.match(result, /Maq\./);
  assert.match(result, /Ensam\./);
  assert.match(result, /Auto\./);
  assert.match(result, /Alum\./);
  assert.equal(result.includes(' para '), false);
  assert.equal(result.includes(' de '), false);
});

test('generateTextLevels produce niveles progresivos sin duplicados', () => {
  const levels = generateTextLevels('Mantenimiento y reparación industrial');
  assert.ok(levels.length >= 2);
  assert.equal(levels[0], 'Mantenimiento y reparación industrial');
  assert.ok(levels[levels.length - 1].includes('Mant.'));
});

test('generateOrderSmartSummary abrevia producto y suma conteo de líneas', () => {
  const summarySingle = generateOrderSmartSummary({
    main_product: 'Servicio de soldadura y pintura industrial',
    lines_count: 1,
  });
  assert.match(summarySingle, /Serv\./);
  assert.match(summarySingle, /Sold\./);
  assert.match(summarySingle, /Pint\./);
  assert.equal(summarySingle.includes('líns'), false);

  const summaryMulti = generateOrderSmartSummary({
    main_product: 'Servicio de soldadura y pintura industrial',
    lines_count: 5,
  });
  assert.match(summaryMulti, /\(\+4 líns\)$/);
});

test('sanitizeOdooHtml remueve tags HTML y entidades de texto', () => {
  const html = '<p>OT&nbsp;00981: asignada a la <strong>ingeniera María López</strong></p>';
  const clean = sanitizeOdooHtml(html);
  assert.equal(clean, 'OT 00981: asignada a la ingeniera María López');
});

test('extractAssignedEngineer detecta ingeniero en líneas secundarias', () => {
  const engineer = extractAssignedEngineer({
    lines: [
      { name: 'Pieza base mecanizada' },
      { name: 'Retrabajo OT-00427 / Ing. José Núñez' },
    ],
  });
  assert.equal(engineer, 'Ing. José Núñez');
});

test('extractAssignedEngineer detecta ingeniera en notas HTML', () => {
  const engineer = extractAssignedEngineer({
    note: '<p>OT&nbsp;00981: asignada a la ingeniera María López</p>',
  });
  assert.equal(engineer, 'Ing. María López');
});

test('extractAssignedEngineer detecta ingeniero desde salesperson cuando lleva título', () => {
  const engineer = extractAssignedEngineer({
    salesperson: 'Ing. Antonio Vázquez',
  });
  assert.equal(engineer, 'Ing. Antonio Vázquez');
});

test('extractAssignedEngineer respeta order.engineer si ya viene provisto', () => {
  const engineer = extractAssignedEngineer({
    engineer: 'Carlos Ruiz',
  });
  assert.equal(engineer, 'Ing. Carlos Ruiz');
});

test('extractAssignedEngineer no confunde vendedor comercial sin título con ingeniero', () => {
  const engineer = extractAssignedEngineer({
    salesperson: 'Juan Pérez Comercial',
    lines: [{ name: 'Tornillos M8' }],
  });
  assert.equal(engineer, 'Sin asignar');
});
