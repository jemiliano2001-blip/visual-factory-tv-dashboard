# Admin como Consola Odoo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescribir el panel de admin como consola read-only de órdenes Odoo, re-apuntar Stats a Odoo, y eliminar el CRUD de Firestore (`work_orders`).

**Architecture:** Un hook compartido `useOdooOrders()` (React Query) alimenta TV, Admin y Stats desde el proxy Express existente, que se extiende para incluir las líneas de producto en su respuesta. Las funciones de IA se re-tipan de `WorkOrder` (Firestore) a `OdooSaleOrder`. Firestore queda solo para auth y `company_configs` (la TV la usa para horarios).

**Tech Stack:** React 18 + TypeScript, Vite, @tanstack/react-query, @tanstack/react-table, recharts, @google/genai, xlsx-js-style, Express (proxy Odoo), Firebase (auth + Firestore `company_configs`).

**⚠️ Sin tests:** este repo no tiene test runner (decisión registrada en CLAUDE.md: `npm run lint` = `tsc --noEmit` es el ÚNICO gate). Los pasos de "test" de cada task son: (1) `npm run lint` debe pasar, (2) verificación manual indicada. NO agregues un test runner.

**Spec:** `docs/superpowers/specs/2026-06-12-admin-odoo-console-design.md`

**Orden de tasks:** diseñado para que el proyecto COMPILE tras cada commit. Los tipos `WorkOrder` viejos no se borran hasta la Task 9, cuando ya no hay consumidores.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `server.ts` | Modificar | Incluir `lines` en la respuesta de `/api/odoo/invoiceable-orders` |
| `src/services/odoo.ts` | Modificar | Tipo `OdooOrderLine` + campo `lines` en `OdooSaleOrder` |
| `src/hooks/useOdooOrders.ts` | Crear | Hook React Query compartido (TV, Admin, Stats) |
| `src/services/ai.ts` | Modificar | Re-tipar funciones a `OdooSaleOrder`; borrar `extractOrdersFromFile`, `analyzeImage`, `generateVisualAid` |
| `src/components/admin/AIModal.tsx` | Crear | Modal markdown para resultados de IA |
| `src/components/admin/ConfigTab.tsx` | Crear | CRUD de `company_configs` (extraído del AdminPanel viejo) |
| `src/components/admin/OrdersTable.tsx` | Crear | Tabla TanStack con sorting + filas expandibles |
| `src/pages/AdminPanel.tsx` | Reescribir | Composición: tabs, búsqueda, filtros, export, acciones IA |
| `src/pages/StatsDashboard.tsx` | Reescribir | Métricas y gráficas sobre datos Odoo |
| `src/pages/TVDashboard.tsx` | Modificar | Usar hook; quitar adaptación manual para voz |
| `src/types.ts` | Modificar | Borrar `WorkOrder`, `WorkOrderHistory`, `ActionType`, `Priority`, `Status` |
| `src/services/workOrders.ts` | **Borrar** | Servicio CRUD Firestore muerto |
| `firestore.rules` | Modificar | Cerrar `work_orders` y `work_orders_history` |
| `CLAUDE.md` | Modificar | Reflejar la nueva arquitectura |

---

### Task 1: Proxy expone líneas de producto + tipo `OdooOrderLine`

**Files:**
- Modify: `server.ts` (función de normalización, ~línea 388-404)
- Modify: `src/services/odoo.ts` (tipos, ~línea 15-45)
- Modify: `src/types.ts` (re-export, línea 51)

- [ ] **Step 1: Agregar `lines` a la respuesta normalizada en `server.ts`**

En `server.ts`, dentro del handler de `/api/odoo/invoiceable-orders`, el bloque `const normalized = orders.map(...)` termina así (busca `lines_count`):

```ts
        state:           order.state,
        salesperson:     order.user_id ? order.user_id[1] : null,
        lines_count:     lines.length,
      };
    });
```

Reemplázalo por:

```ts
        state:           order.state,
        salesperson:     order.user_id ? order.user_id[1] : null,
        lines_count:     lines.length,
        // Detalle de líneas para la consola admin; la TV ignora este campo.
        lines: lines.map(l => ({
          name:       l.name,
          qty:        l.product_uom_qty,
          delivered:  l.qty_delivered,
          price_unit: l.price_unit,
          subtotal:   l.price_subtotal,
        })),
      };
    });
```

(`lines` ya existe en ese scope: es el array filtrado de `OdooOrderLine` del paso 3 del handler. No hay RPC adicional.)

- [ ] **Step 2: Tipar `OdooOrderLine` y `lines` en `src/services/odoo.ts`**

Justo antes de `export interface OdooSaleOrder`, agrega:

```ts
export interface OdooOrderLine {
  /** Descripción del producto */
  name: string;
  /** Cantidad pedida (product_uom_qty) */
  qty: number;
  /** Cantidad entregada */
  delivered: number;
  /** Precio unitario */
  price_unit: number;
  /** Subtotal de la línea (sin impuestos) */
  subtotal: number;
}
```

Y dentro de `OdooSaleOrder`, después de `lines_count: number;`, agrega:

```ts
  /** Detalle de líneas de producto (para la consola admin) */
  lines: OdooOrderLine[];
}
```

- [ ] **Step 3: Re-exportar el tipo en `src/types.ts`**

Cambia la línea de re-export:

```ts
export type { OdooSaleOrder, OdooConnectionStatus, OdooOrdersResponse } from './services/odoo';
```

por:

```ts
export type { OdooSaleOrder, OdooOrderLine, OdooConnectionStatus, OdooOrdersResponse } from './services/odoo';
```

- [ ] **Step 4: Verificar compilación**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 5: Verificación manual del endpoint (si el proxy está corriendo)**

Con `npm run server` activo en otra terminal:

