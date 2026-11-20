import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { computeContextMenuPosition } from '../../utils/contextMenuPosition';
import { cn } from '../../lib/utils';

export type ContextMenuEntry =
  | {
      type: 'item';
      id: string;
      label: string;
      icon?: React.ReactNode;
      onSelect: () => void;
      disabled?: boolean;
      tone?: 'default' | 'destructive';
    }
  | {
      type: 'separator';
      id: string;
    };

export interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  ariaLabel: string;
  items: ContextMenuEntry[];
  onClose: () => void;
}

/**
 * Menú contextual flotante con posicionamiento seguro dentro del viewport,
 * navegación completa por teclado (ArrowUp/ArrowDown/Home/End/Escape) y cierre al
 * interactuar fuera.
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({
  open,
  x,
  y,
  ariaLabel,
  items,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    setPos(
      computeContextMenuPosition({
        x,
        y,
        menuWidth: rect.width,
        menuHeight: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    );
  }, [open, x, y, items.length]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const firstEnabled = menuRef.current?.querySelector<HTMLButtonElement>(
      'button[role="menuitem"]:not(:disabled)',
    );
    firstEnabled?.focus({ preventScroll: true });

    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return;
      }
      onCloseRef.current();
    };

    const handleContextMenuOutside = (e: MouseEvent) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        e.preventDefault();
        return;
      }
      onCloseRef.current();
    };

    const handleDismiss = () => onCloseRef.current();

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('contextmenu', handleContextMenuOutside, true);
    window.addEventListener('scroll', handleDismiss, { capture: true, passive: true });
    window.addEventListener('resize', handleDismiss);
    window.addEventListener('blur', handleDismiss);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('contextmenu', handleContextMenuOutside, true);
      window.removeEventListener('scroll', handleDismiss, { capture: true });
      window.removeEventListener('resize', handleDismiss);
      window.removeEventListener('blur', handleDismiss);
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const enabled = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not(:disabled)',
      ) ?? [],
    );

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const prev = previousFocusRef.current;
      onClose();
      if (prev && prev.isConnected) prev.focus({ preventScroll: true });
      return;
    }

    if (e.key === 'Tab') {
      onClose();
      return;
    }

    if (enabled.length === 0) return;
    const activeIndex = enabled.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = activeIndex === -1 ? 0 : (activeIndex + 1) % enabled.length;
      enabled[next].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx =
        activeIndex === -1 ? enabled.length - 1 : (activeIndex - 1 + enabled.length) % enabled.length;
      enabled[prevIdx].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      enabled[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      enabled[enabled.length - 1].focus();
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onContextMenu={e => e.preventDefault()}
      className="fixed z-[85] min-w-[220px] max-w-[280px] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-overlay outline-none"
      style={{ left: pos.left, top: pos.top, margin: 0 }}
    >
      {items.map(entry =>
        entry.type === 'separator' ? (
          <hr key={entry.id} className="my-1 border-border" />
        ) : (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => {
              onClose();
              entry.onSelect();
            }}
            className={cn(
              'flex min-h-10 w-full cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:bg-accent focus-visible:text-accent-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
              entry.tone === 'destructive'
                ? 'text-destructive hover:bg-destructive/15 hover:text-destructive focus-visible:bg-destructive/15 focus-visible:text-destructive'
                : 'text-foreground',
            )}
          >
            {entry.icon}
            <span className="truncate">{entry.label}</span>
          </button>
        ),
      )}
    </div>,
    document.body,
  );
};

export default ContextMenu;
