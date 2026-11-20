import React, { useEffect, useRef } from 'react';
import { holidayGreeting, type HolidayTheme } from '../services/holidayTheme';

const BURST_COUNT = 14;
const INTRO_DURATION_MS = 3500;

// Vectores deterministas desde el centro (sin Math.random)
const BURSTS = Array.from({ length: BURST_COUNT }, (_, i) => {
  const angle = (i * 2 * Math.PI) / BURST_COUNT;
  const dist = 18 + ((i * 7) % 12);
  return {
    dx: `${(Math.cos(angle) * dist).toFixed(2)}vh`,
    dy: `${(Math.sin(angle) * dist).toFixed(2)}vh`,
  };
});

/** Saludo festivo a pantalla completa al abrir la TV; se cierra tras 3.5 s, clic o cualquier tecla. */
const HolidayIntro: React.FC<{ holiday: HolidayTheme; date: Date; onDone: () => void }> = ({
  holiday,
  date,
  onDone,
}) => {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timer = window.setTimeout(() => onDoneRef.current(), INTRO_DURATION_MS);
    // Fase de captura para que Espacio/flechas no disparen atajos de la TV al cerrar
    const handler = (e: KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDoneRef.current();
    };
    window.addEventListener('keydown', handler, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handler, true);
    };
  }, []);

  return (
    <div
      role="status"
      onClick={onDone}
      className="holiday-intro fixed inset-0 z-[80] flex cursor-pointer select-none flex-col items-center justify-center px-6 text-center"
      style={{
        background: `radial-gradient(circle at center, rgba(${holiday.accent}, 0.35) 0%, #050507 70%)`,
      }}
    >
      {BURSTS.map((b, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="holiday-burst"
          style={
            {
              '--dx': b.dx,
              '--dy': b.dy,
              '--tone': i % 2 === 0 ? holiday.accent : '255, 255, 255',
            } as React.CSSProperties
          }
        />
      ))}
      <p
        className="holiday-intro-pop relative z-10 font-display text-5xl font-extrabold lg:text-8xl"
        style={{ color: `rgb(${holiday.accent})` }}
      >
        {holidayGreeting(holiday, date)}
      </p>
      <p className="relative z-10 mt-4 text-xl text-foreground/80 lg:text-3xl">
        Les desea el equipo SMV
      </p>
    </div>
  );
};

export default HolidayIntro;
