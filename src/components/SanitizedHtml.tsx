import React, { useEffect, useRef } from 'react';

interface ElementWithSetHTML extends Element {
  setHTML(input: string): void;
}

let domPurifyPromise: Promise<typeof import('dompurify')> | null = null;
function loadDomPurify() {
  if (!domPurifyPromise) domPurifyPromise = import('dompurify');
  return domPurifyPromise;
}

interface SanitizedHtmlProps {
  html: string;
  className?: string;
}

/**
 * Sanitiza HTML no confiable proveniente de notas de Odoo usando la Sanitizer API
 * nativa cuando está disponible y cargando DOMPurify bajo demanda como respaldo.
 */
export const SanitizedHtml: React.FC<SanitizedHtmlProps> = ({ html, className }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;

    if ('setHTML' in el && typeof (el as Partial<ElementWithSetHTML>).setHTML === 'function') {
      (el as ElementWithSetHTML).setHTML(html);
      return () => {
        cancelled = true;
      };
    }

    void loadDomPurify().then(({ default: DOMPurify }) => {
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = DOMPurify.sanitize(html);
    });

    return () => {
      cancelled = true;
    };
  }, [html]);

  return <div ref={ref} className={className} />;
};
