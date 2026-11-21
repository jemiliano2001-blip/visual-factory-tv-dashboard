import React from 'react';
import type { SceneKind } from '../services/holidayTheme';
import { BIRTHDAY_BASE_URL } from '../services/birthdayTheme';

const PINE_XS = [70, 145, 340, 510, 760, 890, 1080, 1380, 1520, 1790, 1860] as const;
const HOUSE_XS = [220, 640, 1240, 1660] as const;

const BUILDINGS_BACK = [
  [30, 58, 28], [92, 44, 20], [142, 72, 34], [220, 52, 24], [300, 64, 30],
  [372, 48, 22], [460, 78, 32], [546, 56, 26], [620, 68, 35], [700, 50, 21],
  [790, 70, 29], [870, 60, 34], [940, 54, 23], [1030, 74, 31], [1114, 48, 25],
  [1180, 66, 33], [1260, 52, 20], [1340, 76, 30], [1430, 58, 27], [1510, 68, 34],
  [1590, 46, 22], [1670, 72, 29], [1750, 56, 32], [1820, 78, 25],
] as const;

const BUILDINGS_FRONT = [
  [60, 46, 22], [175, 58, 26], [260, 42, 18], [340, 62, 27], [490, 50, 21],
  [580, 66, 28], [670, 44, 19], [745, 56, 24], [835, 64, 29], [980, 52, 22],
  [1070, 60, 26], [1150, 46, 20], [1220, 68, 27], [1305, 50, 19], [1390, 64, 25],
  [1475, 48, 21], [1550, 60, 28], [1630, 52, 22], [1710, 66, 26], [1795, 48, 20],
] as const;

const FIREWORKS = [
  { cx: 420, cy: 15, color: '#facc15', delay: '0s' },
  { cx: 960, cy: 13, color: '#cbd5e1', delay: '1.7s' },
  { cx: 1500, cy: 16, color: '#818cf8', delay: '3.4s' },
] as const;

const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;

const CROWN_XS = [360, 960, 1560] as const;

const BALLOONS = [
  { x: 130, y: 17, color: '#f472b6', delay: '0s', heart: false },
  { x: 270, y: 15, color: '#c084fc', delay: '0.8s', heart: true },
  { x: 440, y: 18, color: '#f472b6', delay: '1.6s', heart: true },
  { x: 610, y: 14, color: '#c084fc', delay: '2.4s', heart: false },
  { x: 780, y: 17, color: '#f472b6', delay: '0.4s', heart: false },
  { x: 960, y: 14, color: '#c084fc', delay: '1.2s', heart: true },
  { x: 1140, y: 18, color: '#f472b6', delay: '2.0s', heart: false },
  { x: 1310, y: 15, color: '#c084fc', delay: '2.8s', heart: true },
  { x: 1490, y: 17, color: '#f472b6', delay: '0.6s', heart: false },
  { x: 1660, y: 14, color: '#c084fc', delay: '1.8s', heart: true },
  { x: 1810, y: 18, color: '#f472b6', delay: '2.6s', heart: false },
] as const;

const PARTY_BALLOONS = [
  { x: 150, y: 17, color: '#38bdf8', delay: '0s' },
  { x: 330, y: 14, color: '#f472b6', delay: '0.9s' },
  { x: 520, y: 18, color: '#facc15', delay: '1.7s' },
  { x: 720, y: 15, color: '#a78bfa', delay: '0.5s' },
  { x: 1200, y: 17, color: '#f472b6', delay: '1.3s' },
  { x: 1400, y: 14, color: '#38bdf8', delay: '2.1s' },
  { x: 1590, y: 18, color: '#a78bfa', delay: '0.3s' },
  { x: 1780, y: 15, color: '#facc15', delay: '1.5s' },
] as const;

const POTS = [
  { x: 160, flower: '#f9a8d4', delay: '0s' },
  { x: 400, flower: '#c4b5fd', delay: '0.9s' },
  { x: 650, flower: '#f8fafc', delay: '1.8s' },
  { x: 960, flower: '#f9a8d4', delay: '0.5s' },
  { x: 1270, flower: '#c4b5fd', delay: '1.4s' },
  { x: 1520, flower: '#f8fafc', delay: '2.2s' },
  { x: 1760, flower: '#f9a8d4', delay: '1.1s' },
] as const;

/** Estrella de 5 puntas centrada en (cx, cy). */
const starPoints = (cx: number, cy: number, outer: number, inner: number): string => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (-Math.PI / 2) + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
};

