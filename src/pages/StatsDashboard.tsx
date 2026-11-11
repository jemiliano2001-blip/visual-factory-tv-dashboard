import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useOdooOrders } from '../hooks/useOdooOrders';
import {
  getOrderStatus,
  getOrderAgeDays,
  getDeliveryProgress,
  isOrderFullyDelivered,
  parseOdooDate,
  STALE_AGE_DAYS,
  type OdooSaleOrder,
  type OrderStatusLevel,
} from '../services/odoo';
import { getOrderMissingQty } from '../services/pendingItems';
import { fetchOrderAssignments, loadCachedAssignments } from '../services/orderAssignments';
import { getOrderEngineerId, type OrderAssignmentsPayload } from '../../shared/orderAssignments';
import { extractOrderNoteMeta } from '../services/orderNoteParser';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  AlertTriangle, TrendingUp, Clock, Package, WifiOff, Loader2, RefreshCw,
  Users2, Truck, Layers, ArrowUpRight, CheckCircle2, FileSpreadsheet,
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import CompanyBadge from '../components/CompanyBadge';
import TruncatedNotice from '../components/admin/TruncatedNotice';
import { loadErrorLabel } from '../services/orderLoadError';
import { getSmartCompanyName } from '../utils/customerNames';
import { UNASSIGNED_ENGINEER } from '../services/adminFilters';

const AGING_COLORS = ['#10b981', '#f59e0b', '#ef4444'];
const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: '#16161d',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  color: '#f4f4f5',
};
const CHART_CURSOR = { fill: 'rgba(255,255,255,0.04)' };
const AXIS_TICK = { fontSize: 12, fill: '#9ca3af', fontFamily: 'var(--font-sans)' };
const MONO_TICK = { fontSize: 12, fill: '#9ca3af', fontFamily: 'var(--font-mono)' };

