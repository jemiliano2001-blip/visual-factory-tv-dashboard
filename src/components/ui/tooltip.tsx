import * as React from 'react';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { cn } from '../../lib/utils';

export interface TooltipProviderProps extends React.ComponentPropsWithoutRef<typeof BaseTooltip.Provider> {
  delayDuration?: number;
}

const TooltipProvider: React.FC<TooltipProviderProps> = ({ delayDuration, delay, ...props }) => {
  return <BaseTooltip.Provider delay={delay ?? delayDuration} {...props} />;
};

const Tooltip = BaseTooltip.Root;

export interface TooltipTriggerProps extends React.ComponentPropsWithoutRef<typeof BaseTooltip.Trigger> {
  asChild?: boolean;
}

const TooltipTrigger = React.forwardRef<HTMLButtonElement, TooltipTriggerProps>(
  ({ asChild = false, children, render, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return (
        <BaseTooltip.Trigger
          ref={ref}
          render={children}
          {...props}
        />
      );
    }
    return (
      <BaseTooltip.Trigger
        ref={ref}
        render={render}
        {...props}
      >
        {children}
      </BaseTooltip.Trigger>
    );
  },
);
TooltipTrigger.displayName = 'TooltipTrigger';

export interface TooltipContentProps extends React.ComponentPropsWithoutRef<typeof BaseTooltip.Popup> {
  sideOffset?: number;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ className, sideOffset = 6, side = 'top', align = 'center', children, ...props }, ref) => (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner sideOffset={sideOffset} side={side} align={align}>
        <BaseTooltip.Popup
          ref={ref}
          className={cn(
            'z-50 overflow-hidden rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-overlay transition-opacity duration-150 data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0',
            className,
          )}
          {...props}
        >
          {children}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  ),
);
TooltipContent.displayName = 'TooltipContent';

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
