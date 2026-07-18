import React, { useState } from 'react';
import { useOdooOrders } from '../hooks/useOdooOrders';
import { generateShiftSummary, AIError } from '../services/ai';
import { getOrderStatus, getOrderAgeDays, parseOdooDate, STALE_AGE_DAYS, type OrderStatusLevel } from '../services/odoo';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
  AlertTriangle, TrendingUp, Clock, Package,
  Sparkles, MessageCircle, WifiOff, Loader2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';

const AGING_COLORS = ['#10b981', '#f59e0b', '#ef4444'];
const CHART_TOOLTIP_STYLE = { backgroundColor: '#16161d', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 };
const CHART_CURSOR = { fill: 'rgba(255,255,255,0.04)' };

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
      const msg = e instanceof AIError ? e.userMessage : 'Ocurrió un error inesperado al generar el resumen.';
      setAiSummary(msg);
    }
    setIsGenerating(false);
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(`*Resumen de Producción:*\n\n${aiSummary}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  // ── Métricas (sin información monetaria — confidencial) ───────────────────────
  const totalOrders = orders.length;
  // Urgencia unificada: fecha compromiso + tiempo de entrega parseado de la nota
  // (getOrderStatus) — la misma señal de color que usan las tarjetas de la TV.
  const statusCounts = orders.reduce(
    (acc, o) => { acc[getOrderStatus(o).level]++; return acc; },
    { overdue: 0, warning: 0, 'on-time': 0, none: 0 } as Record<OrderStatusLevel, number>
  );
  const overdueCount = statusCounts.overdue;
  const statusData = [
    { name: 'Atrasada', value: statusCounts.overdue, color: '#ef4444' },
    { name: 'Por vencer', value: statusCounts.warning, color: '#f59e0b' },
    { name: 'En tiempo', value: statusCounts['on-time'], color: '#10b981' },
    { name: 'Sin fecha', value: statusCounts.none, color: '#71717a' },
  ];
  const totalQty = orders.reduce((s, o) => s + o.qty_total, 0);
  const deliveredQty = orders.reduce((s, o) => s + o.qty_delivered, 0);
  const deliveryRate = totalQty > 0 ? Math.round((deliveredQty / totalQty) * 100) : 0;
  const staleCount = orders.filter(o => {
    const age = getOrderAgeDays(o);
    return age !== null && age > STALE_AGE_DAYS;
  }).length;

  // Pipeline de remisiones: el estado de stock.picking lo genera el almacén en
  // Odoo automáticamente — información viva sin captura manual.
  const pipelineData = (() => {
    const b = { sin: 0, prep: 0, lista: 0, parcial: 0, entregada: 0 };
    orders.forEach(o => {
      const active = (o.deliveries ?? []).filter(d => d.state !== 'cancel');
      if (active.length === 0) { b.sin++; return; }
      const done = active.filter(d => d.state === 'done').length;
      if (done === active.length) b.entregada++;
      else if (done > 0) b.parcial++;
      else if (active.some(d => d.state === 'assigned')) b.lista++;
      else b.prep++;
    });
    return [
      { name: 'Sin remisión', value: b.sin, color: '#71717a' },
      { name: 'En preparación', value: b.prep, color: '#f59e0b' },
      { name: 'Lista p/ enviar', value: b.lista, color: '#3b82f6' },
      { name: 'Entrega parcial', value: b.parcial, color: '#22d3ee' },
      { name: 'Entregada', value: b.entregada, color: '#10b981' },
    ];
  })();

  // Remisiones completadas por semana (ventanas móviles de 7 días desde hoy).
  // ponytail: solo ve remisiones de órdenes aún por facturar — las semanas
  // viejas subcuentan conforme se facturan; útil como tendencia reciente.
  const weeklyDeliveries = (() => {
    const MS_WEEK = 7 * 86_400_000;
    const now = Date.now();
    const counts = new Array(8).fill(0) as number[];
    orders.forEach(o => (o.deliveries ?? []).forEach(d => {
      if (d.state !== 'done' || !d.date_done) return;
      const t = parseOdooDate(d.date_done)?.getTime();
      if (!t) return;
      const w = Math.floor((now - t) / MS_WEEK);
      if (w >= 0 && w < 8) counts[7 - w]++;
    }));
    return counts.map((value, i) => ({
      name: i === 7 ? 'Esta sem.' : `hace ${7 - i} sem`,
      value,
    }));
  })();

  // Top clientes por NÚMERO de órdenes (qué compañía genera más), no por monto.
  const clientData = Object.entries(
    orders.reduce((acc, o) => {
      acc[o.partner_name] = (acc[o.partner_name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Carga de trabajo por vendedor (conteo de órdenes).
  const salespersonData = Object.entries(
    orders.reduce((acc, o) => {
      const k = o.salesperson || 'Sin asignar';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Distribución por antigüedad desde date_order (acumulación / atascos).
  const agingData = (() => {
    const b = { nueva: 0, media: 0, vieja: 0 };
    orders.forEach(o => {
      const age = getOrderAgeDays(o);
      if (age === null) return;
      if (age < 30) b.nueva++;
      else if (age < 90) b.media++;
      else b.vieja++;
    });
    return [
      { name: '< 1 mes', value: b.nueva },
      { name: '1–3 meses', value: b.media },
      { name: '> 3 meses', value: b.vieja },
    ];
  })();

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen overflow-hidden bg-background font-sans text-foreground">
      <div className="pointer-events-none absolute right-[-10%] top-[-10%] h-[45%] w-[45%] rounded-full bg-primary/5 blur-[140px]" />

      <div className="relative z-10 mx-auto max-w-7xl space-y-8 p-6 lg:p-8">
        <div className="border-b border-border pb-6">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">Estadísticas de Producción</h1>
          <p className="mt-1.5 font-mono-data text-xs uppercase tracking-widest text-muted-foreground">Órdenes por facturar en Odoo — datos en vivo</p>
        </div>

        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
            <WifiOff className="size-5 shrink-0" />
            <span className="font-bold">SIN CONEXIÓN A ODOO — {error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" /> Cargando órdenes de Odoo…
          </div>
        ) : (
          <>
            {/* Tarjetas KPI — sin montos. 4 en fila solo en pantallas anchas (2xl);
                en laptops el sidebar reduce el ancho útil, así que 2 columnas. */}
            <div className="grid grid-cols-2 gap-4 2xl:grid-cols-4">
              <StatCard icon={<Package className="size-5 text-indigo-400" />} label="Órdenes por facturar" value={String(totalOrders)} accent="#6366f1" />
              <StatCard icon={<AlertTriangle className="size-5 text-red-400" />} label="Vencidas" value={String(overdueCount)} accent="#ef4444" />
              <StatCard icon={<TrendingUp className="size-5 text-emerald-400" />} label="Avance de entrega" value={`${deliveryRate}%`} accent="#10b981" />
              <StatCard icon={<Clock className="size-5 text-amber-400" />} label="Antiguas (+1 mes)" value={String(staleCount)} accent="#f59e0b" />
            </div>

            {/* Urgencia de entrega — fecha compromiso + tiempo de entrega en notas */}
            <ChartCard title="Urgencia de entrega (compromiso + notas)">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={statusData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="name" stroke="#71717a" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#71717a" allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={CHART_CURSOR} />
                  <Bar dataKey="value" name="Órdenes" radius={[8, 8, 0, 0]}>
                    {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Estado real de almacén + ritmo de entregas — datos de stock.picking */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard title="Órdenes por estado de remisión">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={pipelineData} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis type="number" stroke="#71717a" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" stroke="#71717a" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={CHART_CURSOR} />
                    <Bar dataKey="value" name="Órdenes" radius={[0, 8, 8, 0]}>
                      {pipelineData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Remisiones entregadas por semana">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={weeklyDeliveries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="name" stroke="#71717a" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#71717a" allowDecimals={false} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={CHART_CURSOR} />
                    <Bar dataKey="value" name="Entregas" fill="#10b981" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Top clientes por número de órdenes */}
            <ChartCard title="Top 5 clientes por número de órdenes">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={clientData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis type="number" stroke="#71717a" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="#71717a" width={140} tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={CHART_CURSOR} />
                  <Bar dataKey="count" name="Órdenes" fill="#6366f1" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Carga por vendedor + antigüedad */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChartCard title="Órdenes por vendedor">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salespersonData} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis type="number" stroke="#71717a" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" stroke="#71717a" width={140} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={CHART_CURSOR} />
                    <Bar dataKey="count" name="Órdenes" fill="#22d3ee" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Órdenes por antigüedad">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={agingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="name" stroke="#71717a" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#71717a" allowDecimals={false} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={CHART_CURSOR} />
                    <Bar dataKey="value" name="Órdenes" radius={[8, 8, 0, 0]}>
                      {agingData.map((_, i) => <Cell key={i} fill={AGING_COLORS[i % AGING_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Resumen IA */}
            <Card className="space-y-4 p-6" style={{ borderTop: '2px solid rgba(139,92,246,0.45)' }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
                  <Sparkles className="size-5 text-violet-400" /> Resumen ejecutivo con IA
                </h3>
                <div className="flex gap-2">
                  <Button onClick={handleGenerateSummary} disabled={isGenerating || orders.length === 0}>
                    {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    {isGenerating ? 'Generando…' : 'Generar resumen'}
                  </Button>
                  {aiSummary && (
                    <Button variant="secondary" onClick={handleShareWhatsApp}>
                      <MessageCircle /> WhatsApp
                    </Button>
                  )}
                </div>
              </div>
              {aiSummary && (
                <div className="prose prose-invert prose-sm max-w-none border-t border-border pt-4">
                  <ReactMarkdown>{aiSummary}</ReactMarkdown>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <Card className="relative overflow-hidden p-5" style={{ borderTop: `2px solid ${accent}55` }}>
      <div className="pointer-events-none absolute right-0 top-0 size-24 rounded-full blur-[40px]" style={{ backgroundColor: `${accent}14` }} />
      <div className="relative z-10 flex items-center gap-2 font-mono-data text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {icon} {label}
      </div>
      <div className="relative z-10 mt-3 font-display text-4xl font-extrabold tracking-tight tabular-nums text-foreground">{value}</div>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="mb-4 font-mono-data text-sm font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </Card>
  );
}
