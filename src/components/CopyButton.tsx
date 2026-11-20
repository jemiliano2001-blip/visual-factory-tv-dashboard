import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Copy } from 'lucide-react';
import { cn } from '../lib/utils';

type CopyState = 'idle' | 'copied' | 'failed';

export interface CopyButtonProps {
  value: string;
  label: string;
  className?: string;
  showLabel?: boolean;
}

const FEEDBACK_MS = 2000;

/**
 * Botón accesible de copia rápida en 1 clic. Mantiene el botón habilitado durante
 * el feedback, anuncia el resultado fuera del <button> y detiene la propagación
 * para usarse dentro de filas o tarjetas clicables.
 */
export const CopyButton: React.FC<CopyButtonProps> = ({
  value,
  label,
  className,
  showLabel = false,
}) => {
  const [state, setState] = useState<CopyState>('idle');
  const [announcement, setAnnouncement] = useState('');
  const timerRef = useRef<number | null>(null);
  const repeatToggleRef = useRef(false);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const scheduleReset = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setState('idle');
      setAnnouncement('');
    }, FEEDBACK_MS);
  };

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    repeatToggleRef.current = !repeatToggleRef.current;
    const suffix = repeatToggleRef.current ? '\u00A0' : '';

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(value);
      setState('copied');
      setAnnouncement(`Copiado ${value}${suffix}`);
    } catch {
      setState('failed');
      setAnnouncement(`No se pudo copiar ${value}${suffix}`);
    }
    scheduleReset();
  };

  const title =
    state === 'copied'
      ? 'Copiado'
      : state === 'failed'
        ? 'No se pudo copiar'
        : label;

  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={label}
        title={title}
        data-copied={state === 'copied' ? '' : undefined}
        data-failed={state === 'failed' ? '' : undefined}
        className={cn(
          'inline-flex min-h-7 min-w-7 max-md:min-h-11 max-md:min-w-11 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-[copied]:text-success data-[failed]:text-destructive',
          className,
        )}
      >
        {state === 'copied' ? (
          <Check className="size-3.5 shrink-0" aria-hidden="true" />
        ) : state === 'failed' ? (
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        {showLabel && (
          <span>
            {state === 'copied' ? 'Copiado' : state === 'failed' ? 'Error' : 'Copiar'}
          </span>
        )}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </span>
  );
};

export default CopyButton;
