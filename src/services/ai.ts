import type { RiskPrediction } from '../components/admin/riskTypes';
import { formatPONumber } from '../utils/formatters';
import { OdooSaleOrder, getOrderPriority, isOrderOverdue, isOrderFullyDelivered, getDeliveryProgress, parseOdooDate } from './odoo';
import { getIdTokenOrThrow } from '../firebase';
import { buildVoiceRiskCatalog, isVoiceRiskQuestion, type VoiceRiskOrder } from './voiceRisk';

export type { RiskPrediction };

const Type = {
  STRING: 'STRING',
  OBJECT: 'OBJECT',
  ARRAY: 'ARRAY',
  NUMBER: 'NUMBER',
} as const;

const Modality = {
  AUDIO: 'AUDIO',
} as const;

type GeminiContentPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

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
  responseModalities?: string[];
  speechConfig?: {
    voiceConfig: {
      prebuiltVoiceConfig: { voiceName: string };
    };
  };
}

export interface GeminiRequest {
  model: string;
  contents: GeminiContents;
  config?: GeminiGenerateConfig;
}

interface GeminiProxyResponse {
  text?: string;
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string };
      }>;
    };
  }>;
}

interface RiskPredictionRaw {
  risk_level: 'low' | 'medium' | 'high';
  issue: string;
  suggestion: string;
  analyzedAt: string;
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

async function fetchOnce(params: GeminiRequest, timeoutMs: number): Promise<GeminiProxyResponse> {
  const headers = await getAuthHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${PROXY_BASE}/api/ai/generate`, {
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

async function generateContent(params: GeminiRequest, timeoutMs = 30000, retries = 2): Promise<GeminiProxyResponse> {
  return withRetry(() => fetchOnce(params, timeoutMs), retries);
}

/** Proyección compacta de una orden Odoo para prompts (menos tokens, campos en español). */
const simplifyOrder = (o: OdooSaleOrder) => ({
  so: o.name,
  cliente: o.partner_name,
  producto: o.main_product,
  avance_entrega: `${o.qty_delivered}/${o.qty_total}`,
  porcentaje_entrega: getDeliveryProgress(o),
  fecha_orden: parseOdooDate(o.date_order)?.toISOString().split('T')[0] ?? null,
  fecha_compromiso: parseOdooDate(o.commitment_date)?.toISOString().split('T')[0] ?? null,
  vencida: isOrderOverdue(o) ? 'SÍ' : 'NO',
  prioridad: getOrderPriority(o),
  vendedor: o.salesperson,
});

export const generateShiftSummary = async (orders: OdooSaleOrder[]) => {
  const response = await generateContent({
    model: 'gemini-3.5-flash',
    contents: `You are a manufacturing plant manager. Analyze the following Odoo sale orders pending invoicing and provide a brief executive summary of the current state: highlight overdue orders, clients with the largest backlog (by number of orders), and overall delivery progress. Do NOT mention or estimate any monetary amounts. Use markdown. RESPOND IN SPANISH.\n\nOrders: ${JSON.stringify(orders.map(simplifyOrder))}`,
  });
  return response.text;
};

export const generateClientReport = async (order: OdooSaleOrder) => {
  const response = await generateContent({
    model: 'gemini-3.5-flash',
    contents: `Draft a professional, concise email in SPANISH to the client (${order.partner_name}) updating them on sale order ${order.name} for "${order.main_product}". Delivery progress is ${order.qty_delivered}/${order.qty_total} units${order.commitment_date ? `, committed delivery date is ${order.commitment_date}` : ''}. Focus on delivery status and dates only; do NOT include prices or monetary amounts.`,
  });
  return response.text;
};

export const analyzeOrderAnomalies = async (orders: OdooSaleOrder[]) => {
  const response = await generateContent({
    model: 'gemini-3.5-flash',
    contents: `You are a manufacturing operations analyst. Analyze this set of Odoo sale orders pending invoicing and identify anomalies and red flags: overdue orders with 0% delivery, orders with unusually large quantities or that are stale (old), clients accumulating backlog, orders without commitment date. Do NOT mention or estimate any monetary amounts. Be brief and actionable, use markdown bullet points. RESPOND IN SPANISH.\n\nOrders: ${JSON.stringify(orders.map(simplifyOrder))}`,
  });
  return response.text;
};

export const predictOrderRisk = async (order: OdooSaleOrder): Promise<RiskPrediction> => {
  const response = await generateContent({
    model: 'gemini-3.5-flash',
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

  let result: RiskPredictionRaw;
  try {
    result = JSON.parse(response.text || '{}') as RiskPredictionRaw;
  } catch {
    throw new AIError('invalid_response');
  }
  return {
    ...result,
    analyzedAt: new Date(result.analyzedAt || Date.now())
  };
};

export const filterOrdersByNaturalLanguage = async (query: string, orders: OdooSaleOrder[]): Promise<number[]> => {
  const response = await generateContent({
    model: 'gemini-3.5-flash',
    contents: `Given the following JSON list of Odoo sale orders and a user query in SPANISH, return a JSON array of the 'id's (numbers) of the orders that match the query. Query: "${query}". Orders: ${JSON.stringify(orders.map(o => ({ id: o.id, ...simplifyOrder(o) })))}`,
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

export interface ExpectedOrderInfo {
  po_number: string;
  client: string;
  product: string;
  status: 'overdue' | 'pending' | 'delivered' | 'critical';
  delivery_progress: string;
  reason: string;
}

export interface VoiceCommandResponse {
  transcript?: string;
  po_number: string | null;
  action: 'highlight' | 'filter' | 'answer' | 'focus';
  filter_type?: 'all' | 'overdue' | 'delivered' | 'pending' | 'critical' | null;
  filter_client?: string | null;
  message: string;
  user_intent_summary?: string;
  expected_order?: ExpectedOrderInfo | null;
  risk_orders?: VoiceRiskOrder[];
}

/** Palabras numéricas en español → valor. Cubre 0-999 mil, suficiente para números de PO. */
const SPANISH_NUMBER_WORDS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, dieciséis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiún: 21, veintiuno: 21, veintidos: 22, veintidós: 22,
  veintitres: 23, veintitrés: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintiséis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
  mil: 1000,
};

/** Convierte "quinientos cuarenta y seis" -> 546. Retorna null si no encuentra una secuencia numérica. */
function parseSpanishNumberWords(text: string): number | null {
  const words = text.toLowerCase().replace(/[^a-záéíóúñ\s]/g, ' ').split(/\s+/).filter(Boolean);
  let bestValue: number | null = null;
  let bestCount = 0;

  for (let start = 0; start < words.length; start++) {
    if (!(words[start] in SPANISH_NUMBER_WORDS)) continue;
    let total = 0;
    let current = 0;
    let count = 0;
    let i = start;
    while (i < words.length) {
      const w = words[i];
      if (w === 'y') { i++; continue; }
      if (!(w in SPANISH_NUMBER_WORDS)) break;
      const val = SPANISH_NUMBER_WORDS[w];
      if (val === 1000) {
        total += (current || 1) * 1000;
        current = 0;
      } else {
        current += val;
      }
      count++;
      i++;
    }
    total += current;
    if (count > bestCount) {
      bestCount = count;
      bestValue = total;
    }
    start = i - 1;
  }
  return bestValue;
}

const STATE_LABELS: Record<'overdue' | 'delivered' | 'pending' | 'critical', string> = {
  overdue: 'vencidas', delivered: 'entregadas', pending: 'pendientes', critical: 'críticas',
};

/** Detecta una palabra de estado en el texto. Compartido entre el filtro de cliente/estado
 * (paso 3) y las preguntas factuales de conteo (paso 0). */
function detectStatusWord(text: string): 'overdue' | 'delivered' | 'pending' | 'critical' | null {
  if (/(vencida[s]?|atrasada[s]?|retrasada[s]?)/i.test(text)) return 'overdue';
  if (/(entregada[s]?|completada[s]?|terminada[s]?)/i.test(text)) return 'delivered';
  if (/(critica[s]?|urgente[s]?)/i.test(text)) return 'critical';
  if (/(pendiente[s]?|en proceso|activas)/i.test(text)) return 'pending';
  return null;
}

/** Cuenta órdenes por estado con la misma semántica que TVDashboard.tsx usa para poblar
 * filteredOdooOrders (isOrderFullyDelivered / isOrderOverdue / getDeliveryProgress /
 * getOrderPriority) — una respuesta hablada nunca debe contradecir lo que se ve en pantalla. */
function countByStatus(orders: OdooSaleOrder[], status: 'overdue' | 'pending' | 'delivered' | 'critical'): number {
  if (status === 'delivered') return orders.filter(isOrderFullyDelivered).length;
  const visible = orders.filter(o => !isOrderFullyDelivered(o));
  if (status === 'overdue') return visible.filter(isOrderOverdue).length;
  if (status === 'critical') return visible.filter(o => ['critical', 'high'].includes(getOrderPriority(o))).length;
  return visible.filter(o => getDeliveryProgress(o) < 100 && !isOrderOverdue(o)).length;
}

/** Palabras que cortan la captura de un nombre de cliente ("las de Nissan que están vencidas" -> "nissan"). */
const CLIENT_CAPTURE_STOPWORDS = new Set([
  'que', 'esta', 'está', 'estan', 'están', 'esa', 'ese', 'y', 'del', 'la', 'el', 'los', 'las',
]);

/** Frasea un conteo con concordancia singular/plural ("1 orden vencida en total" / "3 órdenes
 * vencidas en total"). `pluralLabel` viene de STATE_LABELS (ya en plural femenino: "vencidas",
 * "críticas", ...); el singular se deriva quitando la 's' final, válido para las cuatro
 * etiquetas existentes. El conteo siempre corre sobre TODO el catálogo activo, sin importar
 * clientFilter/textFilter de la pantalla — "en total" lo deja explícito para que la respuesta
 * hablada nunca se lea como si estuviera acotada a lo que el operador ve filtrado en ese momento. */
function countMessage(count: number, pluralLabel: string): string {
  if (count === 0) return `No hay órdenes ${pluralLabel} en total.`;
  if (count === 1) return `1 orden ${pluralLabel.slice(0, -1)} en total.`;
  return `${count} órdenes ${pluralLabel} en total.`;
}

/**
 * Intenta procesar el comando de voz localmente en < 5ms mediante coincidencia de patrones.
 * Si encuentra una intención clara (PO específico, filtro de estado, filtro de cliente, limpiar,
 * o una combinación de cliente+estado), retorna un VoiceCommandResponse inmediato sin red.
 * Retorna null si la instrucción es una pregunta o requiere análisis complejo por IA.
 */
export function tryLocalFastVoiceCommand(
  transcript: string,
  activeOrders: OdooSaleOrder[]
): VoiceCommandResponse | null {
  const text = transcript.trim().toLowerCase();
  if (!text) return null;

  // 0.a "¿Cuál es la más atrasada?" — la orden vencida con el commitment_date más antiguo.
  // Mismo formato de respuesta que un PO directo (paso 2) para que el resaltado/overlay
  // se comporten igual que si el operador hubiera dicho el número de orden.
  if (/m[aá]s\s+atrasada\b/i.test(text)) {
    const overdueOrders = activeOrders.filter(o => isOrderOverdue(o) && !isOrderFullyDelivered(o));
    if (overdueOrders.length === 0) {
      return {
        transcript,
        po_number: null,
        action: 'answer',
        message: 'No hay ninguna orden vencida.',
        user_intent_summary: 'Consultando la orden más atrasada',
      };
    }
    const worst = overdueOrders.reduce((oldest, o) => {
      const oldestDate = parseOdooDate(oldest.commitment_date)?.getTime() ?? Infinity;
      const currentDate = parseOdooDate(o.commitment_date)?.getTime() ?? Infinity;
      return currentDate < oldestDate ? o : oldest;
    });
    const formattedPO = formatPONumber(worst.name);
    const deliveryProgress = `${worst.qty_delivered}/${worst.qty_total} (${getDeliveryProgress(worst)}%)`;
    return {
      transcript,
      po_number: formattedPO,
      action: 'highlight',
      message: `La más atrasada es la orden ${formattedPO} de ${worst.partner_name}.`,
      user_intent_summary: 'Consultando la orden más atrasada',
      expected_order: {
        po_number: formattedPO,
        client: worst.partner_name,
        product: worst.main_product,
        status: 'overdue',
        delivery_progress: deliveryProgress,
        reason: 'Orden vencida con la fecha de compromiso más antigua',
      },
    };
  }

  // 0.b "¿Hay algo urgente/crítico/vencido/atrasado?" — existencia, sin resaltar nada.
  const existenceMatch = text.match(/^hay\s+(algo\s+|alguna\s+orden\s+)?(urgente|cr[ií]tic\w*|vencid\w*|atrasad\w*)/i);
  if (existenceMatch) {
    const status: 'overdue' | 'critical' = /urgente|cr[ií]tic/i.test(existenceMatch[2]) ? 'critical' : 'overdue';
    const count = countByStatus(activeOrders, status);
    return {
      transcript,
      po_number: null,
      action: 'answer',
      message: count > 0
        ? `Sí, hay ${countMessage(count, STATE_LABELS[status])}`
        : 'No, no hay ninguna.',
      user_intent_summary: `Consultando si hay órdenes ${STATE_LABELS[status]}`,
    };
  }

  // 0.c "¿Cuántas [estado] hay?" / "¿Cuántas órdenes hay en total?" — conteo exacto en vez
  // de dejar que Gemini cuente (y potencialmente se equivoque) sobre el mismo catálogo.
  if (/^cu[aá]nt[oa]s?\b/i.test(text)) {
    const status = detectStatusWord(text);
    if (status) {
      const count = countByStatus(activeOrders, status);
      return {
        transcript,
        po_number: null,
        action: 'answer',
        message: countMessage(count, STATE_LABELS[status]),
        user_intent_summary: `Contando órdenes ${STATE_LABELS[status]}`,
      };
    }
    if (/(^|\s)(ordenes|órdenes)(?=\s|$)/i.test(text)) {
      const count = activeOrders.filter(o => !isOrderFullyDelivered(o)).length;
      return {
        transcript,
        po_number: null,
        action: 'answer',
        message: count === 1 ? '1 orden activa.' : `${count} órdenes activas.`,
        user_intent_summary: 'Contando órdenes activas',
      };
    }
  }

  // 0.z Preguntas ("qué", "cuánto", "hay algo urgente...") que no matchearon arriba van
  // directo a Gemini: el fast path solo sabe filtrar/resaltar/contar, no narrar ni explicar.
  // Nota: se usa (?=\s|$) en vez de \b porque \b no detecta límite de palabra después de
  // una vocal acentuada en el motor de regex de JS ("qué" + \b nunca hace match).
  if (/^(qué|que|cuál|cual|cuáles|cuales|cuánto|cuanto|cuánta|cuanta|cuántos|cuantos|cuántas|cuantas|cómo|como|quién|quien|dónde|donde|hay|por qué|porque)(?=\s|$)/i.test(text)) {
    return null;
  }

  // 1. Limpiar / Restablecer filtros
  if (/^(limpiar(\s+(los\s+)?filtros?)?|restablecer(\s+filtros?)?|quitar\s+(el\s+)?filtros?|mostrar\s+todo[s]?|mu[ée]strame\s+todo[s]?|ver\s+todo[s]?)$/i.test(text)) {
    return {
      transcript,
      po_number: null,
      action: 'filter',
      filter_type: 'all',
      filter_client: null,
      message: 'Filtros limpiados. Mostrando todas las órdenes.',
      user_intent_summary: 'Limpiando filtros de la vista',
    };
  }

  // 2. Búsqueda directa por PO — máxima prioridad: si el operador da un número,
  // siempre gana sobre cualquier lectura de "filtro" (dígitos o en palabras: "quinientos cuarenta y seis").
  const digitMatch = text.match(/(?:orden|po|número|no\.?|s)?\s*([0-9]{3,6})/i) || text.match(/([0-9]{4}\/s[0-9]{5})/i);
  let rawNumber = digitMatch?.[1]?.trim() ?? null;
  if (!rawNumber && /\b(orden|po|número|num\.?)\b/i.test(text)) {
    const wordNumber = parseSpanishNumberWords(text);
    if (wordNumber !== null && wordNumber > 0) rawNumber = String(wordNumber);
  }

  if (rawNumber) {
    // Compara solo el sufijo de dígitos (evita que un año como "2026/S00546" haga
    // match falso con "2026" — el año queda al inicio de la cadena, no al final).
    const matchedOrder = activeOrders.find(o => o.name.replace(/\D/g, '').endsWith(rawNumber as string));

    if (matchedOrder) {
      const formattedPO = formatPONumber(matchedOrder.name);
      const deliveryProgress = `${matchedOrder.qty_delivered}/${matchedOrder.qty_total} (${getDeliveryProgress(matchedOrder)}%)`;
      const isOverdue = isOrderOverdue(matchedOrder);
      const statusStr: 'overdue' | 'delivered' | 'pending' = isOverdue
        ? 'overdue'
        : (matchedOrder.qty_delivered >= matchedOrder.qty_total ? 'delivered' : 'pending');

      return {
        transcript,
        po_number: formattedPO,
        action: 'highlight',
        message: `Orden ${formattedPO} encontrada para ${matchedOrder.partner_name}, avance ${deliveryProgress}.`,
        user_intent_summary: `Búsqueda directa de orden ${formattedPO}`,
        expected_order: {
          po_number: formattedPO,
          client: matchedOrder.partner_name,
          product: matchedOrder.main_product,
          status: statusStr,
          delivery_progress: deliveryProgress,
          reason: isOverdue ? 'Orden con atraso identificada directamente' : 'Orden identificada por número PO',
        },
      };
    }
  }

  // 3. Cliente y/o estado — combinables ("las de Nissan que están vencidas" filtra ambos a la vez).
  const clientMatch = text.match(/(?:las de|del cliente|cliente|filtra[r]? por|\bde)\s+([a-záéíóúñ0-9]+(?:\s+[a-záéíóúñ0-9]+){0,3})/i);
  let matchedClient: string | null = null;
  if (clientMatch?.[1]) {
    const words: string[] = [];
    for (const w of clientMatch[1].trim().split(/\s+/)) {
      if (CLIENT_CAPTURE_STOPWORDS.has(w)) break;
      words.push(w);
    }
    const queryClient = words.join(' ');
    if (queryClient.length >= 3) {
      const uniqueClients = Array.from(new Set(activeOrders.map(o => o.partner_name)));
      matchedClient = uniqueClients.find(c =>
        c.toLowerCase().includes(queryClient) || queryClient.includes(c.toLowerCase())
      ) ?? null;
    }
  }

  const filterType = detectStatusWord(text);

  if (matchedClient || filterType) {
    const parts: string[] = [];
    if (matchedClient) parts.push(`cliente ${matchedClient}`);
    if (filterType) parts.push(STATE_LABELS[filterType]);

    return {
      transcript,
      po_number: null,
      action: 'filter',
      filter_type: filterType ?? undefined,
      filter_client: matchedClient,
      message: `Filtrando órdenes de ${parts.join(' — ')}.`,
      user_intent_summary: `Filtrando órdenes de ${parts.join(' y ')}`,
    };
  }

  return null;
}

/**
 * Emite una respuesta de voz inmediata usando la síntesis nativa del navegador (Web Speech API)
 * sin latencia de red. Retorna true si tuvo éxito; `onEnded` se llama cuando la voz termina
 * (o falla a medio camino) para que el llamador pueda liberar su indicador de "hablando".
 */
export function speakFastLocal(text: string, onEnded?: () => void): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-MX';
    utterance.rate = 1.05;
    if (onEnded) {
      utterance.onend = onEnded;
      utterance.onerror = onEnded;
    }
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

async function executeVoiceCommand(
  basePrompt: string,
  inputParts: GeminiContentPart[],
  activeOrders: OdooSaleOrder[],
  previousContext?: { transcript: string; message: string } | null,
  isRiskQuery = false,
): Promise<VoiceCommandResponse> {
  const simplifiedOrders = isRiskQuery ? buildVoiceRiskCatalog(activeOrders) : activeOrders.map(o => ({
    po: formatPONumber(o.name),
    cli: o.partner_name,
    prod: o.main_product,
    prio: getOrderPriority(o),
    prog: `${o.qty_delivered}/${o.qty_total}`,
    venc: isOrderOverdue(o) ? 'SÍ' : 'NO'
  }));

  const contextBlock = previousContext
    ? `\n\nTURNO ANTERIOR: "${previousContext.transcript}" -> "${previousContext.message}".`
    : '';

  const instructions = ` Catálogo activo: ${JSON.stringify(simplifiedOrders)}.${contextBlock} Devuelve JSON según la intención operativa.
1. 'expected_order': Si pide una orden específica por PO o cliente, incluye: po_number, client, product, status ('overdue'|'pending'|'delivered'|'critical'), delivery_progress, reason.
2. 'user_intent_summary': Frase muy corta en español.
3. 'action'='filter': filter_type ('overdue'|'delivered'|'pending'|'critical'|'all') o filter_client.
4. 'message': Respuesta muy corta en español (máx 10 palabras).`;

  const response = await generateContent({
    model: 'gemini-3.5-flash',
    contents: {
      parts: [
        ...inputParts,
        { text: basePrompt + (isRiskQuery
          ? " Esta es una consulta de riesgos. Debes responder action='focus' con una a tres POs reales del catálogo, ordenadas por prioridad. Cada risk_orders debe traer po_number y reason. No inventes datos. message será una sola frase breve con el hallazgo y la primera PO."
          : '') + instructions }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ['action', 'message'],
        properties: {
          transcript: { type: Type.STRING },
          po_number: { type: Type.STRING },
          action: { type: Type.STRING },
          filter_type: { type: Type.STRING },
          filter_client: { type: Type.STRING },
          message: { type: Type.STRING },
          user_intent_summary: { type: Type.STRING },
          risk_orders: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ['po_number', 'reason'],
              properties: {
                po_number: { type: Type.STRING },
                reason: { type: Type.STRING },
              },
            },
          },
          expected_order: {
            type: Type.OBJECT,
            properties: {
              po_number: { type: Type.STRING },
              client: { type: Type.STRING },
              product: { type: Type.STRING },
              status: { type: Type.STRING, enum: ['overdue', 'pending', 'delivered', 'critical'] },
              delivery_progress: { type: Type.STRING },
              reason: { type: Type.STRING }
            },
            required: ['po_number', 'client', 'product', 'status', 'delivery_progress', 'reason']
          }
        }
      }
    }
  }, 10000, 0);

  try {
    return JSON.parse(response.text || '{"po_number":null,"action":"answer","message":"No pude entender el comando."}') as VoiceCommandResponse;
  } catch {
    return { po_number: null, action: 'answer', message: 'No pude entender el comando.' };
  }
}

export const processTextVoiceCommand = async (
  transcript: string,
  activeOrders: OdooSaleOrder[],
  previousContext?: { transcript: string; message: string } | null,
) => {
  const isRiskQuery = isVoiceRiskQuestion(transcript);
  return executeVoiceCommand(
    `Eres el Asistente Operativo de la Planta. El operador dijo el siguiente comando por voz: "${transcript}". Analiza qué orden requiere, qué filtro o qué consulta realiza sobre las órdenes activas de producción.`,
    [],
    activeOrders,
    previousContext,
    isRiskQuery,
  );
};

export const processAudioVoiceCommand = async (
  audioBase64: string,
  mimeType: string,
  activeOrders: OdooSaleOrder[],
  previousContext?: { transcript: string; message: string } | null,
) => {
  return executeVoiceCommand(
    `Eres el Asistente Operativo de la Planta. Escucha atentamente el audio adjunto enviado por el operador de piso. Transcribe exactamente lo que dijo e interpreta qué orden de producción está solicitando o qué acción de filtrado pide ejecutar.`,
    [{ inlineData: { data: audioBase64, mimeType } }],
    activeOrders,
    previousContext
  );
};

export const generateSpeech = async (text: string) => {
  // TTS dedicado: gemini-3.1-flash-tts-preview (natural + steerable + streaming).
  // No usar gemini-3.5-flash — no emite audio.
  // Ruta completa heredada para el prefetch del acknowledgement y otros consumidores
  // existentes: timeout corto y sin reintentos para no dejar al operador esperando si
  // el modelo de TTS falla.
  const spoken = text.trim();
  const prompt = `Habla el siguiente texto en español mexicano claro, con una cadencia norteña cálida y sutil de Monterrey. Mantén un ritmo operativo directo y seguro. No uses jerga, estereotipos, pronunciación exagerada ni caricaturas. No leas estas instrucciones.\n\nTexto a decir:\n${spoken}`;

  const response = await generateContent({
    model: 'gemini-3.1-flash-tts-preview',
    contents: { parts: [{ text: prompt }] },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          // Sulafat = Warm — más natural que Kore (Firm) para anuncios en español
          prebuiltVoiceConfig: { voiceName: 'Sulafat' },
        },
      },
    },
  }, 12000, 0);
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};

const ttsCache = new Map<string, string>();
const TTS_CACHE_MAX = 50; // ponytail: FIFO eviction, no LRU — el TV corre días sin recargar,
// esto solo acota la memoria; si el tope de 50 empieza a desalojar frases que siguen en
// rotación activa, subir a una LRU real.

/** Envuelve generateSpeech() con memoización por texto exacto: cualquier mensaje que se
 * repita literalmente (fijo o coincidencia de conteo) evita una vuelta de red a Gemini TTS.
 * Solo se cachea audio exitoso — una falla transitoria no se queda "pegada" en el cache. */
export async function getSpokenAudio(text: string): Promise<string | undefined> {
  const cached = ttsCache.get(text);
  if (cached) return cached;
  const audio = await generateSpeech(text);
  if (audio) {
    if (ttsCache.size >= TTS_CACHE_MAX) {
      const oldestKey = ttsCache.keys().next().value;
      if (oldestKey !== undefined) ttsCache.delete(oldestKey);
    }
    ttsCache.set(text, audio);
  }
  return audio;
}
