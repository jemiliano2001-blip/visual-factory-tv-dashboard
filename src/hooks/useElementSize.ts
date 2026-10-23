import { useLayoutEffect, useRef, useState } from 'react';

/** Tamaño (px CSS, redondeado) de un elemento, actualizado con ResizeObserver. */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
      const height = Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
      setSize(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
}
