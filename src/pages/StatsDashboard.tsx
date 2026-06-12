import React, { useState } from 'react';
import { useOdooOrders } from '../hooks/useOdooOrders';
import { generateShiftSummary } from '../services/ai';
import { getOrderPriority, isOrderOverdue, formatCurrency } from '../services/odoo';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  AlertTriangle, TrendingUp, DollarSign, Package,
  Sparkles, MessageCircle, WifiOff, Loader2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const PRIORITY_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];
const OVERDUE_COLORS = ['#ef4444', '#10b981'];

export default function StatsDashboard() {
  const { orders, error, isLoading } = useOdooOrders();
  const [aiSummary, setAiSummary] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateSummary = async () => {
    setIsGenerating(true);
    try {
      const summary = await generateShiftSummary(orders);
      setAiSummary(summary || 'Sin respuesta del modelo.');
    } catch (e) {
      console.error(e);
      setAiSummary('Error al generar el resumen. Por favor, compruebe su clave API e inténtelo de nuevo.');
    }
    setIsGenerating(false);
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(`*Resumen de Producción:*\n\n${aiSummary}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  // ── Métricas ────────────────────────────────────────────────────────────────
  const totalOrders = orders.length;
  const overdueCount = orders.filter(isOrderOverdue).length;
  const totalQty = orders.reduce((s, o) => s + o.qty_total, 0);
  const deliveredQty = orders.reduce((s, o) => s + o.qty_delivered, 0);
  const deliveryRate = totalQty > 0 ? Math.round((deliveredQty / totalQty) * 100) : 0;
  const totalAmount = orders.reduce((s, o) => s + o.amount_total, 0);
  const currency = orders[0]?.currency || 'MXN';

  const priorityData = [
    { name: 'Baja', value: orders.filter(o => getOrderPriority(o) === 'low').length },
    { name: 'Normal', value: orders.filter(o => getOrderPriority(o) === 'normal').length },
    { name: 'Alta', value: orders.filter(o => getOrderPriority(o) === 'high').length },
    { name: 'Crítica', value: orders.filter(o => getOrderPriority(o) === 'critical').length },
  ];

  const overdueData = [
    { name: 'Vencidas', value: overdueCount },
    { name: 'En tiempo', value: totalOrders - overdueCount },
  ];

  const clientVolume = orders.reduce((acc, o) => {
    acc[o.partner_name] = (acc[o.partner_name] || 0) + o.amount_total;
    return acc;
  }, {} as Record<string, number>);

  const clientData = Object.entries(clientVolume)
    .map(([name, amount]) => ({ name, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-white relative overflow-hidden font-sans">
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Estadísticas de Producción</h1>
          <p className="text-zinc-500 mt-1">Órdenes por facturar en Odoo — datos en vivo</p>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-2xl p-4">
            <WifiOff className="w-5 h-5 shrink-0" />
            <span className="font-bold">SIN CONEXIÓN A ODOO — {error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /> Cargando órdenes de Odoo…
          </div>
        ) : (
          <>
            {/* Tarjetas */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={<Package className="w-5 h-5 text-blue-400" />} label="Órdenes por facturar" value={String(totalOrders)} />
              <StatCard icon={<AlertTriangle className="w-5 h-5 text-red-400" />} label="Vencidas" value={String(overdueCount)} />
              <StatCard icon={<TrendingUp className="w-5 h-5 text-emerald-400" />} label="Avance de entrega" value={`${deliveryRate}%`} />
              <StatCard icon={<DollarSign className="w-5 h-5 text-amber-400" />} label="Monto por facturar" value={formatCurrency(totalAmount, currency)} />
            </div>

            {/* Gráficas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard title="Distribución por prioridad">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {priorityData.map((_, i) => <Cell key={i} fill={PRIORITY_COLORS[i % PRIORITY_COLORS.length]} />)}
                    </Pie>
                    <Legend />
                    <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Vencidas vs. en tiempo">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={overdueData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {overdueData.map((_, i) => <Cell key={i} fill={OVERDUE_COLORS[i % OVERDUE_COLORS.length]} />)}
                    </Pie>
                    <Legend />
                    <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <ChartCard title={`Top 5 clientes por monto (${currency})`}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={clientData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis type="number" stroke="#71717a" tickFormatter={(v: number | string) => formatCurrency(Number(v), currency)} />
                  <YAxis type="category" dataKey="name" stroke="#71717a" width={140} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(v: number | string) => formatCurrency(Number(v), currency)}
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 12 }}
                  />
                  <Bar dataKey="amount" fill="#3b82f6" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Resumen IA */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" /> Resumen ejecutivo con IA
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerateSummary}
                    disabled={isGenerating || orders.length === 0}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isGenerating ? 'Generando…' : 'Generar resumen'}
                  </button>
                  {aiSummary && (
                    <button
                      onClick={handleShareWhatsApp}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
                    >
                      <MessageCircle className="w-4 h-4" /> WhatsApp
                    </button>
                  )}
                </div>
              </div>
              {aiSummary && (
                <div className="prose prose-invert prose-sm max-w-none border-t border-white/10 pt-4">
                  <ReactMarkdown>{aiSummary}</ReactMarkdown>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-zinc-400 text-sm font-bold uppercase tracking-wide">
        {icon} {label}
      </div>
      <div className="text-3xl font-black mt-2">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <h3 className="text-lg font-bold mb-4">{title}</h3>
      {children}
    </div>
  );
}
