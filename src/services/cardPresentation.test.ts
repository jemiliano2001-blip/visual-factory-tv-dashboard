import assert from 'node:assert/strict';
import test from 'node:test';
import { getCardPresentation, isLargeTVCard } from './cardPresentation';

const NOW = new Date('2026-10-02T18:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const card = (commitmentDate: Date | null, progress = 0) => getCardPresentation({ progress, commitmentDate, now: NOW });

test('el color sigue los días de atraso: ámbar hasta 7, naranja hasta 30, rojo después', () => {
  assert.equal(card(daysAgo(0.5)).tone, 'recent');
  assert.equal(card(daysAgo(7)).tone, 'recent');
  assert.equal(card(daysAgo(8)).tone, 'late');
  assert.equal(card(daysAgo(30)).tone, 'late');
  assert.equal(card(daysAgo(31)).tone, 'severe');
  assert.equal(card(daysAgo(7)).accentClass, 'bg-amber-400');
  assert.equal(card(daysAgo(20)).accentClass, 'bg-orange-500');
  assert.equal(card(daysAgo(80)).accentClass, 'bg-red-500');
});

test('una orden a tiempo es cian y sin fecha es neutra, sin importar el avance parcial', () => {
  assert.equal(card(inDays(10)).tone, 'onTime');
  assert.equal(card(inDays(10), 45).accentClass, 'bg-cyan-500/80');
  assert.equal(card(null).tone, 'none');
  assert.equal(card(null).accentClass, 'bg-zinc-500/60');
});

test('una orden entregada al 100 % conserva el fucsia aunque esté atrasada', () => {
  assert.equal(card(daysAgo(40), 100).tone, 'delivered');
  assert.equal(card(daysAgo(40), 100).accentClass, 'bg-fuchsia-400');
});

test('la etiqueta de tiempo dice cuántos días de atraso o cuánto falta', () => {
  assert.equal(card(daysAgo(80)).timingLabel, 'Atraso 80 d');
  assert.equal(card(daysAgo(0.5)).timingLabel, 'Venció hoy');
  assert.equal(card(inDays(0.4)).timingLabel, 'Vence hoy');
  assert.equal(card(inDays(1.5)).timingLabel, 'Vence en 2 d');
  assert.equal(card(inDays(10)).timingLabel, 'Vence en 10 d');
  assert.equal(card(null).timingLabel, 'Sin fecha');
  assert.equal(card(daysAgo(40), 100).timingLabel, 'Entregada');
});

test('solo las recién atrasadas parpadean: 33 tarjetas pulsando serían ruido', () => {
  assert.equal(card(daysAgo(3)).pulse, true);
  assert.equal(card(daysAgo(20)).pulse, false);
  assert.equal(card(daysAgo(80)).pulse, false);
  assert.equal(card(inDays(3)).pulse, false);
});

test('la tarjeta no usa brillo: sin clase de glow en la presentación', () => {
  assert.equal('glowClass' in card(daysAgo(3)), false);
});

test('aplica la escala grande en TV XL sin depender de una card ancha salvo si es densa', () => {
  assert.equal(isLargeTVCard('tv', false, 'xl'), true);
  assert.equal(isLargeTVCard('tv', false, 'xl', true), false);
  assert.equal(isLargeTVCard('tv', true, 'lg'), true);
  assert.equal(isLargeTVCard('tv', true, 'lg', true), false);
  assert.equal(isLargeTVCard('desktop', true, 'xl'), false);
});