Run (PowerShell): `(Invoke-RestMethod http://localhost:3001/api/odoo/invoiceable-orders).orders[0].lines | Select-Object -First 2`
Expected: objetos con `name, qty, delivered, price_unit, subtotal`. Si el proxy no está corriendo, omite este paso (lint es el gate).

- [ ] **Step 6: Commit**

```bash
git add server.ts src/services/odoo.ts src/types.ts
git commit -m "feat(proxy): incluir lineas de producto en invoiceable-orders"
```

---

### Task 2: Hook compartido `useOdooOrders` + TV lo consume

**Files:**
- Create: `src/hooks/useOdooOrders.ts`
- Modify: `src/pages/TVDashboard.tsx:99-123`

- [ ] **Step 1: Crear `src/hooks/useOdooOrders.ts`**

```ts
/**
 * src/hooks/useOdooOrders.ts
 * Hook compartido (TV, Admin, Stats) para las órdenes por facturar de Odoo.
 * Las tres páginas usan la misma queryKey, así que comparten UNA petición
 * y UNA caché de React Query.
 */
import { useQuery } from '@tanstack/react-query';
import { checkOdooStatus, fetchInvoiceableOrders } from '../services/odoo';

export function useOdooOrders() {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['odooData'],
    queryFn: async () => {
      const [statusRes, ordersRes] = await Promise.all([
        checkOdooStatus(),
        fetchInvoiceableOrders(),
      ]);
      return { statusRes, ordersRes };
    },
    refetchInterval: 5 * 60 * 1000,
  });

  return {
    status: data?.statusRes ?? null,
    orders: data?.ordersRes.orders ?? [],
    lastUpdated: data?.ordersRes.lastUpdated ?? null,
    error: error ? (error as Error).message : data?.ordersRes.error ?? null,
    isLoading,
    isFetching,
    refetch,
  };
}
```

- [ ] **Step 2: Reemplazar el bloque useQuery en `TVDashboard.tsx`**

Busca el bloque (líneas ~99-123):

```ts
  // ── Odoo state (React Query) ─────────────────────────────────────────────────
  const { 
    data: odooData, 
    isLoading: isLoadingOdoo, 
    isFetching: isRefreshing, 
    error: queryError,
    refetch
  } = useQuery({
    queryKey: ['odooData'],
    queryFn: async () => {
      const [statusRes, ordersRes] = await Promise.all([
        checkOdooStatus(),
        fetchInvoiceableOrders(),
      ]);
      return { statusRes, ordersRes };
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const odooStatus = odooData?.statusRes || null;
  const odooOrders = odooData?.ordersRes.orders || [];
  const odooLastUpdated = odooData?.ordersRes.lastUpdated || null;
  const odooError = queryError ? (queryError as Error).message : odooData?.ordersRes.error || null;

  const loadOdooOrders = () => refetch();
```

Reemplázalo por:

```ts
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
```

- [ ] **Step 3: Ajustar imports de `TVDashboard.tsx`**

Agrega al inicio del archivo:

```ts
import { useOdooOrders } from '../hooks/useOdooOrders';
```

Quita `useQuery` del import de `@tanstack/react-query` (elimina la línea entera si queda vacía). En el import de `../services/odoo`, quita `checkOdooStatus` y `fetchInvoiceableOrders` (conserva `parseOdooDate`, `getOrderPriority`, `isOrderOverdue`, `getDeliveryProgress`, `OdooSaleOrder` y lo demás que se siga usando).

- [ ] **Step 4: Verificar**

Run: `npm run lint`
Expected: sin errores.

