import * as React from 'react';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { cn } from '../../lib/utils';

const Tabs = BaseTabs.Root;

const TabsList = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseTabs.List>
>(({ className, ...props }, ref) => (
  <BaseTabs.List
    ref={ref}
    className={cn('flex w-full items-center gap-1 overflow-x-auto border-b border-border', className)}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof BaseTabs.Tab>
>(({ className, ...props }, ref) => (
  <BaseTabs.Tab
    ref={ref}
    className={cn(
      '-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors cursor-pointer outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:rounded-md disabled:pointer-events-none disabled:opacity-50 data-[active]:border-primary data-[active]:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground [&_svg]:size-4 select-none',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseTabs.Panel>
>(({ className, ...props }, ref) => (
  <BaseTabs.Panel
    ref={ref}
    className={cn('outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-xl', className)}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
