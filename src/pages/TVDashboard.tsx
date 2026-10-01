import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CompanyConfig } from '../types';
import { subscribeToCompanyConfigs } from '../services/companyConfigs';
import { Clock, RefreshCw, WifiOff, CheckCircle2 } from 'lucide-react';
import CompanyBadge from '../components/CompanyBadge';
import { getSmartCompanyName } from '../utils/customerNames';
import {
  OdooSaleOrder,
  getDeliveryProgress,
  isOrderOverdue,
  isOrderFullyDelivered,
  getOrderPriority,
  getEffectiveDeliverySchedule,
} from '../services/odoo';
import { useOdooOrders } from '../hooks/useOdooOrders';
import OdooOrderCard from '../components/OdooOrderCard';
import type { ViewMode, ScreenTier } from '../components/OdooOrderCard';
import { SharedTVPage } from '../components/SharedTVPage';
import SkeletonCard from '../components/SkeletonCard';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import DashboardHeader from '../components/DashboardHeader';
import DashboardFooter from '../components/DashboardFooter';
import TVControlBar, { type StatusFilter } from '../components/TVControlBar';
import { createOrderSearchMatcher } from '../services/orderSearch';
import { usePersistedState } from '../hooks/usePersistedState';
import { useMobile } from '../hooks/useMobile';
import { buildTVPages, type TVPage } from '../utils/tvPagePacking';
import { getCenteredLastRowStart } from '../utils/tvGridLayout';
import { INITIAL_ROTATION_PAUSED, shouldAutoRotate } from '../services/rotationPolicy';

// ─── TVDashboard principal ─────────────────────────────────────────────────────

const CompanyTVSection: React.FC<{
  company: string;
  orders: OdooSaleOrder[];
  isWide: boolean;
  isDense: boolean;
  screenTier: ScreenTier;
  gridCols: number;
  gridRows: number;
  onOrderClick: (order: OdooSaleOrder) => void;
}> = ({ company, orders, isWide, isDense, screenTier, gridCols, gridRows, onOrderClick }) => (
  <div className="h-full min-h-0 w-full">
    <motion.div
      key={`${company}-grid`}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.5 }}
      className="grid h-full min-h-0 gap-3 lg:gap-4"
      style={{
        gridTemplateColumns: `repeat(${gridCols * 2}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${Math.ceil(orders.length / gridCols)}, minmax(0, 1fr))`,
      }}
    >
      {orders.map((order, index) => {
        const centeredStart = getCenteredLastRowStart(index, orders.length, gridCols);

        return (
          <div
            key={order.id}
            className="min-h-0"
            style={{
              gridColumn: centeredStart ? `${centeredStart} / span 2` : 'span 2',
            }}
          >
            <OdooOrderCard
              order={order}
              isWide={isWide}
              isDense={isDense}
              hidePartner={isDense}
              screenTier={screenTier}
              viewMode="tv"
              onClick={() => onOrderClick(order)}
            />
          </div>
        );
      })}
    </motion.div>
  </div>
);

