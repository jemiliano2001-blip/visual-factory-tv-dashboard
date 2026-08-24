import * as React from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

const Dialog = BaseDialog.Root;
const DialogTrigger = BaseDialog.Trigger;
const DialogPortal = BaseDialog.Portal;
const DialogClose = BaseDialog.Close;

const DialogOverlay = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Backdrop>
>(({ className, ...props }, ref) => (
  <BaseDialog.Backdrop
    ref={ref}
    className={cn(
      'fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm transition-all duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof BaseDialog.Popup> {
  showCloseButton?: boolean;
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, showCloseButton = true, ...props }, ref) => (
    <BaseDialog.Portal>
      <DialogOverlay />
      <BaseDialog.Popup
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-[70] grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-border bg-popover p-6 text-popover-foreground shadow-overlay duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <BaseDialog.Close
            aria-label="Cerrar"
            className="absolute right-4 top-4 z-50 rounded-full bg-zinc-900/80 backdrop-blur-md p-2 text-zinc-400 border border-white/10 opacity-100 hover:text-white hover:bg-zinc-800 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none cursor-pointer shadow-xl"
          >
            <X className="size-4 sm:size-5" />
            <span className="sr-only">Cerrar</span>
          </BaseDialog.Close>
        )}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  ),
);
DialogContent.displayName = 'DialogContent';

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 text-left', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

export interface DialogTitleProps
  extends React.ComponentPropsWithoutRef<typeof BaseDialog.Title> {
  asChild?: boolean;
}

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  DialogTitleProps
>(({ className, asChild = false, render, children, ...props }, ref) => {
  if (asChild && React.isValidElement(children)) {
    return (
      <BaseDialog.Title
        ref={ref}
        render={children}
        className={cn('font-display text-lg font-bold tracking-tight text-foreground', className)}
        {...props}
      />
    );
  }
  return (
    <BaseDialog.Title
      ref={ref}
      render={render}
      className={cn('font-display text-lg font-bold tracking-tight text-foreground', className)}
      {...props}
    >
      {children}
    </BaseDialog.Title>
  );
});
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Description>
>(({ className, ...props }, ref) => (
  <BaseDialog.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
