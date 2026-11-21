import React from 'react';
import { BIRTHDAY_BASE_URL } from '../services/birthdayTheme';

const hide = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; };
const peekSrc = `${BIRTHDAY_BASE_URL}/peek-ojos.webp`;
const runSrc = `${BIRTHDAY_BASE_URL}/run.webp`;

// Ciclo de 40 s: cada travesura tiene su turno (retraso = turno - 40 s) para que ocurra una a la vez.
const slot = (s: number) => ({ animationDelay: `${s - 40}s` });

const Peek: React.FC<{ className: string; style?: React.CSSProperties; slotS: number }> = ({ className, style, slotS }) => (
  <div className={`holiday-peek ${className}`} style={style}>
    <div className="holiday-peek-rot">
      <img src={peekSrc} alt="" style={slot(slotS)} onError={hide} />
    </div>
  </div>
);

const Runner: React.FC<{ className: string; slotS: number }> = ({ className, slotS }) => (
  <div className={`holiday-run ${className}`} style={slot(slotS)}>
    <div className="holiday-run-frame">
      <img src={runSrc} alt="" onError={hide} />
    </div>
  </div>
);

/** Oscar travieso: se asoma por el pie, los bordes y arriba, y cruza corriendo la pantalla. Todo transform;
 *  los elementos son decorativos (aria-hidden, sin clics) y duran pocos segundos. Sin movimiento reducido no
 *  se muestran (ver `.holiday-cameo` en index.css). Va dentro del footer (z-60) para quedar sobre las tarjetas. */
const HolidayCameo: React.FC = () => (
  <>
    <div aria-hidden="true" className="holiday-cameo pointer-events-none absolute inset-0">
      <Peek className="holiday-peek-bottom" style={{ left: '30%' }} slotS={0} />
      <Peek className="holiday-peek-bottom" style={{ left: '70%' }} slotS={26} />
      <Runner className="holiday-run-ltr" slotS={15} />
    </div>
    <div aria-hidden="true" className="holiday-cameo pointer-events-none fixed inset-0">
      <Peek className="holiday-peek-left" slotS={5} />
      <Peek className="holiday-peek-top" style={{ left: '22%' }} slotS={10} />
      <Peek className="holiday-peek-right" slotS={21} />
      <Peek className="holiday-peek-top" style={{ left: '78%' }} slotS={36} />
      <Runner className="holiday-run-rtl" slotS={31} />
    </div>
  </>
);

export default HolidayCameo;
