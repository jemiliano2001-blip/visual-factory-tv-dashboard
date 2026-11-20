import * as React from 'react';
import { cn } from '../../lib/utils';

/** Vacío con título y siguiente paso opcional (patrón EmptyState). */
export function EmptyState({
  icon, title, hint, action, className, role,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
  role?: 'status';
}) {
  return (
    <div role={role} className={cn('flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-12 text-center', className)}>
      {icon}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {hint && <p className="max-w-md text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
