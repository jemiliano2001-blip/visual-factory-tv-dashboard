import * as React from 'react';
import { cn } from '../../lib/utils';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono-data peer-disabled:cursor-not-allowed peer-disabled:opacity-70 select-none',
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = 'Label';

export { Label };
