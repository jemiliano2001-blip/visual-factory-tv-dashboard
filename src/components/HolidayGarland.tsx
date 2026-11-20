import React from 'react';
import type { GarlandKind } from '../services/holidayTheme';

const COUNT = 24;
const ITEMS = Array.from({ length: COUNT }, (_, i) => i);
const leftPct = (i: number) => 2 + (i * 96) / (COUNT - 1);

const BULB_COLORS = ['#facc15', '#4ade80', '#e2e8f0'] as const;
const PENNANT_COLORS = ['#facc15', '#a855f7', '#3b82f6', '#e2e8f0'] as const;
const HEART_COLORS = ['#f472b6', '#c084fc', '#fbcfe8'] as const;
const PETAL_COLORS = ['#f9a8d4', '#f8fafc', '#c4b5fd'] as const;

/** Cable o cuerda ondulada que cruza todo el ancho del header. */
const GarlandCord: React.FC<{ stroke: string; strokeWidth?: number; d?: string }> = ({
  stroke,
  strokeWidth = 1.2,
  d = 'M0,3 Q125,8 250,3 T500,3 T750,3 T1000,3',
}) => (
  <svg
    viewBox="0 0 1000 16"
    preserveAspectRatio="none"
    className="block h-full w-full"
    fill="none"
  >
    <path d={d} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
  </svg>
);

/** Rama de pino decorativa para las esquinas superiores en Navidad. */
const PineCorner: React.FC<{ mirror?: boolean }> = ({ mirror = false }) => (
  <div
    aria-hidden="true"
    className={`hidden lg:block absolute top-0 ${mirror ? 'right-0 scale-x-[-1]' : 'left-0'} w-44 h-16 -z-10 pointer-events-none`}
  >
    <svg viewBox="0 0 176 64" className="h-full w-full" fill="none">
      <path
        d="M0,4 Q54,10 112,26 Q142,34 166,44"
        stroke="#14532d"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M12,6 L24,20 M28,8 L42,24 M46,11 L60,28 M64,15 L78,32 M84,20 L98,37 M104,25 L116,41 M124,31 L134,45 M20,4 L36,2 M40,7 L58,6 M62,12 L80,12 M84,18 L102,19 M106,24 L124,26 M128,31 L146,34"
        stroke="#14532d"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="54" cy="22" r="4.5" fill="#facc15" />
      <circle cx="52.8" cy="20.8" r="1.2" fill="#fef9c3" />
      <circle cx="114" cy="36" r="4" fill="#eab308" />
      <circle cx="113" cy="34.8" r="1" fill="#fef9c3" />
    </svg>
  </div>
);

const HolidayGarland: React.FC<{ kind: GarlandKind }> = ({ kind }) => (
  <>
    <div
      aria-hidden="true"
      className="hidden lg:block absolute top-full -left-4 -right-4 lg:-left-6 lg:-right-6 h-4 -z-10 pointer-events-none"
    >
      {kind === 'luces' && (
        <>
          <GarlandCord stroke="#3f3f46" strokeWidth={1.3} />
          {ITEMS.map((i) => {
            const color = BULB_COLORS[i % BULB_COLORS.length];
            const top = 4 + (i % 2) * 2;
            return (
              <span
                key={i}
                className="holiday-bulb absolute block w-[6px] h-[8px] -translate-x-1/2"
                style={{
                  left: `${leftPct(i)}%`,
                  top: `${top}px`,
                  borderRadius: '50% 50% 45% 45%',
                  backgroundColor: color,
                  boxShadow: `0 0 8px ${color}`,
                  animationDelay: `${(i % 6) * 0.3}s`,
                }}
              />
            );
          })}
        </>
      )}

      {kind === 'serpentinas' && (
        <svg
          viewBox="0 0 1000 16"
          preserveAspectRatio="none"
          className="block h-full w-full overflow-hidden"
          fill="none"
        >
          <path
            d="M0,4 Q62,12 125,4 T250,4 T375,4 T500,4 T625,4 T750,4 T875,4 T1000,4"
            stroke="#facc15"
            strokeWidth="1.8"
            strokeOpacity="0.85"
            className="holiday-sway-x"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M0,9 Q62,2 125,9 T250,9 T375,9 T500,9 T625,9 T750,9 T875,9 T1000,9"
            stroke="#cbd5e1"
            strokeWidth="1.5"
            strokeOpacity="0.75"
            className="holiday-sway-x"
            style={{ animationDelay: '-2.3s' }}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M0,13 Q62,6 125,13 T250,13 T375,13 T500,13 T625,13 T750,13 T875,13 T1000,13"
            stroke="#818cf8"
            strokeWidth="1.6"
            strokeOpacity="0.85"
            className="holiday-sway-x"
            style={{ animationDelay: '-4.6s' }}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}

      {kind === 'banderines' && (
        <>
          <GarlandCord stroke="#52525b" d="M0,2 Q125,5 250,2 T500,2 T750,2 T1000,2" />
          {ITEMS.map((i) => (
            <svg
              key={i}
              width="12"
              height="13"
              viewBox="0 0 12 13"
              className="holiday-sway absolute top-[2px] -translate-x-1/2"
              style={{
                left: `${leftPct(i)}%`,
                animationDelay: `${(i % 5) * 0.4}s`,
              }}
            >
              <polygon points="0,0 12,0 6,13" fill={PENNANT_COLORS[i % PENNANT_COLORS.length]} />
            </svg>
          ))}
        </>
      )}

      {kind === 'corazones' && (
        <>
          <GarlandCord stroke="#71717a" d="M0,2 Q125,5 250,2 T500,2 T750,2 T1000,2" />
          {ITEMS.map((i) => (
            <svg
              key={i}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              className="holiday-sway absolute top-[3px] -translate-x-1/2"
              style={{
                left: `${leftPct(i)}%`,
                animationDelay: `${(i % 5) * 0.45}s`,
              }}
            >
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                fill={HEART_COLORS[i % HEART_COLORS.length]}
              />
            </svg>
          ))}
        </>
      )}

      {kind === 'flores' && (
        <>
          <GarlandCord
            stroke="#16a34a"
            strokeWidth={1.8}
            d="M0,4 Q62,10 125,4 T250,4 T375,4 T500,4 T625,4 T750,4 T875,4 T1000,4"
          />
          {ITEMS.map((i) => {
            const petal = PETAL_COLORS[i % PETAL_COLORS.length];
            const top = 2 + (i % 2) * 2;
            return (
              <svg
                key={i}
                width="12"
                height="12"
                viewBox="0 0 16 16"
                className="holiday-sway absolute -translate-x-1/2"
                style={{
                  left: `${leftPct(i)}%`,
                  top: `${top}px`,
                  animationDelay: `${(i % 5) * 0.4}s`,
                }}
              >
                <circle cx="8" cy="3.5" r="2.6" fill={petal} />
                <circle cx="12.2" cy="6.6" r="2.6" fill={petal} />
                <circle cx="10.6" cy="11.5" r="2.6" fill={petal} />
                <circle cx="5.4" cy="11.5" r="2.6" fill={petal} />
                <circle cx="3.8" cy="6.6" r="2.6" fill={petal} />
                <circle cx="8" cy="8" r="2.4" fill="#facc15" />
              </svg>
            );
          })}
        </>
      )}
    </div>

    {kind === 'luces' && (
      <>
        <PineCorner />
        <PineCorner mirror />
      </>
    )}
  </>
);

export default HolidayGarland;