/** Escena decorativa sutil al fondo del footer para temas festivos. */
const HolidayScene: React.FC<{ kind: SceneKind }> = ({ kind }) => (
  <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
    <svg
      className="h-full w-full opacity-60"
      viewBox="0 0 1920 48"
      preserveAspectRatio="xMidYMax slice"
      fill="none"
    >
      {kind === 'navidad' && (
        <>
          <path
            d="M0,41 Q240,34 480,40 T960,39 T1440,41 T1920,38 L1920,48 L0,48 Z"
            fill="#e2e8f0"
          />
          {PINE_XS.map((x, i) => {
            const h = 22 + (i % 3) * 5;
            const w = 14 + (i % 2) * 4;
            const base = 42;
            return (
              <g key={x}>
                <polygon
                  points={`${x},${base - h} ${x - w},${base} ${x + w},${base}`}
                  fill="#14532d"
                />
                <polygon
                  points={`${x},${base - h - 6} ${x - w * 0.72},${base - h * 0.45} ${x + w * 0.72},${base - h * 0.45}`}
                  fill="#14532d"
                />
              </g>
            );
          })}
          {HOUSE_XS.map((x, i) => (
            <g key={x}>
              <rect x={x} y={28} width={34} height={15} fill="#1c1917" />
              <polygon points={`${x - 4},28 ${x + 17},17 ${x + 38},28`} fill="#44403c" />
              <rect
                x={x + 6}
                y={32}
                width={6}
                height={6}
                fill="#fbbf24"
                className="holiday-window"
                style={{ animationDelay: `${i * 0.7}s` }}
              />
              <rect
                x={x + 22}
                y={32}
                width={6}
                height={6}
                fill="#fbbf24"
                className="holiday-window"
                style={{ animationDelay: `${i * 0.7 + 1.1}s` }}
              />
            </g>
          ))}
          <polygon
            points={starPoints(960, 11, 7, 3)}
            fill="#fde68a"
            className="holiday-star"
          />
        </>
      )}

      {kind === 'ciudad' && (
        <>
          {BUILDINGS_BACK.map(([x, w, h]) => (
            <rect key={`b-${x}`} x={x} y={48 - h} width={w} height={h} fill="#1e1b4b" />
          ))}
          {BUILDINGS_FRONT.map(([x, w, h]) => (
            <rect key={`f-${x}`} x={x} y={48 - h} width={w} height={h} fill="#312e81" />
          ))}
          {FIREWORKS.map(({ cx, cy, color, delay }) => (
            <g key={cx} className="holiday-firework" style={{ animationDelay: delay }}>
              {RAY_ANGLES.map((deg) => {
                const rad = (deg * Math.PI) / 180;
                const x1 = cx + Math.cos(rad) * 4;
                const y1 = cy + Math.sin(rad) * 4;
                const x2 = cx + Math.cos(rad) * 11;
                const y2 = cy + Math.sin(rad) * 11;
                return (
                  <g key={deg}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={color}
                      strokeWidth={1.6}
                      strokeLinecap="round"
                    />
                    <circle cx={x2} cy={y2} r={1.6} fill={color} />
                  </g>
                );
              })}
            </g>
          ))}
        </>
      )}

      {kind === 'coronas' && (
        <>
          {CROWN_XS.map((cx, i) => (
            <polygon
              key={cx}
              points={`${cx - 18},38 ${cx - 20},20 ${cx - 11},29 ${cx - 6},17 ${cx},27 ${cx + 6},17 ${cx + 11},29 ${cx + 20},20 ${cx + 18},38`}
              fill="#facc15"
              className="holiday-bob"
              style={{ animationDelay: `${i * 1.1}s` }}
            />
          ))}
          <polygon
            points={starPoints(660, 16, 8, 3.5)}
            fill="#fde68a"
            className="holiday-star"
          />
        </>
      )}

      {kind === 'globos' && (
        <>
          {BALLOONS.map(({ x, y, color, delay, heart }) => (
            <g key={x} className="holiday-float" style={{ animationDelay: delay }}>
              <line x1={x} y1={y + 8} x2={x} y2={46} stroke="#94a3b8" strokeWidth={1} strokeOpacity={0.7} />
              {heart ? (
                <path
                  d="M0,-6 C-3,-10 -9,-9 -9,-3 C-9,3 0,8 0,10 C0,8 9,3 9,-3 C9,-9 3,-10 0,-6 Z"
                  transform={`translate(${x}, ${y})`}
                  fill={color}
                />
              ) : (
                <ellipse cx={x} cy={y} rx={7} ry={9} fill={color} />
              )}
            </g>
          ))}
        </>
      )}

      {kind === 'cumple' && (
        <>
          {PARTY_BALLOONS.map(({ x, y, color, delay }) => (
            <g key={x} className="holiday-float" style={{ animationDelay: delay }}>
              <line x1={x} y1={y + 8} x2={x} y2={46} stroke="#94a3b8" strokeWidth={1} strokeOpacity={0.7} />
              <ellipse cx={x} cy={y} rx={7} ry={9} fill={color} />
            </g>
          ))}
        </>
      )}

      {kind === 'macetas' && (
        <>
          {POTS.map(({ x, flower, delay }) => (
            <g key={x}>
              <g className="holiday-sway-up" style={{ animationDelay: delay }}>
                <line x1={x} y1={34} x2={x} y2={16} stroke="#16a34a" strokeWidth={2.2} strokeLinecap="round" />
                <circle cx={x} cy={10} r={3.2} fill={flower} />
                <circle cx={x + 4.5} cy={13.5} r={3.2} fill={flower} />
                <circle cx={x + 2.8} cy={18.8} r={3.2} fill={flower} />
                <circle cx={x - 2.8} cy={18.8} r={3.2} fill={flower} />
                <circle cx={x - 4.5} cy={13.5} r={3.2} fill={flower} />
                <circle cx={x} cy={14.8} r={2.6} fill="#facc15" />
              </g>
              <polygon points={`${x - 9},34 ${x + 9},34 ${x + 6},47 ${x - 6},47`} fill="#c2410c" />
              <rect x={x - 10} y={32} width={20} height={3} rx={1} fill="#c2410c" />
            </g>
          ))}
        </>
      )}
    </svg>
    {kind === 'cumple' && (
      <img
        src={`${BIRTHDAY_BASE_URL}/pastel.webp`}
        alt=""
        className="holiday-bob absolute bottom-0 left-1/2 h-11 w-auto -translate-x-1/2"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    )}
  </div>
);

export default HolidayScene;
