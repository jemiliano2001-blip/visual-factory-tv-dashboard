import * as React from 'react';
import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

const Select = BaseSelect.Root;
const SelectGroup = BaseSelect.Group;
const SelectValue = BaseSelect.Value;

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.Trigger>
>(({ className, children, ...props }, ref) => (
  <BaseSelect.Trigger
    ref={ref}
    className={cn(
      'flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background/40 px-3.5 py-2 text-sm text-foreground transition-colors outline-none data-[placeholder]:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer [&>span]:line-clamp-1 select-none',
      className,
    )}
    {...props}
  >
    {children}
    <BaseSelect.Icon>
      <ChevronDown className="size-4 opacity-60 pointer-events-none" />
    </BaseSelect.Icon>
  </BaseSelect.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

export interface SelectContentProps
  extends React.ComponentPropsWithoutRef<typeof BaseSelect.Popup> {
  sideOffset?: number;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
  ({ className, children, sideOffset = 4, side = 'bottom', align = 'start', ...props }, ref) => (
    <BaseSelect.Portal>
      <BaseSelect.Positioner sideOffset={sideOffset} side={side} align={align} className="z-50 min-w-[var(--anchor-width)]">
        <BaseSelect.Popup
          ref={ref}
          className={cn(
            'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-overlay p-1 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            className,
          )}
          {...props}
        >
          {children}
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  ),
);
SelectContent.displayName = 'SelectContent';

const SelectLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.GroupLabel>
>(({ className, ...props }, ref) => (
  <BaseSelect.GroupLabel
    ref={ref}
    className={cn('px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono-data', className)}
    {...props}
  />
));
SelectLabel.displayName = 'SelectLabel';

const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.Item>
>(({ className, children, ...props }, ref) => (
  <BaseSelect.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm text-foreground outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[selected]:font-medium data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <BaseSelect.ItemIndicator>
        <Check className="size-4 text-primary" />
      </BaseSelect.ItemIndicator>
    </span>
    <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
  </BaseSelect.Item>
));
SelectItem.displayName = 'SelectItem';

const SelectSeparator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseSelect.Separator>
>(({ className, ...props }, ref) => (
  <BaseSelect.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
));
SelectSeparator.displayName = 'SelectSeparator';

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
};