export default function StatsDashboard() {
  const { orders, error, isLoading, isFetching, lastUpdated, refetch, truncated } = useOdooOrders();
  const [team, setTeam] = useState<OrderAssignmentsPayload>(loadCachedAssignments);

  useEffect(() => {
    fetchOrderAssignments().then(setTeam).catch(() => {
      // Mantiene caché local si falla la red
    });
  }, []);

  // ── Métricas principales (sin información monetaria) ──────────────────────
  const totalOrders = orders.length;
  const totalClients = useMemo(
    () => new Set(orders.map(o => o.partner_name)).size,
    [orders]
  );

  const totalMissingPieces = useMemo(
    () => orders.reduce((sum, o) => sum + getOrderMissingQty(o), 0),
    [orders]
  );

  const ordersWithPending = useMemo(
    () => orders.filter(o => getOrderMissingQty(o) > 0).length,
    [orders]
  );

  const fullyDeliveredCount = useMemo(
    () => orders.filter(o => isOrderFullyDelivered(o)).length,
    [orders]
  );

  const ordersWithPO = useMemo(
    () => orders.filter(o => extractOrderNoteMeta(o).poNumber !== null).length,
    [orders]
  );

  const statusCounts = useMemo(() => orders.reduce(
    (acc, o) => { acc[getOrderStatus(o).level]++; return acc; },
    { overdue: 0, warning: 0, 'on-time': 0, none: 0 } as Record<OrderStatusLevel, number>
  ), [orders]);

  const overdueCount = statusCounts.overdue;
  const overduePct = totalOrders > 0 ? Math.round((overdueCount / totalOrders) * 100) : 0;

  const deliveryRate = totalOrders > 0
    ? Math.round(orders.reduce((sum, order) => sum + getDeliveryProgress(order), 0) / totalOrders)
    : 0;

  const staleCount = useMemo(() => orders.filter(o => {
    const age = getOrderAgeDays(o);
    return age !== null && age > STALE_AGE_DAYS;
  }).length, [orders]);

  // ── Desglose detallado de urgencia y días de atraso ───────────────────────
  const urgencyBreakdown = useMemo(() => {
    const now = Date.now();
    let late1to7 = 0;
    let late8to30 = 0;
    let lateOver30 = 0;
    for (const o of orders) {
      const status = getOrderStatus(o);
      if (status.level !== 'overdue') continue;
      const due = parseOdooDate(o.commitment_date);
      const daysLate = due ? Math.max(1, Math.floor((now - due.getTime()) / 86_400_000)) : 1;
      if (daysLate <= 7) late1to7++;
      else if (daysLate <= 30) late8to30++;
      else lateOver30++;
    }
    return [
      { key: 'on-time', label: 'En tiempo', count: statusCounts['on-time'], color: 'bg-success', hex: '#10b981', filter: 'on-time' },
      { key: 'warning', label: 'Por vencer (próx. días)', count: statusCounts.warning, color: 'bg-warning', hex: '#f59e0b', filter: 'warning' },
      { key: 'late-7', label: 'Atraso reciente (1–7 días)', count: late1to7, color: 'bg-amber-400', hex: '#fbbf24', filter: 'overdue' },
      { key: 'late-30', label: 'Atraso medio (8–30 días)', count: late8to30, color: 'bg-orange-500', hex: '#f97316', filter: 'overdue' },
      { key: 'late-chronic', label: 'Atraso crítico (> 30 días)', count: lateOver30, color: 'bg-destructive', hex: '#ef4444', filter: 'overdue' },
      { key: 'none', label: 'Sin fecha compromiso', count: statusCounts.none, color: 'bg-muted-foreground', hex: '#71717a', filter: 'none' },
    ];
  }, [orders, statusCounts]);

  // ── Carga por Diseñador / Ingeniero SMV ───────────────────────────────────
  const engineerStats = useMemo(() => {
    const validIds = new Set(team.engineers.map(e => e.id));
    const map = new Map<string, { id: string; name: string; orders: number; missing: number; overdue: number; withPo: number }>();

    for (const eng of team.engineers) {
      map.set(eng.id, { id: eng.id, name: eng.name, orders: 0, missing: 0, overdue: 0, withPo: 0 });
    }
    const unassigned = { id: UNASSIGNED_ENGINEER, name: 'Sin asignar', orders: 0, missing: 0, overdue: 0, withPo: 0 };

    for (const o of orders) {
      const rawId = getOrderEngineerId(team.assignments, o);
      const bucket = rawId && validIds.has(rawId) ? map.get(rawId)! : unassigned;
      bucket.orders += 1;
      bucket.missing += getOrderMissingQty(o);
      if (getOrderStatus(o).level === 'overdue') bucket.overdue += 1;
      if (extractOrderNoteMeta(o).poNumber) bucket.withPo += 1;
    }

    return [...Array.from(map.values()), unassigned];
  }, [orders, team]);

  // ── Top compañías con métricas completas ──────────────────────────────────
  const clientStats = useMemo(() => {
    const byClient = new Map<string, {
      name: string;
      orders: number;
      missing: number;
      overdue: number;
      progressSum: number;
      withPo: number;
    }>();

    for (const o of orders) {
      const cur = byClient.get(o.partner_name) ?? {
        name: o.partner_name,
        orders: 0,
        missing: 0,
        overdue: 0,
        progressSum: 0,
        withPo: 0,
      };
      cur.orders += 1;
      cur.missing += getOrderMissingQty(o);
      if (getOrderStatus(o).level === 'overdue') cur.overdue += 1;
      cur.progressSum += getDeliveryProgress(o);
      if (extractOrderNoteMeta(o).poNumber) cur.withPo += 1;
      byClient.set(o.partner_name, cur);
    }

    return Array.from(byClient.values())
      .map(c => ({
        ...c,
        avgProgress: c.orders > 0 ? Math.round(c.progressSum / c.orders) : 0,
      }))
      .sort((a, b) => b.orders - a.orders || b.missing - a.missing)
      .slice(0, 8);
  }, [orders]);

  // ── Pipeline de remisiones (stock.picking) ────────────────────────────────
  const pipelineData = useMemo(() => {
    const b = { sin: 0, prep: 0, lista: 0, parcial: 0, entregada: 0 };
    orders.forEach((o: OdooSaleOrder) => {
      const active = (o.deliveries ?? []).filter(d => d.state !== 'cancel');
      if (active.length === 0) { b.sin++; return; }
      const done = active.filter(d => d.state === 'done').length;
      if (isOrderFullyDelivered(o)) b.entregada++;
      else if (done > 0) b.parcial++;
      else if (active.some(d => d.state === 'assigned')) b.lista++;
      else b.prep++;
    });
    return [
      { name: 'Sin remisión', value: b.sin, color: '#71717a' },
      { name: 'En preparación', value: b.prep, color: '#f59e0b' },
      { name: 'Lista p/ enviar', value: b.lista, color: '#3b82f6' },
      { name: 'Entrega parcial', value: b.parcial, color: '#22d3ee' },
      { name: 'Entregada 100%', value: b.entregada, color: '#10b981' },
    ];
  }, [orders]);

  // ── Remisiones completadas por semana (últimas 8 semanas) ─────────────────
  const weeklyDeliveries = useMemo(() => {
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
      name: i === 7 ? 'Esta sem.' : `Hace ${7 - i}s`,
      value,
    }));
  }, [orders]);

  // ── Antigüedad desde date_order ───────────────────────────────────────────
  const agingData = useMemo(() => {
    const b = { nueva: 0, media: 0, vieja: 0 };
    orders.forEach(o => {
      const age = getOrderAgeDays(o);
      if (age === null) return;
      if (age < 30) b.nueva++;
      else if (age < 90) b.media++;
      else b.vieja++;
    });
    return [
      { name: 'Menos de 1 mes', value: b.nueva, desc: 'Flujo normal' },
      { name: '1 a 3 meses', value: b.media, desc: 'Seguimiento activo' },
      { name: 'Más de 3 meses', value: b.vieja, desc: 'Riesgo de estancamiento' },
    ];
  }, [orders]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <div className="mx-auto max-w-[1600px] space-y-6 p-5 lg:p-8">
        {/* Cabecera unificada con AdminPanel */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Estadísticas de producción
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Panorama operativo de órdenes por facturar, carga por ingeniero y entregas en Odoo
              {lastUpdated && (
                <>
                  {' '}· actualizado{' '}
                  <span className="font-mono-data tabular-nums">
                    {format(new Date(lastUpdated), 'HH:mm')}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 px-4 text-sm font-semibold rounded-xl"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={isFetching ? 'animate-spin text-primary' : ''} />
              Actualizar
            </Button>
          </div>
        </div>

        {error && !isLoading && (
          <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
            <WifiOff className="size-5 shrink-0" />
            <span className="font-bold">{loadErrorLabel(error)}</span>
          </div>
        )}

        {truncated && <TruncatedNotice />}

        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" /> Cargando estadísticas de Odoo…
          </div>
        ) : (
          <>
            {/* Fila 1: KPIs principales con tipografía unificada (Inter + JetBrains Mono) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                icon={<Package className="size-5 text-primary" />}
                label="Órdenes activas"
                value={totalOrders.toLocaleString('es-MX')}
                detail={`${totalClients} compañías con pedidos abiertos`}
                href="/admin"
              />
              <KpiCard
                icon={<Layers className="size-5 text-data" />}
                label="Piezas pendientes"
                value={totalMissingPieces.toLocaleString('es-MX')}
                detail={`En ${ordersWithPending} órdenes por entregar`}
                href="/admin?vista=pending"
              />
              <KpiCard
                icon={<AlertTriangle className="size-5 text-destructive" />}
                label="Órdenes atrasadas"
                value={overdueCount.toLocaleString('es-MX')}
                detail={`${overduePct}% del total tiene fecha vencida`}
                tone={overdueCount > 0 ? 'text-destructive' : undefined}
                href="/admin?estado=overdue"
              />
              <KpiCard
                icon={<TrendingUp className="size-5 text-success" />}
                label="Avance medio"
                value={`${deliveryRate}%`}
                detail={`${fullyDeliveredCount} entregadas al 100% (por facturar)`}
                href="/admin?tab=deliveries"
              />
              <KpiCard
                icon={<Clock className="size-5 text-warning" />}
                label="Abiertas +30 días"
                value={staleCount.toLocaleString('es-MX')}
                detail={`${ordersWithPO} de ${totalOrders} órdenes tienen PO registrada`}
                href="/admin"
              />
            </div>

            {/* Fila 2: Seguimiento por Ingeniero SMV + Semáforo de Urgencia */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              {/* Carga por Diseñador / Ingeniero SMV */}
              <SectionCard
                className="xl:col-span-7"
                icon={<Users2 className="size-5 text-primary" />}
                title="Carga de seguimiento por diseñador / ingeniero SMV"
                subtitle="Órdenes asignadas, piezas faltantes y atrasos por responsable. Haz clic en un ingeniero para abrir su apartado."
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border text-xs font-medium text-muted-foreground">
                      <tr>
                        <th className="py-2.5 pr-3 font-medium">Ingeniero / Diseñador</th>
                        <th className="px-3 py-2.5 text-right font-medium">Órdenes</th>
                        <th className="px-3 py-2.5 text-right font-medium">Con PO</th>
                        <th className="px-3 py-2.5 text-right font-medium">Pzas pendientes</th>
                        <th className="px-3 py-2.5 text-right font-medium">Atrasadas</th>
                        <th className="py-2.5 pl-3 text-right font-medium">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {engineerStats.map(eng => {
                        const pct = totalOrders > 0 ? Math.round((eng.orders / totalOrders) * 100) : 0;
                        const isUnassigned = eng.id === UNASSIGNED_ENGINEER;
                        return (
                          <tr key={eng.id} className="transition-colors hover:bg-accent/40">
                            <td className="py-3 pr-3">
                              <div className="flex items-center gap-2.5">
                                <span className={`font-semibold ${isUnassigned ? 'text-muted-foreground' : 'text-foreground'}`}>
                                  {eng.name}
                                </span>
                                <span className="font-mono-data text-xs tabular-nums text-muted-foreground">
                                  ({pct}%)
                                </span>
                              </div>
                              <div className="mt-1.5 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full rounded-full ${isUnassigned ? 'bg-muted-foreground/50' : 'bg-primary'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right font-mono-data text-sm font-bold tabular-nums text-foreground">
                              {eng.orders}
                            </td>
                            <td className="px-3 py-3 text-right font-mono-data text-sm tabular-nums text-data">
                              {eng.withPo}
                            </td>
                            <td className="px-3 py-3 text-right font-mono-data text-sm font-semibold tabular-nums text-primary">
                              {eng.missing.toLocaleString('es-MX')}
                            </td>
                            <td className="px-3 py-3 text-right">
                              {eng.overdue > 0 ? (
                                <Badge variant="danger" className="font-mono-data tabular-nums">
                                  {eng.overdue}
                                </Badge>
                              ) : (
                                <span className="font-mono-data text-xs tabular-nums text-muted-foreground">0</span>
                              )}
                            </td>
                            <td className="py-3 pl-3 text-right">
                              <Link
                                to={`/admin?ing=${encodeURIComponent(eng.id)}`}
                                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
                              >
                                Ver SO/PO <ArrowUpRight className="size-3.5" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              {/* Semáforo de Urgencia y Compromiso */}
              <SectionCard
                className="xl:col-span-5"
                icon={<AlertTriangle className="size-5 text-warning" />}
                title="Semáforo de urgencia y atraso"
                subtitle="Distribución de las órdenes según su fecha compromiso en Odoo."
              >
                {/* Barra proporcional apilada */}
                {totalOrders > 0 && (
                  <div className="mb-5 flex h-3 w-full overflow-hidden rounded-full bg-muted">
                    {urgencyBreakdown.map(item => {
                      if (item.count === 0) return null;
                      const widthPct = (item.count / totalOrders) * 100;
                      return (
                        <div
                          key={item.key}
                          className={item.color}
                          style={{ width: `${widthPct}%` }}
                          title={`${item.label}: ${item.count}`}
                        />
                      );
                    })}
                  </div>
                )}

                <div className="space-y-2.5">
                  {urgencyBreakdown.map(item => {
                    const pct = totalOrders > 0 ? Math.round((item.count / totalOrders) * 100) : 0;
                    return (
                      <Link
                        key={item.key}
                        to={`/admin?estado=${item.filter}`}
                        className="flex items-center justify-between rounded-xl border border-border bg-background/50 px-3.5 py-2.5 transition-colors hover:bg-accent/40"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`size-3 shrink-0 rounded-full ${item.color}`} />
                          <span className="text-sm font-medium text-foreground">{item.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono-data text-xs tabular-nums text-muted-foreground">
                            {pct}%
                          </span>
                          <span className="min-w-[36px] text-right font-mono-data text-sm font-bold tabular-nums text-foreground">
                            {item.count}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </SectionCard>
            </div>

            {/* Fila 3: Top Compañías con detalle de órdenes, PO, piezas pendientes y avance */}
            <SectionCard
              icon={<FileSpreadsheet className="size-5 text-data" />}
              title="Compañías con mayor carga activa"
              subtitle="Comparativa de órdenes abiertas, cobertura de PO, piezas pendientes por fabricar/entregar y porcentaje de avance."
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
                {clientStats.map(client => (
                  <Link
                    key={client.name}
                    to={`/admin?cliente=${encodeURIComponent(client.name)}`}
                    className="group flex flex-col justify-between rounded-2xl border border-border bg-background/40 p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CompanyBadge company={client.name} size="sm" />
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-bold text-foreground group-hover:text-primary">
                              {getSmartCompanyName(client.name, 'card')}
                            </h4>
                            <p className="truncate text-xs text-muted-foreground">{client.name}</p>
                          </div>
                        </div>
                        <span className="font-mono-data text-lg font-bold tabular-nums text-foreground">
                          {client.orders}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-card p-2.5 text-center border border-border">
                        <div>
                          <div className="text-xs text-muted-foreground">Pendientes</div>
                          <div className="mt-0.5 font-mono-data text-sm font-bold tabular-nums text-primary">
                            {client.missing.toLocaleString('es-MX')}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Con PO</div>
                          <div className="mt-0.5 font-mono-data text-sm font-bold tabular-nums text-data">
                            {client.withPo}/{client.orders}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Atrasadas</div>
                          <div className={`mt-0.5 font-mono-data text-sm font-bold tabular-nums ${client.overdue > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {client.overdue}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>Avance de entrega</span>
                        <span className="font-mono-data font-semibold tabular-nums text-foreground">{client.avgProgress}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${client.avgProgress >= 100 ? 'bg-success' : 'bg-primary'}`}
                          style={{ width: `${client.avgProgress}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </SectionCard>

            {/* Fila 4: Estado de Remisiones + Ritmo Semanal + Antigüedad */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <SectionCard
                icon={<Truck className="size-5 text-info" />}
                title="Estado de remisiones (almacén)"
                subtitle="Progreso físico de entregas según transferencias en Odoo."
              >
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={pipelineData} layout="vertical" margin={{ left: 10, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                    <XAxis type="number" stroke="#71717a" allowDecimals={false} tick={MONO_TICK} />
                    <YAxis type="category" dataKey="name" stroke="#71717a" width={115} tick={AXIS_TICK} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={CHART_CURSOR} />
                    <Bar dataKey="value" name="Órdenes" radius={[0, 8, 8, 0]}>
                      {pipelineData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>

              <SectionCard
                icon={<CheckCircle2 className="size-5 text-success" />}
                title="Remisiones entregadas por semana"
                subtitle="Entregas completadas en las últimas 8 semanas (órdenes activas)."
              >
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={weeklyDeliveries} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="name" stroke="#71717a" tick={AXIS_TICK} />
                    <YAxis stroke="#71717a" allowDecimals={false} tick={MONO_TICK} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={CHART_CURSOR} />
                    <Bar dataKey="value" name="Remisiones" fill="#10b981" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>

              <SectionCard
                icon={<Clock className="size-5 text-warning" />}
                title="Antigüedad de órdenes abiertas"
                subtitle="Tiempo transcurrido desde la creación de la SO en Odoo."
              >
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={agingData} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="name" stroke="#71717a" tick={AXIS_TICK} />
                    <YAxis stroke="#71717a" allowDecimals={false} tick={MONO_TICK} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={CHART_CURSOR} />
                    <Bar dataKey="value" name="Órdenes" radius={[8, 8, 0, 0]}>
                      {agingData.map((_, i) => <Cell key={i} fill={AGING_COLORS[i % AGING_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon, label, value, detail, tone, href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: string;
  href: string;
}) {
  return (
    <Link to={href} className="group block">
      <Card className="flex h-full flex-col justify-between p-5 transition-colors hover:border-primary/40 hover:bg-accent/20">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <div className="rounded-xl bg-secondary p-2">{icon}</div>
        </div>
        <div className="mt-3">
          <div className={`font-mono-data text-3xl font-bold tracking-tight tabular-nums ${tone ?? 'text-foreground'}`}>
            {value}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
      </Card>
    </Link>
  );
}

function SectionCard({
  icon, title, subtitle, className, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`p-5 ${className ?? ''}`}>
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-secondary p-2 shrink-0">{icon}</div>
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}
