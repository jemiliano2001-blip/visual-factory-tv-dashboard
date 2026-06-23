import React, { useRef, useState, useEffect, useMemo } from 'react';

// ─── Diccionario de abreviaciones comunes en español (manufactura) ──────────
const ABBREVIATIONS: [RegExp, string][] = [
  [/\bServicio\b/gi, 'Serv.'],
  [/\bServicios\b/gi, 'Serv.'],
  [/\bFabricaci[oó]n\b/gi, 'Fab.'],
  [/\bManufactura\b/gi, 'Mfg.'],
  [/\binoxidable\b/gi, 'inox.'],
  [/\bTratamiento\b/gi, 'Trat.'],
  [/\bGalvanizado\b/gi, 'Galv.'],
  [/\bRecubrimiento\b/gi, 'Recub.'],
  [/\bMaquinados?\b/gi, 'Maq.'],
  [/\bAcabado\b/gi, 'Acab.'],
  [/\bEnsamble\b/gi, 'Ensam.'],
  [/\bInstalaci[oó]n\b/gi, 'Inst.'],
  [/\bMantenimiento\b/gi, 'Mant.'],
  [/\bAluminio\b/gi, 'Alum.'],
  [/\bHerramienta\b/gi, 'Herr.'],
  [/\bHerramientas\b/gi, 'Herr.'],
  [/\bAutom[aá]tico\b/gi, 'Auto.'],
  [/\bHidr[aá]ulico\b/gi, 'Hidr.'],
  [/\bNeum[aá]tico\b/gi, 'Neum.'],
  [/\bEl[eé]ctrico\b/gi, 'Eléc.'],
  [/\bIndustrial\b/gi, 'Ind.'],
  [/\bProducci[oó]n\b/gi, 'Prod.'],
  [/\bCertificado\b/gi, 'Cert.'],
  [/\bPulido\b/gi, 'Pul.'],
  [/\bTransporte\b/gi, 'Trans.'],
  [/\bDiseño\b/gi, 'Dis.'],
  [/\bSuministro\b/gi, 'Sum.'],
  [/\bReparaci[oó]n\b/gi, 'Rep.'],
  [/\bReemplazo\b/gi, 'Reemp.'],
  [/\bRetrabajo\b/gi, 'Retr.'],
  [/\bModificaci[oó]n\b/gi, 'Mod.'],
  [/\bEstructura\b/gi, 'Estr.'],
  [/\bConector\b/gi, 'Conect.'],
  [/\bTornillos?\b/gi, 'Torn.'],
  [/\bTransportador\b/gi, 'Transp.'],
];

// Palabras sin información clave que se pueden eliminar en nivel agresivo
const FILLER_WORDS = /\b(de|del|la|el|las|los|para|con|por|una?|en|al|su|sus|y|o|e)\b/gi;

/**
 * Genera versiones progresivamente más cortas del texto.
 *
 * Nivel 0: Texto completo
 * Nivel 1: Texto con abreviaciones de palabras comunes
 * Nivel 2: Abreviaciones + eliminar fillers
 * Nivel 3: Solo las primeras N palabras significativas (keywords)
 */
function generateTextLevels(text: string): string[] {
  if (!text) return [''];

  const original = text.trim();

  // Nivel 1 — abreviar palabras conocidas
  let abbreviated = original;
  for (const [pattern, replacement] of ABBREVIATIONS) {
    abbreviated = abbreviated.replace(pattern, replacement);
  }

  // Nivel 2 — abreviar + quitar fillers
  const noFillers = abbreviated
    .replace(FILLER_WORDS, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Nivel 3 — solo keywords (primeras 4 palabras significativas)
  const keywords = noFillers.split(/\s+/).slice(0, 4).join(' ');

  // Deduplicar niveles
  const levels = [original];
  if (abbreviated !== original) levels.push(abbreviated);
  if (noFillers !== levels[levels.length - 1]) levels.push(noFillers);
  if (keywords !== levels[levels.length - 1]) levels.push(keywords);

  return levels;
}

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
  
  const levels = useMemo(() => generateTextLevels(text), [text]);
  const initialLevel = Math.min(defaultLevel, levels.length - 1);
  const [levelIndex, setLevelIndex] = useState(initialLevel);

  // Detectar overflow y avanzar niveles
  useEffect(() => {
    if (disableSmart || !containerRef.current) return;

    // Reset al nivel por defecto cuando cambia el texto
    setLevelIndex(initialLevel);

    const el = containerRef.current;

    const checkOverflow = () => {
      if (!el) return;
      // Determinar si el texto desborda el contenedor
      const isOverflowing = el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2;

      if (isOverflowing) {
        setLevelIndex((prev) => {
          const next = prev + 1;
          return next < levels.length ? next : prev;
        });
      }
    };

    // Verificar después de que el layout se estabilice
    const raf = requestAnimationFrame(() => {
      checkOverflow();
    });

    // Escuchar cambios de tamaño de ventana en lugar del span para evitar loop infinito
    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setLevelIndex(initialLevel);
        requestAnimationFrame(checkOverflow);
      }, 250);
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, [text, disableSmart, levels.length, initialLevel]);

  // Re-check overflow cuando cambia el levelIndex (necesario para cascada)
  useEffect(() => {
    if (disableSmart || !containerRef.current) return;

    const el = containerRef.current;
    const timer = setTimeout(() => {
      const isOverflowing = el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2;
      if (isOverflowing && levelIndex < levels.length - 1) {
        setLevelIndex((prev) => prev + 1);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [levelIndex, disableSmart, levels.length]);

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
    <span
      ref={containerRef}
      className={`${className} ${isAbbreviated ? 'cursor-help' : ''}`}
      style={disableSmart ? undefined : lineClampStyle}
      title={isAbbreviated ? text : undefined}
    >
      {displayText}
    </span>
  );
};

export default SmartText;
