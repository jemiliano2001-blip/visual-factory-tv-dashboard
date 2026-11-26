import type React from 'react';
import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export interface ScrollToTopButtonProps {
  scrollRef: React.RefObject<HTMLElement | null>;
}

const SHOW_AFTER_PX = 350;

export function ScrollToTopButton({ scrollRef }: ScrollToTopButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      setVisible(el.scrollTop > SHOW_AFTER_PX);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef]);

  if (!visible) return null;

  const scrollToTop = () => {
    const el = scrollRef.current;
    if (!el) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Volver arriba"
      title="Volver arriba"
      className="print:hidden fixed bottom-20 right-5 z-30 flex size-11 cursor-pointer items-center justify-center rounded-full border border-border bg-popover text-foreground shadow-overlay transition-all hover:bg-accent active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:bottom-6"
    >
      <ArrowUp className="size-4" aria-hidden="true" />
    </button>
  );
}
