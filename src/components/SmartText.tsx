import React, { useRef, useState, useMemo, useLayoutEffect } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { generateTextLevels } from '../utils/abbreviate';

// ─── Props ──────────────────────────────────────────────────────────────────────

interface SmartTextProps {
  /** Texto completo a mostrar */
  text: string;
  /** Número máximo de líneas antes de aplicar truncado CSS (1 o 2) */
  maxLines?: 1 | 2;
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
      // Solo reiniciar si el ancho cambió significativamente (ignora cambios de altura por wrapping)
      if (lastWidthRef.current !== 0 && Math.abs(newWidth - lastWidthRef.current) > 2) {
        setLevelIndex(initialLevel);
      }
      lastWidthRef.current = newWidth;
    });
    
    observer.observe(el);
    return () => observer.disconnect();
  }, [disableSmart, initialLevel]);

  const displayText = disableSmart ? text : (levels[levelIndex] || text);
  const isAbbreviated = levelIndex > 0;

  const lineClampStyle: React.CSSProperties = {
    display: '-webkit-box',
    WebkitLineClamp: maxLines,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
    wordBreak: 'break-word' as const,
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          ref={containerRef}
          className={`${className} ${isAbbreviated ? 'cursor-help' : ''}`}
          style={disableSmart ? undefined : lineClampStyle}
        >
          {displayText}
        </span>
      </TooltipTrigger>
      {isAbbreviated && (
        <TooltipContent>
          <p className="max-w-xs text-center leading-relaxed">{text}</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
};

export default SmartText;
