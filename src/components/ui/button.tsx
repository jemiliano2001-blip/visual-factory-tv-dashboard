import * as React from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer select-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground border border-border hover:bg-accent',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        outline: 'border border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-11 px-6 text-base',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ComponentPropsWithoutRef<typeof BaseButton>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLElement, ButtonProps>(
  ({ className, variant, size, asChild = false, render, children, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return (
        <BaseButton
          ref={ref}
          render={children}
          className={cn(buttonVariants({ variant, size }), className)}
          {...props}
        />
      );
    }
    return (
      <BaseButton
        ref={ref}
        render={render}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </BaseButton>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
