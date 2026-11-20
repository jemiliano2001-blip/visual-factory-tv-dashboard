import * as React from 'react';
import { cn } from '../../lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

/** Selector de una vista entre pocas (patrón SegmentedControl). Botones con aria-pressed. */
export function SegmentedControl<T extends string>({
  options, value, onChange, label, className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex rounded-xl border border-border bg-muted p-1', className)}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-10 cursor-pointer rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring',
            value === o.value
              ? 'bg-card text-foreground shadow-card'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
