import {
  OdooSaleOrder, getOrderStatus, getDeliveryProgress, parseOdooDate,
} from './odoo';
import { getOrderMissingQty, getPendingLines } from './pendingItems';
import { getIdTokenOrThrow } from '../firebase';

const Type = {
  STRING: 'STRING',
  OBJECT: 'OBJECT',
  ARRAY: 'ARRAY',
  NUMBER: 'NUMBER',
} as const;

type GeminiContentPart = { text: string };

type GeminiContents =
  | string
  | { parts: GeminiContentPart[] };

interface GeminiSchemaProperty {
  type: string;
  enum?: string[];
  description?: string;
  items?: GeminiSchemaProperty;
  properties?: Record<string, GeminiSchemaProperty>;
  required?: string[];
}

interface GeminiGenerateConfig {
  responseMimeType?: string;
  responseSchema?: {
    type: string;
    required?: string[];
    properties?: Record<string, GeminiSchemaProperty>;
    items?: { type: string };
  };
}

export interface GeminiRequest {
  model: string;
  contents: GeminiContents;
  config?: GeminiGenerateConfig;
}

interface GeminiProxyResponse {
  text?: string;
}

export type AIErrorKind = 'network' | 'timeout' | 'auth' | 'rate_limit' | 'invalid_response' | 'server' | 'unknown';

const AI_ERROR_MESSAGES: Record<AIErrorKind, string> = {
  network: 'No se pudo conectar con el servidor. Verifica tu conexión a internet.',
  timeout: 'La IA tardó demasiado en responder. Intenta de nuevo.',
  auth: 'Sesión expirada o clave API inválida — vuelve a iniciar sesión.',
  rate_limit: 'Gemini está saturado, intenta de nuevo en un momento.',
  invalid_response: 'La IA devolvió una respuesta que no se pudo interpretar.',
  server: 'El servidor de IA tuvo un problema. Intenta de nuevo en un momento.',
  unknown: 'Ocurrió un error inesperado al contactar la IA.',
};

export class AIError extends Error {
  readonly kind: AIErrorKind;
  readonly userMessage: string;

  constructor(kind: AIErrorKind, message?: string, cause?: unknown) {
    super(message || AI_ERROR_MESSAGES[kind], cause !== undefined ? { cause } : undefined);
    this.name = 'AIError';
    this.kind = kind;
    this.userMessage = AI_ERROR_MESSAGES[kind];
  }
}

const RETRYABLE_KINDS: ReadonlySet<AIErrorKind> = new Set(['network', 'timeout', 'rate_limit', 'server']);

function classifyHttpStatus(status: number): AIErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'unknown';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Reintenta solo fallos transitorios (red/timeout/rate-limit/servidor); nunca auth. */
async function withRetry<T>(fn: () => Promise<T>, retries = 2, baseDelayMs = 300): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const kind = err instanceof AIError ? err.kind : 'unknown';
      if (attempt === retries || !RETRYABLE_KINDS.has(kind)) throw err;
      await sleep(baseDelayMs * Math.pow(3, attempt));
    }
  }
}

const PROXY_BASE = import.meta.env.VITE_ODOO_PROXY_URL || '';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getIdTokenOrThrow();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function fetchOnce(params: GeminiRequest, timeoutMs: number, endpoint = '/api/ai/generate'): Promise<GeminiProxyResponse> {
  const headers = await getAuthHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${PROXY_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) throw new AIError('timeout', undefined, err);
    throw new AIError('network', undefined, err);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { error?: string } | null;
    throw new AIError(classifyHttpStatus(response.status), errorBody?.error);
  }
  return await response.json() as GeminiProxyResponse;
}

async function generateContent(params: GeminiRequest, timeoutMs = 30000, retries = 2, endpoint = '/api/ai/generate'): Promise<GeminiProxyResponse> {
  return withRetry(() => fetchOnce(params, timeoutMs, endpoint), retries);
}

async function generateAdminContent(params: GeminiRequest): Promise<GeminiProxyResponse> {
  return generateContent(params, 30000, 2, '/api/ai/admin-generate');
}

