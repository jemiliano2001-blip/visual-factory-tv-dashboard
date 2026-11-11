/**
 * Navegación del Admin por secciones: sidebar en escritorio y barra inferior
 * (4 destinos + "Más") en móvil. La sección vive en el link (?tab=…&vista=…);
 * este componente solo la lee y la cambia, sin estado propio.
 */
import { useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  BarChart3, Building2, CalendarDays, FileText, ListTodo, MoreHorizontal, Settings, Truck, Tv,
  type LucideIcon,
} from 'lucide-react';
import { parseAdminFilters, type AdminFilters } from '../../services/adminFilters';
import {
  ADMIN_SECTIONS, MOBILE_PRIMARY_SECTIONS, adminSectionHref, getSection, isInMoreMenu, sectionFromFilters,
  type AdminSectionId,
} from '../../services/adminSections';
import { useInvoiceRequests } from '../../hooks/useInvoiceRequests';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '../ui/drawer';

const SECTION_ICON: Record<AdminSectionId, LucideIcon> = {
  company: Building2, pending: ListTodo, agenda: CalendarDays, deliveries: Truck, requests: FileText, config: Settings,
};

export function useAdminSection(): { onAdmin: boolean; filters: AdminFilters | null; section: AdminSectionId | null } {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const onAdmin = pathname === '/admin';
  return useMemo(() => {
    if (!onAdmin) return { onAdmin, filters: null, section: null };
    const filters = parseAdminFilters(params);
    return { onAdmin, filters, section: sectionFromFilters(filters) };
  }, [onAdmin, params]);
}

function usePendingRequestCount(enabled: boolean): number {
  const { data } = useInvoiceRequests({ enabled });
  return data?.requests.filter(r => r.status === 'pendiente').length ?? 0;
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto rounded-md bg-primary/15 px-1.5 py-0.5 font-mono-data text-xs font-semibold tabular-nums text-primary">
      {count}
    </span>
  );
}

function SidebarItem({ id, active, href, count, replace }: { id: AdminSectionId; active: boolean; href: string; count: number; replace: boolean }) {
  const Icon = SECTION_ICON[id];
  return (
    <Link
      to={href}
      replace={replace}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? 'bg-primary/12 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />}
      <Icon className={`size-[18px] ${active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
      {getSection(id).label}
      {id === 'requests' && <CountBadge count={count} />}
    </Link>
  );
}

/** Secciones del sidebar en lugar del ítem único "Órdenes". */
export function AdminSidebarSections() {
  const { onAdmin, filters, section } = useAdminSection();
  const pending = usePendingRequestCount(onAdmin);
  const groups: ReadonlyArray<{ title: string; group: 'orders' | 'settings' }> = [
    { title: 'Órdenes', group: 'orders' },
    { title: 'Ajustes', group: 'settings' },
  ];
  return (
    <>
      {groups.map(({ title, group }) => (
        <div key={group} className="space-y-1 pt-2 first:pt-0">
          <p className="mb-1 px-3 text-xs font-medium text-muted-foreground/80">{title}</p>
          {ADMIN_SECTIONS.filter(s => s.group === group).map(s => (
            <SidebarItem
              key={s.id}
              id={s.id}
              active={section === s.id}
              href={adminSectionHref(s.id, filters)}
              count={pending}
              replace={onAdmin}
            />
          ))}
        </div>
      ))}
    </>
  );
}

const TAB_BASE = 'relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 min-h-[58px] transition-colors';

/** Barra inferior móvil de /admin: 4 destinos fijos y "Más". */
export function AdminMobileNav() {
  const { onAdmin, filters, section } = useAdminSection();
  const pending = usePendingRequestCount(onAdmin);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = section !== null && isInMoreMenu(section);

  const moreItem = (to: string, label: string, Icon: LucideIcon, opts: { replace?: boolean; count?: number; active?: boolean } = {}) => (
    <Link
      key={to}
      to={to}
      replace={opts.replace}
      onClick={() => setMoreOpen(false)}
      aria-current={opts.active ? 'page' : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
        opts.active ? 'bg-primary/12 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <Icon className={`size-5 ${opts.active ? 'text-primary' : ''}`} />
      {label}
      {opts.count ? <CountBadge count={opts.count} /> : null}
    </Link>
  );

  return (
    <>
      <nav
        aria-label="Secciones del Admin"
        className="fixed bottom-0 inset-x-0 z-30 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {MOBILE_PRIMARY_SECTIONS.map(id => {
          const Icon = SECTION_ICON[id];
          const active = section === id;
          return (
            <Link
              key={id}
              to={adminSectionHref(id, filters)}
              replace
              aria-current={active ? 'page' : undefined}
              className={`${TAB_BASE} ${active ? 'text-primary' : 'text-muted-foreground'}`}
            >
              {active && <span className="absolute inset-x-4 top-0 h-[2px] rounded-b-full bg-primary" />}
              <Icon className="size-[22px]" />
              <span className="text-xs font-medium">{getSection(id).shortLabel}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`${TAB_BASE} cursor-pointer ${moreActive ? 'text-primary' : 'text-muted-foreground'}`}
        >
          {moreActive && <span className="absolute inset-x-4 top-0 h-[2px] rounded-b-full bg-primary" />}
          <span className="relative">
            <MoreHorizontal className="size-[22px]" />
            {pending > 0 && <span className="absolute -right-1.5 -top-1 size-2 rounded-full bg-primary" aria-hidden />}
          </span>
          <span className="text-xs font-medium">Más</span>
        </button>
      </nav>

      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Más secciones</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-1 px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {moreItem(adminSectionHref('requests', filters), 'Solicitudes', FileText, { replace: true, count: pending, active: section === 'requests' })}
            {moreItem(adminSectionHref('config', filters), 'Configuración', Settings, { replace: true, active: section === 'config' })}
            {moreItem('/stats', 'Estadísticas', BarChart3)}
            {moreItem('/', 'TV en vivo', Tv)}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
