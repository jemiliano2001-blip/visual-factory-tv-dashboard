import React from 'react';
import type { HolidayParticle } from '../services/holidayTheme';

const COUNT = 22;
const TONES: Record<HolidayParticle, string[]> = {
  nieve: ['255,255,255', '226,232,240', '186,230,253'],
  destellos: ['253,224,71', '226,232,240', '165,180,252'],
  corazones: ['249,168,212', '240,171,252', '216,180,254'],
  petalos: ['251,207,232', '221,214,254', '255,255,255'],
  confeti: ['253,224,71', '226,232,240', '129,140,248', '249,168,212'],
};

// Reparto determinista (sin Math.random): pocas piezas, chicas y de varios tonos.
const pieces = (kind: HolidayParticle) =>
  Array.from({ length: COUNT }, (_, i) => ({
    x: (i * 37 + 11) % 100,
    delay: -((i * 53) % 27),
    size: 4 + ((i * 5) % 7),
    // Más grande = más cerca = cae más rápido (profundidad)
    dur: 34 - 2 * (4 + ((i * 5) % 7)) + ((i * 3) % 6),
    tone: TONES[kind][i % TONES[kind].length],
    y: (i * 29 + 7) % 100,
    drift: ((i * 11) % 13) - 6,
  }));

/** Partículas de fondo: solo transform/opacity, opacidad baja, sin eventos. Se ocultan con movimiento reducido (CSS). */
const HolidayParticles: React.FC<{ kind: HolidayParticle }> = ({ kind }) => (
  <div aria-hidden="true" className="holiday-particles pointer-events-none absolute inset-0">
    {pieces(kind).map((p, i) => (
      <span
        key={i}
        className={`holiday-particle holiday-particle--${kind}`}
        style={
          {
            '--x': `${p.x}%`,
            '--y': `${p.y}%`,
            '--delay': `${p.delay}s`,
            '--dur': `${p.dur}s`,
            '--size': `${p.size}px`,
            '--tone': p.tone,
            '--drift': `${p.drift}vw`,
            '--alpha': (0.3 + ((p.size - 4) / 6) * 0.3).toFixed(2),
          } as React.CSSProperties
        }
      />
    ))}
  </div>
);

export default HolidayParticles;
