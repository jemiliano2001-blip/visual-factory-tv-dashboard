import assert from 'node:assert/strict';
import test from 'node:test';
import { getCardPresentation, isLargeTVCard } from './cardPresentation';

test('conserva el color de progreso aun cuando la orden está vencida', () => {
  assert.equal(getCardPresentation({ progress: 0, isHighlighted: false, isOverdue: true, isCritical: true }).accentClass, 'bg-cyan-500/80');
  assert.equal(getCardPresentation({ progress: 45, isHighlighted: false, isOverdue: true, isCritical: true }).accentClass, 'bg-emerald-400');
  assert.equal(getCardPresentation({ progress: 100, isHighlighted: false, isOverdue: true, isCritical: true }).accentClass, 'bg-fuchsia-400');
});

test('la urgencia ya no pinta la superficie: no hay anillo ni glow rojo encima del avance', () => {
  const vencida = getCardPresentation({ progress: 0, isHighlighted: false, isOverdue: true, isCritical: true });
  const sana = getCardPresentation({ progress: 0, isHighlighted: false, isOverdue: false, isCritical: false });
  // Una tarjeta vencida y una sana comparten exactamente el mismo tratamiento de
  // superficie; el aviso de vencida vive solo en el badge.
  assert.deepEqual(vencida, sana);
  assert.equal('urgencyClass' in vencida, false);
});

test('aplica la escala grande en TV XL sin depender de una card ancha', () => {
  assert.equal(isLargeTVCard('tv', false, 'xl'), true);
  assert.equal(isLargeTVCard('tv', true, 'lg'), true);
  assert.equal(isLargeTVCard('desktop', true, 'xl'), false);
});
