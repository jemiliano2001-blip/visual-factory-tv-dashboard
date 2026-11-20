import assert from 'node:assert/strict';
import test from 'node:test';
import { computeContextMenuPosition } from './contextMenuPosition';

test('mantiene coordenadas intactas cuando el menu cabe holgadamente', () => {
  assert.deepEqual(
    computeContextMenuPosition({
      x: 200,
      y: 150,
      menuWidth: 220,
      menuHeight: 180,
      viewportWidth: 1280,
      viewportHeight: 800,
    }),
    { left: 200, top: 150 },
  );
});

test('voltea hacia la izquierda o arriba al rozar bordes derecho e inferior', () => {
  assert.deepEqual(
    computeContextMenuPosition({
      x: 1200,
      y: 720,
      menuWidth: 240,
      menuHeight: 200,
      viewportWidth: 1280,
      viewportHeight: 800,
    }),
    { left: 960, top: 520 },
  );
});

test('hace clamp si no hay espacio suficiente para voltear ni hacia atras', () => {
  assert.deepEqual(
    computeContextMenuPosition({
      x: 150,
      y: 120,
      menuWidth: 240,
      menuHeight: 220,
      viewportWidth: 300,
      viewportHeight: 280,
      margin: 8,
    }),
    { left: 52, top: 52 },
  );
});

test('respeta margen minimo ante coordenadas negativas o viewport menor que el menu', () => {
  assert.deepEqual(
    computeContextMenuPosition({
      x: -20,
      y: -10,
      menuWidth: 260,
      menuHeight: 240,
      viewportWidth: 220,
      viewportHeight: 200,
      margin: 8,
    }),
    { left: 8, top: 8 },
  );
});
