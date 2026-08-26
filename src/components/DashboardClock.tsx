import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';

interface DashboardClockProps {
  className?: string;
}

export const DashboardClock: React.FC<DashboardClockProps> = ({ className = '' }) => {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`text-right ${className}`}>
      <div className="font-mono-data text-base md:text-2xl lg:text-3xl font-bold text-cyan-300">
        {format(time, 'HH:mm')}
      </div>
      <div className="hidden md:block font-mono-data text-zinc-600 uppercase tracking-widest text-[9px] lg:text-[10px] mt-0.5">
        {format(time, 'EEE dd MMM yyyy')}
      </div>
    </div>
  );
};

export default DashboardClock;
