import React from 'react';
import type { AuroraMode } from '../services/auroraMode';

// Los colores "ciclan" deslizando una tira de degradado dentro de cada foco: así
// toda la animación es transform (compositor), sin repintar bajo el blur.
const TOP = [
  'rgba(37, 99, 235, 0.72)',
  'rgba(6, 182, 212, 0.65)',
  'rgba(16, 185, 129, 0.60)',
  'rgba(245, 158, 11, 0.65)',
  'rgba(168, 85, 247, 0.70)',
  'rgba(236, 72, 153, 0.65)',
];
const WAVE_1 = [
  'rgba(37, 99, 235, 0.50)',
  'rgba(6, 182, 212, 0.45)',
  'rgba(168, 85, 247, 0.50)',
  'rgba(236, 72, 153, 0.45)',
];
const WAVE_2 = [
  'rgba(147, 51, 234, 0.48)',
  'rgba(16, 185, 129, 0.42)',
  'rgba(245, 158, 11, 0.42)',
];
const CRIMSON = 'rgba(244, 63, 94, 0.70)';
const CORAL = 'rgba(251, 113, 133, 0.60)';

/** Tira al 200 % que repite la lista dos veces: desplazarla -50 % no deja costura. */
const strip = (colors: string[]) =>
  `linear-gradient(90deg, ${[...colors, ...colors, colors[0]].join(', ')})`;

const Blob: React.FC<{ className: string; move: string; seconds: number; colors: string[]; staticMode?: boolean }> = ({
  className,
  move,
  seconds,
  colors,
  staticMode = false,
}) => (
  <div
    className={`aurora-blob${staticMode ? ' aurora-blob--static' : ''} ${className}`}
    style={{ '--aurora-move': move, '--aurora-speed': `${seconds}s` } as React.CSSProperties}
  >
    <span style={{ backgroundImage: strip(colors) }} />
  </div>
);

interface GeminiOledBackgroundProps {
  mode: AuroraMode;
  /** Más de la mitad de lo visible está vencido (solo cuenta en modo reactivo). */
  urgent: boolean;
}

const GeminiOledBackground: React.FC<GeminiOledBackgroundProps> = ({ mode, urgent }) => (
  <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black">
    <Blob
      className="-top-[180px] left-[-12.5%] h-[380px] w-[125%] blur-[105px]"
      move="aurora-sway"
      seconds={urgent ? 8 : 12}
      colors={urgent ? [...TOP.slice(0, 3), CRIMSON, ...TOP.slice(3), CORAL] : TOP}
      staticMode={mode === 'oled-minimal'}
    />
    {mode !== 'oled-minimal' && (
      <>
        <Blob
          className="left-0 top-[28%] h-[550px] w-[750px] blur-[140px]"
          move="aurora-ltr"
          seconds={urgent ? 12 : 18}
          colors={urgent ? [...WAVE_1.slice(0, 2), CRIMSON, ...WAVE_1.slice(2)] : WAVE_1}
        />
        <Blob
          className="right-0 top-[42%] h-[500px] w-[700px] blur-[140px]"
          move="aurora-rtl"
          seconds={urgent ? 14 : 22}
          colors={urgent ? [...WAVE_2, CORAL] : WAVE_2}
        />
      </>
    )}
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.8)_100%)]" />
  </div>
);

export default GeminiOledBackground;