export default function TVDashboard() {

  // ── Odoo state (hook compartido) ─────────────────────────────────────────────
  const {
    status: odooStatus,
    orders: odooOrders,
    lastUpdated: odooLastUpdated,
    error: odooError,
    isLoading: isLoadingOdoo,
    isFetching: isRefreshing,
    refetch,
  } = useOdooOrders();

  const loadOdooOrders = () => refetch();

  // ── Configs + UI ─────────────────────────────────────────────────────────────
  const navigate = useNavigate();
  const [companyConfigs, setCompanyConfigs] = useState<CompanyConfig[]>([]);
  const [showGradient, setShowGradient]     = useState(true);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedOrder, setSelectedOrder]   = useState<OdooSaleOrder | null>(null);
  const [viewMode, setViewMode]             = usePersistedState<ViewMode>('vftv:tv:viewMode', 'tv');
  const [isFullscreen, setIsFullscreen]     = useState(false);
  const containerRef                        = useRef<HTMLDivElement>(null);
  const mainViewportRef                     = useRef<HTMLDivElement>(null);
  const [gridCols, setGridCols]             = useState(4);
  const [gridRows, setGridRows]             = useState(2);
  const [ordersPerPage, setOrdersPerPage]   = useState(8);
  const [isWide, setIsWide]                 = useState(false);
  const [isDense, setIsDense]               = useState(false);
  const [screenTier, setScreenTier]         = useState<ScreenTier>('lg');
  const [toast, setToast]                   = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [statusFilter, setStatusFilter]       = useState<StatusFilter>('all');
  const [clientFilter, setClientFilter]     = usePersistedState<string | null>('vftv:tv:client', null);
  const [textFilter, setTextFilter]         = usePersistedState<string>('vftv:tv:text', '');
  const [rotationPaused, setRotationPaused] = useState(INITIAL_ROTATION_PAUSED);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMobile = useMobile();
  // En móvil siempre modo escritorio: sin paginación ni auto-rotación
  const effectiveViewMode: ViewMode = isMobile ? 'desktop' : viewMode;
  const isTVMode = effectiveViewMode === 'tv';

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Company configs (para horarios de entrega) ───────────────────────────────
  useEffect(() => {
    const unsub = subscribeToCompanyConfigs(setCompanyConfigs);
    return () => unsub();
  }, []);

  // ── Limpieza general al desmontar (evita fugas en pantallas 24/7) ───────────
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  // ── Auto-limpieza por inactividad en modo TV ─────────────────────────────────
  // En una TV de pared desatendida, si un operador aplicó filtros o pausó la
  // rotación y se alejó, auto-restaurar la rotación general tras 3 minutos sin actividad.
  useEffect(() => {
    if (!isTVMode) return;
    const hasActiveFilters = Boolean(
      clientFilter || textFilter || statusFilter !== 'all' || rotationPaused
    );
    if (!hasActiveFilters) return;

    let inactivityTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      handleClearControls();
    }, 180000);

    const onActivity = () => {
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          handleClearControls();
        }, 180000);
      }
    };

    window.addEventListener('mousemove', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity, { passive: true });
    window.addEventListener('touchstart', onActivity, { passive: true });

    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('touchstart', onActivity);
    };
  }, [isTVMode, clientFilter, textFilter, statusFilter, rotationPaused]);

  // ── Fullscreen ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Reset scroll on mode change ──────────────────────────────────────────────
  useEffect(() => {
    if (mainViewportRef.current) {
      mainViewportRef.current.scrollTop = 0;
    }
  }, [viewMode]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err =>
        showToast(`Error al activar pantalla completa: ${err.message}`, 'error')
      );
    } else {
      document.exitFullscreen();
    }
  };

  // ── ResizeObserver para layout adaptativo ────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const aspectRatio    = width / height;
        const isWideScreen   = aspectRatio > 1.3;
        const gap            = width > 1200 ? 16 : 12;
        // En modo TV, reservar espacio preciso para header y footer
        // En modo desktop, no importa tanto porque hay scroll
        const headerArea     = isWideScreen ? 100 : 80;
        const footerArea     = 40;
        const available      = isTVMode
          ? height - headerArea - footerArea
          : height; // En desktop el grid puede crecer más allá

        let cols = 1;
        if (width > 1800) cols = 5;
        else if (width > 1400) cols = 4;
        else if (width > 1000) cols = 3;
        else if (width > 600)  cols = 2;

        const isDenseLayout = isTVMode && ((available / 4) < 200 || cols >= 4);
        const minCardHeight = isDenseLayout ? 80 : (isWideScreen ? 240 : 200);
        let rows = Math.max(1, Math.floor((available + gap) / (minCardHeight + gap)));

        // En modo desktop sin paginación: mostrar hasta 20 rows
        if (!isTVMode) {
          rows = Math.max(rows, 4);
        }

        // Nivel de legibilidad por ancho de viewport: tablet < desktop < TV/4K.
        // Breakpoints inteligentes: mobile (<768) / tablet (768-1279) /
        // desktop (1280-1919) / TV (>=1920).
        const tier: ScreenTier =
          width >= 1920 ? 'xl'
          : width >= 1280 ? 'lg'
          : width >= 768  ? 'md'
          : 'sm';

        setGridCols(cols);
        setGridRows(rows);
        setOrdersPerPage(isTVMode ? cols * rows || 8 : 999);
        setIsWide(cols <= 4 && rows <= 2 && isWideScreen && !isDenseLayout);
        setIsDense(isDenseLayout);
        setScreenTier(tier);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isTVMode]);

  // ── Paginación ───────────────────────────────────────────────────────────────
  const uniqueClients = useMemo(
    () => Array.from(new Set(odooOrders.map(o => o.partner_name))).sort(),
    [odooOrders],
  );

  const filteredOdooOrders = useMemo(() => {
    const matchesClient = (order: OdooSaleOrder) =>
      !clientFilter || order.partner_name.toLowerCase().includes(clientFilter.toLowerCase());

    const matchesText = createOrderSearchMatcher(textFilter);

    // Override: el filtro 'entregadas' muestra SOLO las totalmente entregadas.
    if (statusFilter === 'delivered') {
      return odooOrders.filter(o => isOrderFullyDelivered(o) && matchesClient(o) && matchesText(o));
    }

    // Por defecto: ocultar de la vista TV las órdenes totalmente entregadas.
    return odooOrders.filter(order => {
      if (isOrderFullyDelivered(order)) return false;
      if (!matchesClient(order)) return false;
      if (!matchesText(order)) return false;
      if (statusFilter === 'all') return true;
      const isOverdue = isOrderOverdue(order);
      const progress = getDeliveryProgress(order);
      if (statusFilter === 'overdue') return isOverdue;
      if (statusFilter === 'pending') return progress < 100 && !isOverdue;
      if (statusFilter === 'critical') {
        const priority = getOrderPriority(order);
        return priority === 'critical' || priority === 'high';
      }
      return true;
    });
  }, [odooOrders, statusFilter, clientFilter, textFilter]);

  const groupedOrders = useMemo(() =>
    filteredOdooOrders.reduce((acc, order) => {
      const key = order.partner_name;
      if (!acc[key]) acc[key] = [];
      acc[key].push(order);
      return acc;
    }, {} as Record<string, OdooSaleOrder[]>),
    [filteredOdooOrders]
  );

  const pages = useMemo<TVPage[]>(() => {
    if (isTVMode) {
      return buildTVPages(filteredOdooOrders, { ordersPerPage, gridCols, gridRows });
    }
    return Object.entries(groupedOrders).map(([company, orders]) => ({
      type: 'company' as const,
      company,
      orders,
    }));
  }, [filteredOdooOrders, groupedOrders, ordersPerPage, gridCols, gridRows, isTVMode]);

  // ── Auto-rotate pages (solo en modo TV) ──────────────────────────────────────
  useEffect(() => {
    if (!shouldAutoRotate({
      isTVMode,
      pageCount: pages.length,
      paused: rotationPaused,
    })) return;
    const interval = setInterval(() => {
      setCurrentPageIndex(prev => (prev + 1) % pages.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [pages.length, isTVMode, rotationPaused]);

  useEffect(() => {
    if (currentPageIndex >= pages.length && pages.length > 0) setCurrentPageIndex(0);
  }, [pages.length, currentPageIndex]);

  // Al cambiar el filtro de cliente o la búsqueda, volver a la primera página.
  useEffect(() => {
    setCurrentPageIndex(0);
  }, [clientFilter, textFilter]);

  const currentPage = pages.length > 0 ? pages[currentPageIndex] : null;
  const currentHeaderCompany = isTVMode
    ? currentPage?.type === 'company'
      ? currentPage.company
      : currentPage?.type === 'shared'
        ? 'CLIENTES COMPARTIDOS'
        : undefined
    : undefined;
  const currentHeaderCompanyLogo = null;
  const currentCompanyDeliverySchedule = isTVMode && currentPage?.type === 'company'
    ? getEffectiveDeliverySchedule(currentPage.company, currentPage.orders, companyConfigs)
    : null;
  const currentPageOrders = currentPage?.type === 'company'
    ? currentPage.orders
    : currentPage?.type === 'shared'
      ? currentPage.segments.flatMap(segment => segment.orders)
      : [];
  const currentPageOverdueCount = currentPageOrders.filter(isOrderOverdue).length;
  const currentPageCriticalCount = currentPageOrders.filter(order => {
    const priority = getOrderPriority(order);
    return priority === 'critical' || priority === 'high';
  }).length;

  const handleClearControls = () => {
    setClientFilter(null);
    setTextFilter('');
    setRotationPaused(false);
    setStatusFilter('all');
    setCurrentPageIndex(0);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={mainViewportRef}
      className={`bg-background text-foreground px-4 lg:px-6 font-sans transition-all duration-700 relative custom-scrollbar ${
        isTVMode ? 'tv-viewport' : 'desktop-viewport'
      } ${isFullscreen ? 'w-full h-full' : ''}`}
    >
      {/* Fondo degradado — decorativo, alternable desde el header. */}
      <AnimatePresence>
        {showGradient && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none z-0"
            aria-hidden="true"
          >
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/8 blur-[130px] rounded-full" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <DashboardHeader
        currentCompany={currentHeaderCompany}
        currentCompanyLogo={currentHeaderCompanyLogo}
        currentCompanyDeliverySchedule={currentCompanyDeliverySchedule}
        currentPageNum={currentPage?.type === 'company' ? currentPage.current : undefined}
        totalPages={currentPage?.type === 'company' ? currentPage.total : undefined}
        screenOrderCount={currentPageOrders.length}
        screenOverdueCount={currentPageOverdueCount}
        screenCriticalCount={currentPageCriticalCount}
        onShowOverdue={() => {
          if (currentPageOverdueCount === 0) return;
          setStatusFilter('overdue');
          setRotationPaused(true);
          setCurrentPageIndex(0);
        }}
        odooStatus={odooStatus}
        odooLastUpdated={odooLastUpdated}
        isRefreshing={isRefreshing}
        onRefresh={loadOdooOrders}
        viewMode={effectiveViewMode}
        onViewModeChange={setViewMode}
        showGradient={showGradient}
        onToggleGradient={() => setShowGradient(v => !v)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        statusFilter={statusFilter}
        clientFilter={clientFilter}
        textFilter={textFilter}
        onClearFilter={handleClearControls}
        isRotationPaused={rotationPaused}
        onResumeRotation={() => setRotationPaused(false)}
        onNavigateAdmin={() => navigate('/admin')}
      />

      {/* ── Main grid ──────────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className={`flex-1 relative flex flex-col z-10 ${
          isTVMode ? 'min-h-0 overflow-hidden pb-1' : 'pb-1'
        }`}
      >
        {odooOrders.length > 0 && (
          <TVControlBar
            isTVMode={isTVMode}
            isMobile={isMobile}
            clients={uniqueClients}
            clientFilter={clientFilter}
            onClient={setClientFilter}
            statusFilter={statusFilter}
            onStatus={setStatusFilter}
            textFilter={textFilter}
            onText={setTextFilter}
            isPaused={rotationPaused}
            onTogglePause={() => setRotationPaused(p => !p)}
            onClear={handleClearControls}
          />
        )}

        {isLoadingOdoo ? (
          <div className="flex flex-col h-full">
            <div className="mb-6 flex items-center justify-between">
              <div className="h-10 w-64 bg-secondary/50 rounded-lg animate-pulse" />
            </div>
            <div
              className="grid gap-6 flex-1"
              style={{
                gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                gridTemplateRows: isTVMode ? `repeat(${gridRows}, minmax(0, 1fr))` : undefined,
              }}
            >
              {Array.from({ length: isTVMode ? (gridCols * gridRows) : 8 }).map((_, i) => (
                <SkeletonCard key={i} isWide={isWide} isDense={isDense} screenTier={screenTier} />
              ))}
            </div>
          </div>
        ) : odooError && odooOrders.length === 0 ? (
          /* Error state — Odoo no disponible */
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="w-20 h-20 rounded-3xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
              <WifiOff className="w-10 h-10 text-red-400" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Sin conexión a Odoo</h2>
              <p className="text-muted-foreground max-w-md">{odooError}</p>
              {window.location.hostname === 'localhost' && (
                <p className="text-muted-foreground/70 text-sm">
                  Asegúrate de que el servidor Express proxy esté corriendo:<br />
                  <code className="text-indigo-400 bg-card px-2 py-0.5 rounded text-xs">npm run server</code>
                </p>
              )}
            </div>
            <button
              onClick={() => loadOdooOrders()}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-2xl font-bold hover:bg-indigo-500/30 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Reintentar
            </button>
          </div>
        ) : odooOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Todo facturado</h2>
              <p className="text-muted-foreground mt-2">No hay órdenes de venta pendientes de facturar en Odoo.</p>
            </div>
          </div>
        ) : isTVMode && currentPage ? (
          /* ── Modo TV: paginación con cards que caben en viewport ──── */
          <div className="flex flex-col h-full min-h-0 relative">
            {currentPage.type === 'company' && currentPage.total && currentPage.total > 1 && (
              <div className="md:hidden absolute top-0 right-0 z-10 text-muted-foreground font-bold uppercase tracking-widest text-xs lg:text-sm bg-background/50 px-2 py-1 rounded backdrop-blur-sm">
                Página {currentPage.current} de {currentPage.total}
              </div>
            )}
            
            {currentPage.type === 'company' ? (
              <CompanyTVSection 
                company={currentPage.company}
                orders={currentPage.orders}
                isWide={isWide}
                isDense={isDense}
                screenTier={screenTier}
                gridCols={gridCols}
                gridRows={gridRows}
                onOrderClick={setSelectedOrder}
              />
            ) : (
              <SharedTVPage
                page={currentPage}
                gridCols={gridCols}
                gridRows={gridRows}
                isWide={isWide}
                isDense={isDense}
                screenTier={screenTier}
                onOrderClick={setSelectedOrder}
              />
            )}
          </div>
        ) : !isTVMode && pages.length > 0 ? (
          /* ── Modo Desktop: todas las órdenes con scroll, agrupadas ── */
          <div className={`flex flex-col ${isMobile ? 'gap-4' : 'gap-8'}`}>
            {pages.map((page) => {
              if (page.type !== 'company') return null;
              const pageData = page;
              return (
              <div key={pageData.company} className="flex flex-col gap-4">
                {/* Company header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 lg:gap-5">
                    <CompanyBadge company={pageData.company} size="lg" />
                    <div>
                      <h2 className="text-xl md:text-2xl lg:text-3xl font-black text-foreground tracking-tight uppercase" title={pageData.company}>
                        {getSmartCompanyName(pageData.company, 'header')}
                      </h2>
                      {getEffectiveDeliverySchedule(pageData.company, pageData.orders, companyConfigs) && (
                        <div className="flex items-center gap-1.5 mt-1 text-cyan-300 font-mono-data text-xs lg:text-sm font-semibold tracking-wide">
                          <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
                          <span>
                            Horario: {getEffectiveDeliverySchedule(pageData.company, pageData.orders, companyConfigs)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground font-bold uppercase tracking-widest">
                    {pageData.orders.length} {pageData.orders.length === 1 ? 'orden' : 'órdenes'}
                  </span>
                </div>

                {/* Orders grid */}
                <div
                  className={`grid ${isMobile ? 'gap-3' : 'gap-4 lg:gap-6'}`}
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(gridCols, 4)}, minmax(0, 1fr))`,
                    gridAutoRows: isMobile ? 'auto' : 'minmax(220px, auto)',
                  }}
                >
                  {pageData.orders.map((order) => (
                    <OdooOrderCard
                      key={order.id}
                      order={order}
                      isWide={false}
                      isDense={false}
                      isMobile={isMobile}
                      screenTier={screenTier}
                      viewMode="desktop"
                      onClick={() => setSelectedOrder(order)}
                    />
                  ))}
                </div>
              </div>
            )})}
          </div>
        ) : null}
      </div>

      {/* ── Modal de Detalles de Orden ───────────────────────────────────────── */}
      <OrderDetailsModal
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />

      {/* ── Footer ─────────────────────────────────────────────────────────────── */}
      <DashboardFooter
        totalOrders={filteredOdooOrders.length}
        pages={isTVMode ? pages : []}
        currentPageIndex={currentPageIndex}
        onPageChange={setCurrentPageIndex}
        toast={toast}
      />
    </div>
  );
}
