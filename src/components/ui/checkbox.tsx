import * as React from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'checked' | 'onChange' | 'type'> {
  checked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * Checkbox mínimo (sin Radix — no está entre las dependencias del proyecto).
 * Sigue el patrón visual de los demás primitivos en src/components/ui.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    const indeterminate = checked === 'indeterminate';
    return (
      <span className={cn('relative inline-flex size-4 shrink-0', className)}>
        <input
          ref={ref}
          type="checkbox"
          checked={indeterminate ? true : !!checked}
          onChange={e => onCheckedChange?.(e.target.checked)}
          className="peer size-4 shrink-0 cursor-pointer appearance-none rounded-[4px] border border-input bg-transparent transition-colors checked:border-primary checked:bg-primary focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50"
          {...props}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-primary-foreground opacity-0 peer-checked:opacity-100">
          {indeterminate ? <Minus className="size-3" /> : <Check className="size-3" />}
        </span>
      </span>
    );
  },
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