Verificación manual: con `npm run dev:full` corriendo, abre http://localhost:3000 — la TV debe verse idéntica (órdenes, logos, horarios, refresco).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useOdooOrders.ts src/pages/TVDashboard.tsx
git commit -m "refactor(tv): extraer useOdooOrders como hook compartido"
```

---

### Task 3: Re-tipar `processVoiceCommand` a `OdooSaleOrder`

**Files:**
- Modify: `src/services/ai.ts:84-130` (función `processVoiceCommand`)
- Modify: `src/pages/TVDashboard.tsx:322-336` (quitar `adaptedOrders`)

- [ ] **Step 1: Re-tipar `processVoiceCommand` en `ai.ts`**

Agrega este import al inicio de `ai.ts` (junto a los existentes — NO borres todavía el import de `WorkOrder`; otras funciones aún lo usan):

```ts
import { OdooSaleOrder, getOrderPriority, isOrderOverdue, parseOdooDate } from './odoo';
```

Reemplaza la función `processVoiceCommand` completa por:

```ts
export const processVoiceCommand = async (audioBase64: string, mimeType: string, activeOrders: OdooSaleOrder[]) => {
  const simplifiedOrders = activeOrders.map(o => ({
    po: formatPONumber(o.name),
    client: o.partner_name,
    part: o.main_product,
    priority: getOrderPriority(o),
    progress: `${o.qty_delivered}/${o.qty_total}`,
    fecha_creacion: parseOdooDate(o.date_order)?.toISOString().split('T')[0] ?? null,
    fecha_promesa: parseOdooDate(o.commitment_date)?.toISOString().split('T')[0] ?? null,
    vencida: isOrderOverdue(o) ? 'SÍ' : 'NO'
  }));

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: {
      parts: [
        { inlineData: { data: audioBase64, mimeType } },
        { text: `Listen to the audio command in SPANISH. The user is a factory operator talking to you, their AI assistant. They might ask to highlight/find a specific order, complete/send an order, filter the view, or ask a general question about the active orders. Active orders data: ${JSON.stringify(simplifiedOrders)}. Return a JSON object with 'po_number' (the matched PO exactly as it appears, or null), 'action' ('highlight', 'complete', 'filter', or 'answer'), 'filter_type' ('all', 'overdue', 'delivered', 'pending', or null), and 'message' (a natural, helpful, conversational response in SPANISH to speak back to the user). 

IMPORTANT INSTRUCTIONS:
1. DELAY LOGIC: Use 'fecha_promesa' (commitment/delivery date) and 'vencida' to determine if an order is delayed/vencida. If the user asks for the oldest or most delayed order, find the one with the oldest 'fecha_promesa' or 'fecha_creacion' that is incomplete. Do NOT rely just on the PO number.
2. FILTER ACTION: If the user says "muéstrame las vencidas", "filtra las entregadas", "cuáles están pendientes", etc., return action="filter" and set 'filter_type' to 'overdue', 'delivered', or 'pending' accordingly. If they say "limpia el filtro" or "muestra todas", set to 'all'.
3. PO FORMATTING NOTE: Some POs might look like "546" or "5460" (4 digits) but should be interpreted as part of the sequence. The standard format is "2026/S00546" (5 digits padded with zeros).
4. If the user asks for a "critical" or "high priority" order, look for 'critical' or 'high' priority.
5. If you find a specific order, mention its PO number in the 'message'.
6. Keep the 'message' very short, direct, and concise to ensure fast processing.` }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          po_number: { type: Type.STRING, description: "The PO number to highlight or complete, if applicable" },
          action: { type: Type.STRING, description: "The action: 'highlight', 'complete', 'filter', or 'answer'" },
          filter_type: { type: Type.STRING, description: "If action is filter: 'all', 'overdue', 'delivered', 'pending'" },
          message: { type: Type.STRING, description: "Conversational response in Spanish to speak to the user" }
        }
      }
    }
  });
  return JSON.parse(response.text || '{"po_number": null, "action": "answer", "message": "No pude entender el comando."}');
};
```

(Único cambio real: el parámetro y el mapeo `simplifiedOrders`; prompt y schema idénticos al original. Se quita el campo `status` del simplificado — en Odoo no existe estado de producción.)

- [ ] **Step 2: Quitar `adaptedOrders` en `TVDashboard.tsx`**

En el handler `mediaRecorder.onstop` (dentro de `toggleRecording`), reemplaza:

```ts
              const adaptedOrders = odooOrders.map(o => ({
                id: String(o.id),
                po_number: o.name,
                company_name: o.partner_name,
                part_name: o.main_product,
                quantity_total: o.qty_total || 1,
                quantity_completed: o.qty_delivered || 0,
                priority: getOrderPriority(o),
                status: 'production' as const,
                createdAt: parseOdooDate(o.date_order) ?? new Date(),
                delivery_date: parseOdooDate(o.commitment_date) ?? undefined,
                updatedAt: new Date(),
              }));
              const result = await processVoiceCommand(base64data, 'audio/webm', adaptedOrders);
```

por:

```ts
              const result = await processVoiceCommand(base64data, 'audio/webm', odooOrders);
```

- [ ] **Step 3: Verificar**

Run: `npm run lint`
Expected: sin errores.

Verificación manual (opcional, requiere micrófono): en la TV, botón de voz → "muéstrame las vencidas" → debe filtrar y responder con voz.

- [ ] **Step 4: Commit**

```bash
git add src/services/ai.ts src/pages/TVDashboard.tsx
git commit -m "refactor(ai): processVoiceCommand acepta OdooSaleOrder directamente"
```

---

### Task 4: `generateShiftSummary` re-tipado + reescritura de StatsDashboard

**Files:**
- Modify: `src/services/ai.ts:8-14` (función `generateShiftSummary` + helper nuevo)
- Rewrite: `src/pages/StatsDashboard.tsx`

- [ ] **Step 1: Agregar helper `simplifyOrder` y re-tipar `generateShiftSummary` en `ai.ts`**

Amplía el import de odoo en `ai.ts` para incluir `getDeliveryProgress`:

```ts
import { OdooSaleOrder, getOrderPriority, isOrderOverdue, getDeliveryProgress, parseOdooDate } from './odoo';
```

Después de `const ai = new GoogleGenAI(...)`, agrega:

```ts
/** Proyección compacta de una orden Odoo para prompts (menos tokens, campos en español). */
const simplifyOrder = (o: OdooSaleOrder) => ({
  so: o.name,
  cliente: o.partner_name,
  producto: o.main_product,
  monto: o.amount_total,
  moneda: o.currency,
  avance_entrega: `${o.qty_delivered}/${o.qty_total}`,
  porcentaje_entrega: getDeliveryProgress(o),
  fecha_orden: parseOdooDate(o.date_order)?.toISOString().split('T')[0] ?? null,
  fecha_compromiso: parseOdooDate(o.commitment_date)?.toISOString().split('T')[0] ?? null,
  vencida: isOrderOverdue(o) ? 'SÍ' : 'NO',
  prioridad: getOrderPriority(o),
  vendedor: o.salesperson,
});
```

Reemplaza `generateShiftSummary` completa por:

```ts
export const generateShiftSummary = async (orders: OdooSaleOrder[]) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: `You are a manufacturing plant manager. Analyze the following Odoo sale orders pending invoicing and provide a brief executive summary of the current state: highlight overdue orders, clients with the largest backlog, total pending amount, and overall delivery progress. Use markdown. RESPOND IN SPANISH.\n\nOrders: ${JSON.stringify(orders.map(simplifyOrder))}`,
  });
  return response.text;
};
```

- [ ] **Step 2: Reescribir `src/pages/StatsDashboard.tsx`**

Reemplaza el archivo COMPLETO por:

```tsx
import { useState } from 'react';
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
                  <XAxis type="number" stroke="#71717a" tickFormatter={v => formatCurrency(Number(v), currency)} />
                  <YAxis type="category" dataKey="name" stroke="#71717a" width={140} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v, currency)}
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
```

(Nota: `React` se usa solo en tipos `React.ReactNode`; con `jsx: react-jsx` no hace falta importarlo, pero el namespace de tipos sí — agrega `import type React from 'react';` si tsc se queja; con la config actual `import { useState } from 'react'` + uso de `React.ReactNode` requiere `import React, { useState } from 'react';` — usa esa forma.)

- [ ] **Step 3: Verificar**

Run: `npm run lint`
Expected: sin errores.

Verificación manual: con `npm run dev:full`, entra a http://localhost:3000/stats (requiere login Google) — tarjetas y gráficas con datos de Odoo; "Generar resumen" produce markdown en español.

- [ ] **Step 4: Commit**

```bash
git add src/services/ai.ts src/pages/StatsDashboard.tsx
git commit -m "feat(stats): re-apuntar StatsDashboard a ordenes de Odoo"
```

---

### Task 5: Componente `AIModal`

**Files:**
- Create: `src/components/admin/AIModal.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
/**
 * Modal para mostrar resultados de IA (reportes, análisis) en markdown.
 * content === null significa "cargando".
 */
