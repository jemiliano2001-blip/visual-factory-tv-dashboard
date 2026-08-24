import assert from 'node:assert/strict';
import test from 'node:test';
import { getSmartCompanyName, stripLegalSuffixes, getCompanyAcronym } from './customerNames';

test('stripLegalSuffixes elimina razones sociales comunes', () => {
  assert.equal(
    stripLegalSuffixes('TERMOFORMADOS INDUSTRIALES DE MATAMOROS S.A. DE C.V.'),
    'TERMOFORMADOS INDUSTRIALES DE MATAMOROS'
  );
  assert.equal(
    stripLegalSuffixes('KOHLER SAN MARTIN S. DE R.L. DE C.V.'),
    'KOHLER SAN MARTIN'
  );
  assert.equal(
    stripLegalSuffixes('SUPRAJIT MEXICO S.A. DE C.V.'),
    'SUPRAJIT MEXICO'
  );
  assert.equal(
    stripLegalSuffixes('SILTECH DE MEXICO S.A. DE C.V.'),
    'SILTECH'
  );
});

test('getSmartCompanyName formatea marcas conocidas para TV y tarjetas', () => {
  // Termoformados
  assert.equal(
    getSmartCompanyName('TERMOFORMADOS INDUSTRIALES DE MATAMOROS S.A. DE C.V.', 'header'),
    'TIM MATAMOROS'
  );
  assert.equal(
    getSmartCompanyName('TERMOFORMADOS INDUSTRIALES DE MATAMOROS S.A. DE C.V.', 'card'),
    'TIM MATAMOROS'
  );

  // Kohler
  assert.equal(
    getSmartCompanyName('KOHLER REYNOSA S. DE R.L.', 'header'),
    'KOHLER REYNOSA'
  );
  assert.equal(
    getSmartCompanyName('KOHLER SAN MARTIN', 'card'),
    'KOHLER'
  );

  // Suprajit
  assert.equal(
    getSmartCompanyName('SUPRAJIT MEXICO S.A. DE C.V.', 'header'),
    'SUPRAJIT MEXICO'
  );
  assert.equal(
    getSmartCompanyName('SUPRAJIT MEXICO S.A. DE C.V.', 'card'),
    'SUPRAJIT'
  );

  // Fisher
  assert.equal(
    getSmartCompanyName('FISHER DYNAMICS S.A. DE C.V.', 'header'),
    'FISHER DYNAMICS'
  );
  assert.equal(
    getSmartCompanyName('FISHER DYNAMICS S.A. DE C.V.', 'compact'),
    'FISHER'
  );
});

test('getSmartCompanyName maneja clientes nuevos y desconocidos con fallback inteligente', () => {
  assert.equal(
    getSmartCompanyName('PRECISION DIES & MOLDS S.A. DE C.V.', 'header'),
    'PRECISION DIES & MOLDS'
  );
  assert.equal(
    getSmartCompanyName('AUTOMATIZACIONES Y ROBOTICA AVANZADA S.A. DE C.V.', 'card'),
    'AUTOMATIZACIONES Y'
  );
});

test('getCompanyAcronym genera monogramas legibles', () => {
  assert.equal(getCompanyAcronym('TIM MATAMOROS'), 'TM');
  assert.equal(getCompanyAcronym('KOHLER'), 'KOH');
  assert.equal(getCompanyAcronym('SUPRAJIT MEXICO'), 'SM');
  assert.equal(getCompanyAcronym('MECALUX LOGISTICA'), 'ML');
});
