import assert from 'node:assert/strict';
import test from 'node:test';
import { getCardPresentation, isLargeTVCard } from './cardPresentation';

test('conserva el color de progreso aun cuando la orden está vencida', () => {
  assert.equal(getCardPresentation({ progress: 0, isHighlighted: false, isOverdue: true, isCritical: true }).accentClass, 'bg-cyan-500/80');
  assert.equal(getCardPresentation({ progress: 45, isHighlighted: false, isOverdue: true, isCritical: true }).accentClass, 'bg-emerald-400');
  assert.equal(getCardPresentation({ progress: 100, isHighlighted: false, isOverdue: true, isCritical: true }).accentClass, 'bg-fuchsia-400');
});

test('aplica la escala grande en TV XL sin depender de una card ancha', () => {
  assert.equal(isLargeTVCard('tv', false, 'xl'), true);
  assert.equal(isLargeTVCard('tv', true, 'lg'), true);
  assert.equal(isLargeTVCard('desktop', true, 'xl'), false);
});