import ReactMarkdown from 'react-markdown';
import { X, Loader2 } from 'lucide-react';

interface AIModalProps {
  title: string;
  content: string | null;
  onClose: () => void;
}

export default function AIModal({ title, content, onClose }: AIModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-white/10 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
        {content === null ? (
          <div className="flex items-center justify-center gap-3 text-zinc-400 py-10">
            <Loader2 className="w-5 h-5 animate-spin" /> Generando…
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar y commit**

Run: `npm run lint`
Expected: sin errores.

```bash
git add src/components/admin/AIModal.tsx
git commit -m "feat(admin): componente AIModal para resultados de IA"
```

---

### Task 6: Componente `ConfigTab` (CRUD de company_configs extraído)

**Files:**
- Create: `src/components/admin/ConfigTab.tsx`

La lógica se extrae del AdminPanel viejo (estado + handlers + JSX de la pestaña config y su modal, líneas ~60-64, 289-328, 830-1065). El comportamiento es idéntico; la TV depende de estos datos para mostrar horarios.

- [ ] **Step 1: Crear el componente**

```tsx
/**
 * CRUD de horarios de entrega por cliente (colección company_configs).
 * La TV lee esta colección para mostrar "Horario: ..." en sus tarjetas.
 */
import React, { useEffect, useState } from 'react';
import { CompanyConfig } from '../../types';
import {
  subscribeToCompanyConfigs, createCompanyConfig,
  updateCompanyConfig, deleteCompanyConfig
} from '../../services/companyConfigs';
import { Plus, Edit2, Trash2, X, Clock } from 'lucide-react';

interface ConfigTabProps {
  /** Nombres de cliente únicos (de las órdenes Odoo) para el selector */
  companyNames: string[];
}

export default function ConfigTab({ companyNames }: ConfigTabProps) {
  const [configs, setConfigs] = useState<CompanyConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyConfig | null>(null);
  const [formData, setFormData] = useState<Partial<CompanyConfig>>({});

  useEffect(() => {
    const unsub = subscribeToCompanyConfigs(setConfigs);
    return () => unsub();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_name || !formData.delivery_schedule) return;
    try {
      const cleanData = {
        company_name: formData.company_name,
        delivery_schedule: formData.delivery_schedule,
      };
      if (editing?.id) {
        await updateCompanyConfig(editing.id, cleanData);
      } else {
        await createCompanyConfig(cleanData);
      }
      setIsModalOpen(false);
      setEditing(null);
      setFormData({});
    } catch (error) {
      console.error('Error guardando configuración', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCompanyConfig(id);
    } catch (error) {
      console.error('Error eliminando configuración', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" /> Horarios de Entrega
          </h3>
          <p className="text-zinc-500 text-sm">Configuración por empresa — visible en la TV</p>
        </div>
        <button
          onClick={() => { setEditing(null); setFormData({}); setIsModalOpen(true); }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nuevo horario
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {configs.length === 0 ? (
          <p className="text-zinc-500 col-span-full text-center py-8">No hay horarios configurados</p>
        ) : (
          configs.map(config => (
            <div key={config.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 group hover:border-blue-500/30 transition-all">
              <div className="flex items-start justify-between">
                <h4 className="font-bold text-white">{config.company_name}</h4>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setEditing(config); setFormData(config); setIsModalOpen(true); }}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(config.id!)}
                    className="p-1.5 hover:bg-red-500/20 rounded-lg text-zinc-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-zinc-400 mt-2">{config.delivery_schedule}</p>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-zinc-900 border border-white/10 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">{editing ? 'Editar Horario' : 'Nuevo Horario'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-zinc-400 mb-2">Empresa</label>
                <select
                  value={formData.company_name || ''}
                  onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                  required
                >
                  <option value="" disabled>Selecciona una empresa</option>
                  {editing && !companyNames.includes(editing.company_name) && (
                    <option value={editing.company_name}>{editing.company_name}</option>
                  )}
                  {companyNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-400 mb-2">Horario de entrega</label>
                <input
                  type="text"
                  placeholder="Lunes a Viernes: 08:00 - 17:00"
                  value={formData.delivery_schedule || ''}
                  onChange={e => setFormData({ ...formData, delivery_schedule: e.target.value })}
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-sm transition-colors"
                >
                  {editing ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar y commit**

Run: `npm run lint`
Expected: sin errores.

```bash
git add src/components/admin/ConfigTab.tsx
git commit -m "feat(admin): extraer ConfigTab (CRUD de horarios de entrega)"
```

---

### Task 7: Componente `OrdersTable`

**Files:**
- Create: `src/components/admin/OrdersTable.tsx`

Tabla TanStack con sorting y filas expandibles (líneas de producto + predicción de riesgo + acciones IA por orden). Recibe los handlers de IA por props — el componente compila y se prueba antes de que existan las funciones re-tipadas (Task 8) porque solo conoce las firmas vía props.

Nota de tipo: `RiskPrediction` se define en este task dentro del componente NO — se define en `src/services/ai.ts` en el **Task 8**. Para que este task compile de forma independiente, el tipo se declara aquí en un archivo propio y el Task 8 lo importa desde aquí.

- [ ] **Step 1: Crear `src/components/admin/riskTypes.ts`**

```ts
/** Resultado de predicción de riesgo por IA (efímero — no se persiste). */
export interface RiskPrediction {
  risk_level: 'low' | 'medium' | 'high';
  issue: string;
  suggestion: string;
  analyzedAt: Date;
}
```

- [ ] **Step 2: Crear `src/components/admin/OrdersTable.tsx`**

```tsx
/**
 * Tabla read-only de órdenes Odoo para la consola admin.
 * Sorting por columna y filas expandibles con líneas de producto.
 */
import React, { useMemo, useState } from 'react';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getExpandedRowModel,
  flexRender, createColumnHelper, SortingState, ExpandedState,
} from '@tanstack/react-table';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight, Mail, Activity, Loader2, AlertTriangle } from 'lucide-react';
import {
  OdooSaleOrder, parseOdooDate, getOrderPriority, isOrderOverdue,
  getDeliveryProgress, formatCurrency,
} from '../../services/odoo';
import { RiskPrediction } from './riskTypes';

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-emerald-500/10 text-emerald-400',
  normal: 'bg-blue-500/10 text-blue-400',
  high: 'bg-amber-500/10 text-amber-400',
  critical: 'bg-red-500/10 text-red-400',
};
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja', normal: 'Normal', high: 'Alta', critical: 'Crítica',
};
const RISK_STYLES: Record<string, string> = {
  low: 'text-emerald-400', medium: 'text-amber-400', high: 'text-red-400',
};
const RISK_LABELS: Record<string, string> = {
  low: 'Bajo', medium: 'Medio', high: 'Alto',
};

