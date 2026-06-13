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
import AIModal from '../components/admin/AIModal';
import {
  Search, Sparkles, Download, ScanSearch, X,
  WifiOff, Loader2, RefreshCw, Table2, Settings,
} from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx-js-style';

export default function AdminPanel() {
  const { orders, error, isLoading, isFetching, lastUpdated, refetch } = useOdooOrders();

  const [activeTab, setActiveTab] = useState<'orders' | 'config'>('orders');
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
        'Monto': o.amount_total,
        'Moneda': o.currency,
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
    <div className="min-h-screen bg-zinc-950 text-white font-sans">
      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Consola de Administración</h1>
            <p className="text-zinc-500 mt-1">
              Órdenes por facturar en Odoo (solo lectura)
              {lastUpdated && ` — actualizado ${format(new Date(lastUpdated), 'HH:mm:ss')}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>

        {error && !isLoading && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-2xl p-4">
            <WifiOff className="w-5 h-5 shrink-0" />
            <span className="font-bold">SIN CONEXIÓN A ODOO — {error}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/10">
          <TabButton active={activeTab === 'orders'} onClick={() => setActiveTab('orders')} icon={<Table2 className="w-4 h-4" />}>
            Órdenes
          </TabButton>
          <TabButton active={activeTab === 'config'} onClick={() => setActiveTab('config')} icon={<Settings className="w-4 h-4" />}>
            Configuración
          </TabButton>
        </div>

        {activeTab === 'orders' ? (
          <div className="space-y-4">
            {/* Búsqueda IA */}
            <form onSubmit={handleNLSearch} className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[260px]">
                <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
                <input
                  type="text"
                  value={nlQuery}
                  onChange={e => setNlQuery(e.target.value)}
                  placeholder='Búsqueda IA: "las vencidas de más de 100 mil pesos"…'
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:border-purple-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSearchingAI || !nlQuery.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
              >
                {isSearchingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Buscar con IA
              </button>
              {aiFilterIds && (
                <button
                  type="button"
                  onClick={clearAIFilter}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
                >
                  <X className="w-4 h-4" /> Limpiar filtro IA ({aiFilterIds.length})
                </button>
              )}
            </form>

            {/* Filtros + acciones */}
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar SO, cliente o producto…"
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <select
                value={clientFilter}
                onChange={e => setClientFilter(e.target.value)}
                className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Todos los clientes</option>
                {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as 'all' | 'overdue' | 'ontime')}
                className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="all">Todas</option>
                <option value="overdue">Vencidas</option>
                <option value="ontime">En tiempo</option>
              </select>
              <button
                type="button"
                onClick={handleAnomalies}
                disabled={filteredOrders.length === 0}
                className="px-4 py-2 bg-amber-600/80 hover:bg-amber-500 disabled:opacity-50 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
              >
                <ScanSearch className="w-4 h-4" /> Anomalías
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={filteredOrders.length === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> Excel
              </button>
            </div>

            <p className="text-xs text-zinc-500">
              {filteredOrders.length} de {orders.length} órdenes
            </p>

            {isLoading ? (
              <div className="flex items-center justify-center py-24 text-zinc-500 gap-3">
                <Loader2 className="w-6 h-6 animate-spin" /> Cargando órdenes de Odoo…
              </div>
            ) : (
              <OrdersTable
                orders={filteredOrders}
                predictions={predictions}
                onClientReport={handleClientReport}
                onPredictRisk={handlePredictRisk}
              />
            )}
          </div>
        ) : (
          <ConfigTab companyNames={uniqueClients} />
        )}
      </div>

      {aiModal && (
        <AIModal title={aiModal.title} content={aiModal.content} onClose={() => setAiModal(null)} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 font-bold text-sm flex items-center gap-2 border-b-2 -mb-px transition-colors ${
        active
          ? 'border-blue-500 text-white'
          : 'border-transparent text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {icon} {children}
    </button>
  );
}
