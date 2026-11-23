export function AdminLoadingSkeleton({ view, isMobile }: { view: 'company' | 'toolcrib'; isMobile: boolean }) {
  if (view === 'toolcrib') {
    return (
      <div role="status" aria-label="Cargando órdenes de Odoo" className="space-y-4">
        <span className="sr-only">Cargando órdenes de Odoo…</span>
        <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card animate-pulse">
          {[0, 1, 2].map(i => (
            <div key={i} className="space-y-2 px-3 py-3 md:px-5 md:py-4">
              <div className="h-3.5 w-24 rounded bg-muted" />
              <div className="h-8 w-16 rounded bg-muted/80" />
            </div>
          ))}
        </div>
        {[0, 1].map(group => (
          <div key={group} className="overflow-hidden rounded-2xl border border-border bg-card shadow-card animate-pulse">
            <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
              <div className="h-4 w-4 rounded bg-muted" />
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="ml-auto h-4 w-28 rounded bg-muted/80" />
            </div>
            <div className="divide-y divide-border">
              {[0, 1, 2].map(row => (
                <div key={row} className="flex items-center gap-4 px-4 py-3">
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="h-4 w-32 rounded bg-muted/70" />
                  <div className="h-4 flex-1 rounded bg-muted/60" />
                  <div className="h-5 w-14 rounded-full bg-muted/80" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isMobile) {
    return (
      <div role="status" aria-label="Cargando órdenes de Odoo" className="space-y-3">
        <span className="sr-only">Cargando órdenes de Odoo…</span>
        {[0, 1, 2, 3].map(idx => (
          <div key={idx} className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-card animate-pulse">
            <div className="flex items-center justify-between gap-2">
              <div className="h-5 w-28 rounded bg-muted" />
              <div className="h-5 w-20 rounded-full bg-muted" />
            </div>
            <div className="h-4 w-44 rounded bg-muted/80" />
            <div className="h-3.5 w-full rounded bg-muted/60" />
            <div className="h-2 w-full rounded-full bg-muted/50" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div role="status" aria-label="Cargando órdenes de Odoo" className="overflow-hidden rounded-2xl border border-border bg-card shadow-card animate-pulse">
      <span className="sr-only">Cargando órdenes de Odoo…</span>
      <div className="border-b border-border bg-muted/40 px-4 py-3.5">
        <div className="h-4 w-64 rounded bg-muted" />
      </div>
      <div className="divide-y divide-border">
        {[0, 1, 2, 3, 4, 5].map(row => (
          <div key={row} className="flex items-center gap-4 px-4 py-4">
            <div className="size-4 rounded bg-muted" />
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-4 w-28 rounded bg-muted/80" />
            <div className="h-4 w-32 rounded bg-muted/70" />
            <div className="h-4 flex-1 rounded bg-muted/60" />
            <div className="h-5 w-20 rounded-full bg-muted/80" />
          </div>
        ))}
      </div>
    </div>
  );
}