interface OrdersTableProps {
  orders: OdooSaleOrder[];
  /** Predicciones por id de orden; 'loading' mientras la IA trabaja */
  predictions: Record<number, RiskPrediction | 'loading'>;
  onClientReport: (order: OdooSaleOrder) => void;
  onPredictRisk: (order: OdooSaleOrder) => void;
}

const columnHelper = createColumnHelper<OdooSaleOrder>();

export default function OrdersTable({ orders, predictions, onClientReport, onPredictRisk }: OrdersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'commitment_date', desc: false }]);
  const [expanded, setExpanded] = useState<ExpandedState>({});

  const columns = useMemo(() => [
    columnHelper.display({
      id: 'expander',
      header: () => null,
      cell: ({ row }) => (
        <button onClick={row.getToggleExpandedHandler()} className="p-1 text-zinc-400 hover:text-white">
          {row.getIsExpanded() ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      ),
    }),
    columnHelper.accessor('date_order', {
      id: 'date_order',
      header: 'Fecha Orden',
      cell: info => {
        const d = parseOdooDate(info.getValue());
        return <span className="text-zinc-400 text-xs">{d ? format(d, 'dd/MM/yyyy') : '—'}</span>;
      },
    }),
    columnHelper.accessor('commitment_date', {
      id: 'commitment_date',
      header: 'Compromiso',
      cell: ({ row }) => {
        const d = parseOdooDate(row.original.commitment_date);
        const overdue = isOrderOverdue(row.original);
        return (
          <span className={`text-xs ${overdue ? 'text-red-400 font-bold' : 'text-zinc-400'}`}>
            {d ? format(d, 'dd/MM/yyyy') : 'Sin fecha'}
            {overdue && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-red-500/10 text-[10px] uppercase">Vencida</span>}
          </span>
        );
      },
      sortingFn: (a, b) =>
        (parseOdooDate(a.original.commitment_date)?.getTime() ?? Infinity) -
        (parseOdooDate(b.original.commitment_date)?.getTime() ?? Infinity),
    }),
    columnHelper.accessor('name', {
      id: 'name',
      header: 'SO',
      cell: info => <span className="font-mono font-bold text-white text-sm">{info.getValue()}</span>,
    }),
    columnHelper.accessor('partner_name', {
      id: 'partner_name',
      header: 'Cliente',
      cell: info => <span className="text-sm text-zinc-300">{info.getValue()}</span>,
    }),
    columnHelper.accessor('main_product', {
      id: 'main_product',
      header: 'Producto',
      cell: info => <span className="text-sm text-zinc-400 line-clamp-1 max-w-[260px]">{info.getValue()}</span>,
    }),
    columnHelper.display({
      id: 'progress',
      header: 'Entrega',
      cell: ({ row }) => {
        const pct = getDeliveryProgress(row.original);
        return (
          <div className="min-w-[100px]">
            <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
              <span>{row.original.qty_delivered}/{row.original.qty_total}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor('amount_total', {
      id: 'amount_total',
      header: 'Monto',
      cell: ({ row }) => (
        <span className="text-sm font-bold text-white">
          {formatCurrency(row.original.amount_total, row.original.currency)}
        </span>
      ),
    }),
    columnHelper.accessor('salesperson', {
      id: 'salesperson',
      header: 'Vendedor',
      cell: info => <span className="text-xs text-zinc-500">{info.getValue() || '—'}</span>,
    }),
    columnHelper.display({
      id: 'priority',
      header: 'Prioridad',
      cell: ({ row }) => {
        const p = getOrderPriority(row.original);
        return (
          <span className={`px-2 py-1 rounded-lg text-[11px] font-bold uppercase ${PRIORITY_STYLES[p]}`}>
            {PRIORITY_LABELS[p]}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: 'IA',
      cell: ({ row }) => {
        const pred = predictions[row.original.id];
        return (
          <div className="flex gap-1">
            <button
              onClick={() => onClientReport(row.original)}
              title="Generar reporte para el cliente"
              className="p-1.5 hover:bg-purple-500/20 rounded-lg text-zinc-400 hover:text-purple-400 transition-colors"
            >
              <Mail className="w-4 h-4" />
            </button>
            <button
              onClick={() => onPredictRisk(row.original)}
              disabled={pred === 'loading'}
              title="Predecir riesgo de retraso"
              className="p-1.5 hover:bg-amber-500/20 rounded-lg text-zinc-400 hover:text-amber-400 transition-colors disabled:opacity-50"
            >
              {pred === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            </button>
          </div>
        );
      },
    }),
  ], [predictions, onClientReport, onPredictRisk]);

  const table = useReactTable({
    data: orders,
    columns,
    state: { sorting, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    getRowId: row => String(row.id),
  });

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-white/5 text-zinc-400 text-xs uppercase tracking-wide">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    className={`px-4 py-3 font-bold ${header.column.getCanSort() ? 'cursor-pointer select-none hover:text-white' : ''}`}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-white/5">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-zinc-500">
                  No hay órdenes que coincidan con los filtros
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <React.Fragment key={row.id}>
                  <tr className="hover:bg-white/[0.03] transition-colors">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  {row.getIsExpanded() && (
                    <tr className="bg-black/20">
                      <td colSpan={columns.length} className="px-6 py-4">
                        <ExpandedRow order={row.original} prediction={predictions[row.original.id]} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpandedRow({ order, prediction }: { order: OdooSaleOrder; prediction?: RiskPrediction | 'loading' }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-2">
          Líneas de producto ({order.lines_count})
        </h4>
        {!order.lines || order.lines.length === 0 ? (
          <p className="text-sm text-zinc-500">Sin detalle de líneas</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-zinc-500 text-xs">
              <tr>
                <th className="text-left py-1 pr-4 font-bold">Producto</th>
                <th className="text-right py-1 px-4 font-bold">Cant.</th>
                <th className="text-right py-1 px-4 font-bold">Entregado</th>
                <th className="text-right py-1 px-4 font-bold">P. unitario</th>
                <th className="text-right py-1 pl-4 font-bold">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {order.lines.map((line, i) => (
                <tr key={i} className="text-zinc-300">
                  <td className="py-1.5 pr-4">{line.name}</td>
                  <td className="py-1.5 px-4 text-right">{line.qty}</td>
                  <td className="py-1.5 px-4 text-right">{line.delivered}</td>
                  <td className="py-1.5 px-4 text-right">{formatCurrency(line.price_unit, order.currency)}</td>
                  <td className="py-1.5 pl-4 text-right font-bold">{formatCurrency(line.subtotal, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {prediction && prediction !== 'loading' && (
        <div className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
          <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${RISK_STYLES[prediction.risk_level]}`} />
          <div className="text-sm">
            <span className={`font-bold ${RISK_STYLES[prediction.risk_level]}`}>
              Riesgo {RISK_LABELS[prediction.risk_level]}:
            </span>{' '}
            <span className="text-zinc-300">{prediction.issue}</span>
            <p className="text-zinc-400 mt-1">💡 {prediction.suggestion}</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar y commit**

Run: `npm run lint`
Expected: sin errores.

```bash
git add src/components/admin/riskTypes.ts src/components/admin/OrdersTable.tsx
git commit -m "feat(admin): tabla de ordenes Odoo con sorting y filas expandibles"
```

---

### Task 8: Reescribir `AdminPanel.tsx` + re-tipar/podar funciones de IA

**Files:**
- Modify: `src/services/ai.ts` (re-tipar 4 funciones, borrar 3, borrar import de WorkOrder)
- Rewrite: `src/pages/AdminPanel.tsx`

Este task va junto porque AdminPanel es el ÚNICO consumidor de estas funciones — cambiarlas por separado rompería la compilación.

- [ ] **Step 1: Re-tipar y podar `src/services/ai.ts`**

1. Cambia la línea 2 (`import { WorkOrder, WorkOrderHistory } from '../types';`) por:

```ts
import type { RiskPrediction } from '../components/admin/riskTypes';
```

y re-exporta el tipo para los consumidores:

```ts
export type { RiskPrediction };
```

2. Reemplaza `generateClientReport` por:

```ts
export const generateClientReport = async (order: OdooSaleOrder) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: `Draft a professional, concise email in SPANISH to the client (${order.partner_name}) updating them on sale order ${order.name} for "${order.main_product}". Delivery progress is ${order.qty_delivered}/${order.qty_total} units${order.commitment_date ? `, committed delivery date is ${order.commitment_date}` : ''}. Total amount: ${order.amount_total} ${order.currency}.`,
  });
  return response.text;
};
```

3. Reemplaza `analyzeOrderAnomalies` por (cambia de "una orden + historial" a "análisis global del conjunto"):

```ts
export const analyzeOrderAnomalies = async (orders: OdooSaleOrder[]) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: `You are a manufacturing operations analyst. Analyze this set of Odoo sale orders pending invoicing and identify anomalies and red flags: overdue orders with 0% delivery, unusually large or stale orders, clients accumulating backlog, orders without commitment date. Be brief and actionable, use markdown bullet points. RESPOND IN SPANISH.\n\nOrders: ${JSON.stringify(orders.map(simplifyOrder))}`,
  });
  return response.text;
};
```

4. Reemplaza `predictOrderRisk` por:

```ts
export const predictOrderRisk = async (order: OdooSaleOrder): Promise<RiskPrediction> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: `You are a manufacturing delivery-risk AI. Analyze this Odoo sale order pending invoicing and predict potential delivery/invoicing issues.
    Order data: ${JSON.stringify(simplifyOrder(order))}

    Return a JSON object with:
    - risk_level: 'low', 'medium', or 'high'
    - issue: a brief description of the predicted issue in SPANISH
    - suggestion: a brief actionable suggestion in SPANISH
    - analyzedAt: the current ISO date string`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          risk_level: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
          issue: { type: Type.STRING },
          suggestion: { type: Type.STRING },
          analyzedAt: { type: Type.STRING }
        },
        required: ['risk_level', 'issue', 'suggestion', 'analyzedAt']
      }
    }
  });

  const result = JSON.parse(response.text || '{}');
  return {
    ...result,
    analyzedAt: new Date(result.analyzedAt || Date.now())
  };
};
```

5. Reemplaza `filterOrdersByNaturalLanguage` por (devuelve ids numéricos de Odoo):

```ts
export const filterOrdersByNaturalLanguage = async (query: string, orders: OdooSaleOrder[]): Promise<number[]> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: `Given the following JSON list of Odoo sale orders and a user query in SPANISH, return a JSON array of the 'id's (numbers) of the orders that match the query. Query: "${query}". Orders: ${JSON.stringify(orders.map(o => ({ id: o.id, ...simplifyOrder(o) })))}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.NUMBER }
      }
    }
  });
  return JSON.parse(response.text || '[]');
};
```

6. **BORRA** completas las funciones `extractOrdersFromFile`, `analyzeImage` y `generateVisualAid`.

7. `generateSpeech` y `processVoiceCommand` quedan como están (ya re-tipadas en Task 3). Verifica que el modelo de imagen `gemini-3-pro-image-preview` y `gemini-3-flash-preview` ya no aparezcan en el archivo (solo quedan `gemini-3.1-pro-preview` y `gemini-2.5-flash-preview-tts`).

- [ ] **Step 2: Reescribir `src/pages/AdminPanel.tsx`**

Reemplaza el archivo COMPLETO por:

```tsx
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
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>

        {error && (
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
                onClick={handleAnomalies}
                disabled={filteredOrders.length === 0}
                className="px-4 py-2 bg-amber-600/80 hover:bg-amber-500 disabled:opacity-50 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
              >
                <ScanSearch className="w-4 h-4" /> Anomalías
              </button>
              <button
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
```

- [ ] **Step 3: Verificar**

Run: `npm run lint`
Expected: sin errores.

Verificación manual: con `npm run dev:full` y login Google en http://localhost:3000/admin:
1. La tabla muestra órdenes reales de Odoo, ordenadas por compromiso.
2. Buscar texto filtra; selects de cliente/estado filtran.
3. Expandir una fila muestra líneas de producto.
4. "Excel" descarga un archivo con las órdenes filtradas.
5. Pestaña Configuración: los horarios existentes se listan; crear uno nuevo aparece en la TV.

- [ ] **Step 4: Commit**

```bash
git add src/services/ai.ts src/pages/AdminPanel.tsx
git commit -m "feat(admin): consola read-only de ordenes Odoo con IA integrada"
```

---

### Task 9: Eliminar el código muerto de Firestore work_orders

**Files:**
- Delete: `src/services/workOrders.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Confirmar que no quedan consumidores**

Run: `Select-String -Path src\**\*.ts*, server.ts -Pattern "workOrders|WorkOrder" | Select-Object Path, LineNumber, Line`
Expected: coincidencias SOLO en `src/services/workOrders.ts` y `src/types.ts`. Si aparece otro archivo, arréglalo antes de continuar.

- [ ] **Step 2: Borrar el servicio**

Run: `Remove-Item src\services\workOrders.ts`

- [ ] **Step 3: Limpiar `src/types.ts`**

Reemplaza el archivo COMPLETO por:

```ts
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface CompanyConfig {
  id?: string;
  company_name: string;
  delivery_schedule: string; // e.g., "Lunes a Viernes: 08:00 - 17:00"
  updatedAt: Date;
}

// ─── Odoo ─────────────────────────────────────────────────────────────────────
// Re-exportado desde src/services/odoo.ts para uso global
export type { OdooSaleOrder, OdooOrderLine, OdooConnectionStatus, OdooOrdersResponse } from './services/odoo';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}
```

- [ ] **Step 4: Verificar y commit**

Run: `npm run lint`
Expected: sin errores. (Si falla, hay un import huérfano de `WorkOrder`/`Priority`/`Status` — el mensaje de tsc te dice dónde.)

```bash
git add -A
git commit -m "chore: eliminar CRUD de work_orders en Firestore (codigo muerto)"
```

---

### Task 10: Cerrar reglas de Firestore para work_orders

**Files:**
- Modify: `firestore.rules`

Los datos viejos NO se borran de Firestore — solo se vuelven inaccesibles (decisión reversible).

- [ ] **Step 1: Reescribir `firestore.rules`**

Reemplaza el archivo COMPLETO por:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // ===============================================================
    // Helper Functions
    // ===============================================================
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function hasOnlyAllowedFields(allowedFields) {
      return request.resource.data.keys().hasOnly(allowedFields);
    }
    
    function hasRequiredFields(requiredFields) {
      return request.resource.data.keys().hasAll(requiredFields);
    }
    
    function isValidString(field, minLen, maxLen) {
      return request.resource.data[field] is string &&
             request.resource.data[field].size() >= minLen &&
             request.resource.data[field].size() <= maxLen;
    }
    
    function isTimestamp(field) {
      return request.resource.data[field] is timestamp;
    }
    
    // ===============================================================
    // Domain Validators
    // ===============================================================

    function isValidCompanyConfig() {
      let allowedFields = ['company_name', 'delivery_schedule', 'updatedAt'];
      return hasOnlyAllowedFields(allowedFields) &&
             hasRequiredFields(allowedFields) &&
             isValidString('company_name', 1, 100) &&
             isValidString('delivery_schedule', 1, 500) &&
             isTimestamp('updatedAt');
    }

    // ===============================================================
    // Rules
    // ===============================================================
    
    match /company_configs/{configId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && isValidCompanyConfig();
      allow update: if isAuthenticated() && isValidCompanyConfig();
      allow delete: if isAuthenticated();
    }
    
    // Las órdenes ahora viven en Odoo. Los datos históricos de estas
    // colecciones se conservan en Firestore pero quedan inaccesibles.
    match /work_orders/{orderId} {
      allow read, write: if false;
    }
    
    match /work_orders_history/{historyId} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 2: Verificar y commit**

Run: `npm run lint`
Expected: sin errores (las reglas no pasan por tsc, pero confirma que nada más se rompió).

```bash
git add firestore.rules
git commit -m "chore(firestore): cerrar reglas de work_orders (datos preservados)"
```

- [ ] **Step 3: Desplegar reglas (ACCIÓN DEL USUARIO)**

Las reglas no aplican hasta desplegarse: `firebase deploy --only firestore:rules` (requiere Firebase CLI con sesión iniciada). Anota esto en el reporte final para el usuario — NO lo ejecutes sin su confirmación.

---

### Task 11: Actualizar CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Actualizar la sección "Two independent data sources"**

Reemplaza la sección completa `## Two independent data sources (the key architectural split)` (título incluido, hasta antes de `### The Odoo proxy`) por:

```markdown
## Data sources

**Odoo ERP is the single source of truth for orders.** The TV Dashboard (`/`), Admin console (`/admin`) and Stats (`/stats`) all show Odoo `sale.order` records with `invoice_status = 'to invoice'`, fetched through the shared `useOdooOrders()` hook (`src/hooks/useOdooOrders.ts`) → React Query polling → Express proxy (`server.ts`). All three pages share one query key (`odooData`), so they share a single request/cache.

**Firestore** only holds `company_configs` (per-client delivery schedules, shown on the TV cards and managed from the Admin → Configuración tab) and backs Firebase **auth**. The legacy `work_orders` / `work_orders_history` collections were retired in 2026-06 (data preserved but rules closed — see `docs/superpowers/specs/2026-06-12-admin-odoo-console-design.md`). The Admin console is **read-only** over Odoo: there is no order CRUD anywhere in the app.
```

- [ ] **Step 2: Actualizar la sección "AI layer"**

En `## AI layer (src/services/ai.ts)`, reemplaza la frase que enumera las funciones (`Functions cover: ...speech.`) por:

```markdown
Functions cover: shift summaries (Stats), client report emails, global anomaly analysis, per-order risk prediction (ephemeral, not persisted), natural-language order filtering, **voice command processing** (audio → JSON action for the TV dashboard), and TTS speech. All functions take `OdooSaleOrder` data; the `simplifyOrder` helper produces the compact Spanish-field projection used in prompts.
```

Y actualiza la línea de modelos: elimina la mención de `gemini-3-pro-image-preview` y `gemini-3-flash-preview` (ya no se usan).

- [ ] **Step 3: Actualizar la sección "Firestore rules"**

Reemplaza el cuerpo de `## Firestore rules (firestore.rules)` por:

```markdown
Only `company_configs` is writable (validated: exact field set, string lengths, timestamp). `work_orders` and `work_orders_history` are **closed** (`allow read, write: if false`) — legacy data is preserved in Firestore but unreachable. If you add a field to `CompanyConfig`, update both `src/types.ts` **and** `isValidCompanyConfig()` here, or writes will be rejected. Deploy with `firebase deploy --only firestore:rules`.
```

- [ ] **Step 4: Actualizar "Project Structure"**

En el árbol de estructura: elimina la línea de `workOrders.ts`, agrega `hooks/useOdooOrders.ts` bajo `src/`, y agrega `components/admin/` con una nota (`# OrdersTable, ConfigTab, AIModal`).

- [ ] **Step 5: Revisar el resto del archivo**

Busca menciones huérfanas: `WorkOrder`, `work_orders`, `extractOrders`, `image generation`, `CSV`. Ajusta o elimina las que contradigan la nueva arquitectura (p. ej. en "Getting Started" la fila de Firebase sigue siendo válida — auth + config).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: actualizar CLAUDE.md a la arquitectura consola-Odoo"
```

---

### Task 12: Verificación final end-to-end

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Compilación y build de producción**

Run: `npm run lint`
Expected: sin errores.

Run: `npm run build`
Expected: build exitoso en `dist/` sin errores.

- [ ] **Step 2: Smoke test con dev:full**

Con `npm run dev:full` corriendo (idealmente en la terminal del usuario), verifica con Playwright (o pide al usuario que verifique):

1. **TV** http://localhost:3000 — órdenes con logos, horarios de entrega visibles, sin errores en consola.
2. **Login** http://localhost:3000/admin — redirige a login; tras Google sign-in entra a la consola.
3. **Admin/Órdenes** — tabla poblada, búsqueda "vencidas" vía select funciona, fila expandible muestra líneas con precios, export Excel descarga.
4. **Admin/Configuración** — horarios listados, crear/editar funciona.
5. **Stats** http://localhost:3000/stats — 4 tarjetas, 3 gráficas, "Generar resumen" responde en español.
6. **Consola del navegador** — sin errores (warnings de React Query/PWA aceptables).

- [ ] **Step 3: Commit final si hubo ajustes**

```bash
git add -A
git commit -m "fix: ajustes de verificacion final"
```

(Solo si el smoke test obligó a cambios; si no, omite.)

---

## Self-review (ya aplicado)

- **Cobertura del spec:** hook compartido (T2), proxy lines (T1), AdminPanel tabs/búsqueda/filtros/expandible/Excel (T7-T8), IA re-tipada y podada (T3, T4, T8), Stats re-apuntado (T4), config tab preservado (T6), limpieza workOrders/types (T9), reglas cerradas (T10), CLAUDE.md (T11), verificación (T12). Logos fuera de alcance — confirmado, sin task.
- **Tipos consistentes:** `RiskPrediction` vive en `src/components/admin/riskTypes.ts` (T7) y `ai.ts` lo importa/re-exporta (T8). `OdooOrderLine` se define en T1 y se usa en T7. `filterOrdersByNaturalLanguage` devuelve `number[]` y `aiFilterIds` es `number[] | null`.
- **Compilación tras cada commit:** los tipos viejos no se borran hasta T9, cuando ya no hay consumidores; cada función de IA se re-tipa en el mismo task que su único consumidor.