/** Nota de la orden (HTML de Odoo) a texto plano y truncado, para no inflar el prompt. */
function noteToPlainText(note: string | null, max = 400): string {
  if (!note) return '';
  const doc = new DOMParser().parseFromString(note, 'text/html');
  const text = doc.body.textContent?.replace(/\s+/g, ' ').trim() || '';
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

/** Proyección compacta de una orden Odoo para prompts (menos tokens, campos en español). */
const simplifyOrder = (o: OdooSaleOrder) => ({
  so: o.name,
  referencia_cliente: o.customer_reference,
  cliente: o.partner_name,
  producto: o.main_product,
  avance_entrega: `${o.qty_delivered}/${o.qty_total}`,
  porcentaje_entrega: getDeliveryProgress(o),
  piezas_faltantes: getOrderMissingQty(o),
  fecha_orden: parseOdooDate(o.date_order)?.toISOString().split('T')[0] ?? null,
  fecha_compromiso: parseOdooDate(o.commitment_date)?.toISOString().split('T')[0] ?? null,
  estado: getOrderStatus(o).label,
  vendedor: o.salesperson,
  nota: noteToPlainText(o.note),
});

/** Igual que simplifyOrder pero incluye el desglose de líneas pendientes —
 * solo para prompts sobre una única orden (evita inflar listas largas). */
const simplifyOrderWithLines = (o: OdooSaleOrder) => ({
  ...simplifyOrder(o),
  lineas_pendientes: getPendingLines(o).map(pl => ({ producto: pl.line.name, faltan: pl.missing })),
});

export const generateShiftSummary = async (orders: OdooSaleOrder[]) => {
  const response = await generateContent({
    model: 'gemini-3.7-flash',
    contents: `You are a manufacturing plant manager. Analyze the following Odoo sale orders pending invoicing and provide a brief executive summary of the current state: highlight overdue orders, clients with the largest backlog (by number of orders), and overall delivery progress. Do NOT mention or estimate any monetary amounts. Use markdown. RESPOND IN SPANISH.\n\nOrders: ${JSON.stringify(orders.map(simplifyOrder))}`,
  });
  return response.text;
};

/** Resumen para el equipo de diseño: qué atacar hoy y por qué, agrupado por cliente. */
export const summarizePendingWork = async (orders: OdooSaleOrder[]) => {
  const response = await generateContent({
    model: 'gemini-3.7-flash',
    contents: `Eres un asistente para el equipo de diseño/producción de un taller de manufactura. Con la siguiente lista de órdenes de venta pendientes de entrega (con sus piezas faltantes y estado de urgencia), arma un plan de trabajo breve para hoy: qué órdenes atacar primero y por qué, agrupando por cliente cuando tenga sentido. No menciones montos. Usa markdown con encabezados por prioridad. RESPONDE EN ESPAÑOL.\n\nÓrdenes: ${JSON.stringify(orders.map(simplifyOrder))}`,
  });
  return response.text;
};

/** Extrae en español los requisitos, tiempos comprometidos y ambigüedades de una orden,
 * leyendo su nota y sus líneas pendientes — ayuda al diseñador a entender qué le piden. */
export const explainOrderRequirements = async (order: OdooSaleOrder) => {
  const response = await generateContent({
    model: 'gemini-3.7-flash',
    contents: `Eres un asistente para el equipo de diseño de un taller de manufactura. Lee los datos de esta orden de venta de Odoo (incluida su nota de términos) y explica en español, breve y accionable: (1) qué se debe fabricar/entregar y qué falta, (2) el tiempo de entrega comprometido si la nota lo menciona, (3) cualquier ambigüedad o dato faltante que convenga confirmar con ventas. No menciones montos. Usa markdown con viñetas cortas.\n\nOrden: ${JSON.stringify(simplifyOrderWithLines(order))}`,
  });
  return response.text;
};

export const filterOrdersByNaturalLanguage = async (query: string, orders: OdooSaleOrder[]): Promise<number[]> => {
  const response = await generateAdminContent({
    model: 'gemini-3.7-flash',
    contents: `Filtra estas órdenes de venta de Odoo según la consulta. Busca SO, referencias del cliente, OT e ingenieros en todas las descripciones y notas. El vendedor es un dato separado: no asumas que es el ingeniero asignado. Devuelve únicamente un arreglo JSON con los id numéricos de las órdenes que coincidan. Consulta: ${JSON.stringify(query)}. Órdenes: ${JSON.stringify(orders.map(o => ({ id: o.id, ...simplifyOrder(o), descripciones: o.lines.map(line => line.name), nota: noteToPlainText(o.note, 4000) })))}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.NUMBER }
      }
    }
  });
  try {
    return JSON.parse(response.text || '[]') as number[];
  } catch {
    throw new AIError('invalid_response');
  }
};
