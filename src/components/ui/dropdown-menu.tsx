import * as React from 'react';
import { Menu } from '@base-ui/react/menu';
import { cn } from '../../lib/utils';

const DropdownMenu = Menu.Root;
const DropdownMenuTrigger = Menu.Trigger;

interface DropdownMenuContentProps extends React.ComponentPropsWithoutRef<typeof Menu.Popup> {
  sideOffset?: number;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ className, children, sideOffset = 4, side = 'bottom', align = 'end', ...props }, ref) => (
    <Menu.Portal>
      <Menu.Positioner sideOffset={sideOffset} side={side} align={align} className="z-50">
        <Menu.Popup
          ref={ref}
          className={cn(
            'min-w-[12rem] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-overlay outline-none',
            className,
          )}
          {...props}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  ),
);
DropdownMenuContent.displayName = 'DropdownMenuContent';

const DropdownMenuItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof Menu.Item>>(
  ({ className, ...props }, ref) => (
    <Menu.Item
      ref={ref}
      className={cn(
        'flex min-h-11 w-full cursor-pointer select-none items-center gap-2 rounded-lg px-3 text-sm text-foreground outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  ),
);
DropdownMenuItem.displayName = 'DropdownMenuItem';

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
