import React, { useRef, useState, useMemo, useLayoutEffect } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { generateTextLevels } from '../utils/abbreviate';

// ─── Props ──────────────────────────────────────────────────────────────────────

interface SmartTextProps {
  /** Texto completo a mostrar */
  text: string;
  /** Número máximo de líneas antes de aplicar truncado CSS (1 a 3) */
  maxLines?: 1 | 2 | 3;
  /** Clases CSS adicionales */
  className?: string;
  /** Si es true, deshabilita la lógica inteligente y muestra el texto completo */
  disableSmart?: boolean;
  /** Nivel inicial de resumen a aplicar (0=completo, 1=abreviaciones, 2=sin conectores) */
  defaultLevel?: number;
}

// ─── Componente ─────────────────────────────────────────────────────────────────

const SmartText: React.FC<SmartTextProps> = ({
  text,
  maxLines = 2,
  className = '',
  disableSmart = false,
  defaultLevel = 0,
}) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const lastWidthRef = useRef<number>(0);
  
  const levels = useMemo(() => generateTextLevels(text), [text]);
  const initialLevel = Math.min(defaultLevel, levels.length - 1);
  const [levelIndex, setLevelIndex] = useState(initialLevel);

  // 1. Reset al nivel inicial cuando cambia el texto
  useLayoutEffect(() => {
    setLevelIndex(initialLevel);
  }, [text, initialLevel]);

  // 2. Cascada síncrona si hay overflow
  useLayoutEffect(() => {
    if (disableSmart || !containerRef.current) return;
    const el = containerRef.current;
    
    const isOverflowing = el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2;
    if (isOverflowing && levelIndex < levels.length - 1) {
      setLevelIndex((prev) => prev + 1);
    }
  }, [levelIndex, disableSmart, levels.length]);

  // 3. ResizeObserver para recalcular si cambia el ancho del contenedor
  useLayoutEffect(() => {
    if (disableSmart || !containerRef.current) return;
    const el = containerRef.current;

    const observer = new ResizeObserver((entries) => {
      const newWidth = entries[0].contentRect.width;
      const prevWidth = lastWidthRef.current;
      lastWidthRef.current = newWidth;
      if (prevWidth === 0) return;
      // Solo reiniciar a texto completo si el contenedor creció (evita oscilación al abreviar).
      if (newWidth > prevWidth + 2) {
        setLevelIndex(initialLevel);
      } else if (newWidth < prevWidth - 2) {
        const isOverflowing = el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2;
        if (isOverflowing) {
          setLevelIndex((prev) => (prev < levels.length - 1 ? prev + 1 : prev));
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [disableSmart, initialLevel, levels.length]);

  const displayText = disableSmart ? text : (levels[levelIndex] || text);
  const isAbbreviated = levelIndex > 0;

  const lineClampStyle: React.CSSProperties = {
    display: '-webkit-box',
    WebkitLineClamp: maxLines,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
    wordBreak: 'break-word' as const,
  };

  if (!isAbbreviated) {
    return (
      <span
        ref={containerRef}
        className={className}
        style={disableSmart ? undefined : lineClampStyle}
      >
        {displayText}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          ref={containerRef}
          className={`${className} cursor-help`}
          style={disableSmart ? undefined : lineClampStyle}
        >
          {displayText}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs text-center leading-relaxed">{text}</p>
      </TooltipContent>
    </Tooltip>
  );
};

export default SmartText;
