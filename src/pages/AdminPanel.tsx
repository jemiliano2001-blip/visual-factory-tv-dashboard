/**
 * Consola de administración — vista read-only de las órdenes por facturar
 * de Odoo (mismos datos que la TV) con acciones de IA y configuración.
 * No hay CRUD de órdenes: Odoo es la única fuente de verdad.
 */
import React, { useMemo, useState } from 'react';
import { useOdooOrders } from '../hooks/useOdooOrders';
import { OdooSaleOrder, isOrderOverdue, parseOdooDate } from '../services/odoo';
import {
  filterOrdersByNaturalLanguage, generateClientReport,
  analyzeOrderAnomalies, predictOrderRisk,
} from '../services/ai';
import { RiskPrediction } from '../components/admin/riskTypes';
import OrdersTable from '../components/admin/OrdersTable';
import ConfigTab from '../components/admin/ConfigTab';
import OrderReportTab from '../components/admin/OrderReportTab';
import AIModal from '../components/admin/AIModal';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui/select';
import { TooltipProvider } from '../components/ui/tooltip';
import {
  Search, Sparkles, Download, ScanSearch, X,
  WifiOff, Loader2, RefreshCw, Table2, Settings, FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx-js-style';

const ALL_CLIENTS = '__all__';

export default function AdminPanel() {
  const { orders, error, isLoading, isFetching, lastUpdated, refetch } = useOdooOrders();

  const [activeTab, setActiveTab] = useState<'orders' | 'report' | 'config'>('orders');
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'ontime'>('all');

  // IA
  const [nlQuery, setNlQuery] = useState('');
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [aiFilterIds, setAiFilterIds] = useState<number[] | null>(null);
  const [aiModal, setAiModal] = useState<{ title: string; content: string | null } | null>(null);
  const [predictions, setPredictions] = useState<Record<number, RiskPrediction | 'loading'>>({});

  const uniqueClients = useMemo(
    () => Array.from(new Set(orders.map(o => o.partner_name))).sort(),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (aiFilterIds) result = result.filter(o => aiFilterIds.includes(o.id));
    if (clientFilter) result = result.filter(o => o.partner_name === clientFilter);
    if (statusFilter === 'overdue') result = result.filter(isOrderOverdue);
    if (statusFilter === 'ontime') result = result.filter(o => !isOrderOverdue(o));
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(o =>
        o.name.toLowerCase().includes(q) ||
        o.partner_name.toLowerCase().includes(q) ||
        o.main_product.toLowerCase().includes(q)
      );
    }
    return result;
  }, [orders, aiFilterIds, clientFilter, statusFilter, search]);

  // ── Handlers IA ──────────────────────────────────────────────────────────────

  const handleNLSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlQuery.trim()) return;
    setAiFilterIds(null);
    setIsSearchingAI(true);
    try {
      const ids = await filterOrdersByNaturalLanguage(nlQuery, orders);
      setAiFilterIds(ids);
    } catch (err) {
      console.error('Error en búsqueda IA', err);
      setAiModal({ title: 'Error', content: 'No se pudo procesar la búsqueda. Verifica tu clave API de Gemini.' });
    }
    setIsSearchingAI(false);
  };

  const clearAIFilter = () => {
    setAiFilterIds(null);
    setNlQuery('');
  };

  const handleClientReport = async (order: OdooSaleOrder) => {
    setAiModal({ title: `Reporte para ${order.partner_name} — ${order.name}`, content: null });
    try {
      const text = await generateClientReport(order);
      setAiModal({ title: `Reporte para ${order.partner_name} — ${order.name}`, content: text || 'Sin respuesta del modelo.' });
    } catch (err) {
      console.error(err);
      setAiModal({ title: 'Error', content: 'No se pudo generar el reporte. Verifica tu clave API de Gemini.' });
    }
  };

  const handleAnomalies = async () => {
    setAiModal({ title: `Análisis de anomalías (${filteredOrders.length} órdenes)`, content: null });
    try {
      const text = await analyzeOrderAnomalies(filteredOrders);
      setAiModal({ title: `Análisis de anomalías (${filteredOrders.length} órdenes)`, content: text || 'Sin respuesta del modelo.' });
    } catch (err) {
      console.error(err);
      setAiModal({ title: 'Error', content: 'No se pudo analizar. Verifica tu clave API de Gemini.' });
    }
  };

  const handlePredictRisk = async (order: OdooSaleOrder) => {
    setPredictions(p => ({ ...p, [order.id]: 'loading' }));
    try {
      const result = await predictOrderRisk(order);
      setPredictions(p => ({ ...p, [order.id]: result }));
    } catch (err) {
      console.error(err);
      setPredictions(p => {
        const { [order.id]: _removed, ...rest } = p;
        return rest;
      });
      setAiModal({ title: 'Error', content: 'No se pudo predecir el riesgo. Verifica tu clave API de Gemini.' });
    }
  };

  // ── Export Excel ─────────────────────────────────────────────────────────────

  const handleExport = () => {
    const data = filteredOrders.map(o => {
      const dOrder = parseOdooDate(o.date_order);
      const dCommit = parseOdooDate(o.commitment_date);
      return {
        'SO': o.name,
        'Cliente': o.partner_name,
        'Producto': o.main_product,
        'Fecha Orden': dOrder ? format(dOrder, 'dd/MM/yyyy') : '',
        'Compromiso': dCommit ? format(dCommit, 'dd/MM/yyyy') : '',
        'Vencida': isOrderOverdue(o) ? 'SÍ' : 'NO',
        'Entregado': o.qty_delivered,
        'Total': o.qty_total,
        'Vendedor': o.salesperson || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Órdenes Odoo');
    XLSX.writeFile(wb, `ordenes_odoo_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background font-sans text-foreground">
        <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
          {/* Cabecera */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-6">
            <div>
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
                Consola de Administración
              </h1>
              <p className="mt-1.5 font-mono-data text-xs uppercase tracking-widest text-muted-foreground">
                Órdenes por facturar — solo lectura
                {lastUpdated && ` · actualizado ${format(new Date(lastUpdated), 'HH:mm:ss')}`}
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? 'animate-spin text-primary' : ''} />
              Actualizar
            </Button>
          </div>

          {error && !isLoading && (
            <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
              <WifiOff className="size-5 shrink-0" />
              <span className="font-bold">SIN CONEXIÓN A ODOO — {error}</span>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'orders' | 'report' | 'config')}>
            <TabsList>
              <TabsTrigger value="orders"><Table2 /> Órdenes</TabsTrigger>
              <TabsTrigger value="report"><FileText /> Reporte</TabsTrigger>
              <TabsTrigger value="config"><Settings /> Configuración</TabsTrigger>
            </TabsList>

            <TabsContent value="orders" className="mt-5 space-y-4">
              {/* Búsqueda IA — acción principal */}
              <form onSubmit={handleNLSearch} className="flex flex-wrap gap-2">
                <div className="relative min-w-[260px] flex-1">
                  <Sparkles className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
                  <Input
                    value={nlQuery}
                    onChange={e => setNlQuery(e.target.value)}
                    placeholder='Búsqueda IA: "las vencidas de más de 100 mil pesos"…'
                    className="pl-10"
                  />
                </div>
                <Button type="submit" disabled={isSearchingAI || !nlQuery.trim()}>
                  {isSearchingAI ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  Buscar con IA
                </Button>
                {aiFilterIds && (
                  <Button type="button" variant="ghost" onClick={clearAIFilter}>
                    <X /> Limpiar filtro IA ({aiFilterIds.length})
                  </Button>
                )}
              </form>

              {/* Filtros + acciones secundarias */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar SO, cliente o producto…"
                    className="pl-10"
                  />
                </div>
                <Select
                  value={clientFilter || ALL_CLIENTS}
                  onValueChange={v => setClientFilter(v === ALL_CLIENTS ? '' : v)}
                >
                  <SelectTrigger className="w-[210px]">
                    <SelectValue placeholder="Todos los clientes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CLIENTS}>Todos los clientes</SelectItem>
                    {uniqueClients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={v => setStatusFilter(v as 'all' | 'overdue' | 'ontime')}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="overdue">Vencidas</SelectItem>
                    <SelectItem value="ontime">En tiempo</SelectItem>
                  </SelectContent>
                </Select>
                <div className="ml-auto flex gap-2">
                  <Button type="button" variant="secondary" onClick={handleAnomalies} disabled={filteredOrders.length === 0}>
                    <ScanSearch /> Anomalías
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleExport} disabled={filteredOrders.length === 0}>
                    <Download /> Excel
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                <span className="font-mono-data font-bold text-foreground">{filteredOrders.length}</span> de{' '}
                <span className="font-mono-data">{orders.length}</span> órdenes
              </p>

              {isLoading ? (
                <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
                  <Loader2 className="size-6 animate-spin" /> Cargando órdenes de Odoo…
                </div>
              ) : (
                <OrdersTable
                  orders={filteredOrders}
                  predictions={predictions}
                  onClientReport={handleClientReport}
                  onPredictRisk={handlePredictRisk}
                />
              )}
            </TabsContent>

            <TabsContent value="report" className="mt-5">
              <OrderReportTab orders={filteredOrders} />
            </TabsContent>

            <TabsContent value="config" className="mt-5">
              <ConfigTab companyNames={uniqueClients} />
            </TabsContent>
          </Tabs>
        </div>

        {aiModal && (
          <AIModal title={aiModal.title} content={aiModal.content} onClose={() => setAiModal(null)} />
        )}
      </div>
    </TooltipProvider>
  );
}
