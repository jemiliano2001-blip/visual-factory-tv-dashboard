import React from 'react';
import { BIRTHDAY_BASE_URL } from '../services/birthdayTheme';

const hide = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; };

/** Cameo del cumpleañero: se asoma tras la barra del footer y cruza corriendo. Solo CSS (transform);
 *  sin movimiento reducido no se muestra (ver `.holiday-cameo` en index.css). */
const HolidayCameo: React.FC = () => (
  <div aria-hidden="true" className="holiday-cameo pointer-events-none absolute inset-0">
    {[{ left: '36%', delay: '-20s' }, { left: '64%', delay: '-8s' }].map(({ left, delay }) => (
      <div key={left} className="holiday-cameo-peek" style={{ left }}>
        <img src={`${BIRTHDAY_BASE_URL}/peek-ojos.webp`} alt="" style={{ animationDelay: delay }} onError={hide} />
      </div>
    ))}
    <div className="holiday-cameo-run">
      <div className="holiday-cameo-frame">
        <img src={`${BIRTHDAY_BASE_URL}/run.webp`} alt="" onError={hide} />
      </div>
    </div>
  </div>
);

export default HolidayCameo;
