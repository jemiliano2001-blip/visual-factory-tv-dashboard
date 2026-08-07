import type { RiskPrediction } from '../components/admin/riskTypes';
import { formatPONumber } from '../utils/formatters';
import { OdooSaleOrder, getOrderPriority, isOrderOverdue, getDeliveryProgress, parseOdooDate } from './odoo';
import { getIdTokenOrThrow } from '../firebase';

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
  items?: { type: string };
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
  action: 'highlight' | 'filter' | 'answer';
  filter_type?: 'all' | 'overdue' | 'delivered' | 'pending' | 'critical' | null;
  filter_client?: string | null;
  message: string;
  user_intent_summary?: string;
  expected_order?: ExpectedOrderInfo | null;
}

/**
 * Intenta procesar el comando de voz localmente en < 5ms mediante coincidencia de patrones.
 * Si encuentra una intención clara (PO específico, filtro de estado, filtro de cliente, limpiar),
 * retorna un VoiceCommandResponse inmediato sin realizar llamadas de red.
 * Retorna null si la instrucción requiere análisis complejo por IA.
 */
export function tryLocalFastVoiceCommand(
  transcript: string,
  activeOrders: OdooSaleOrder[]
): VoiceCommandResponse | null {
  const text = transcript.trim().toLowerCase();
  if (!text) return null;

  // 1. Limpiar / Restablecer filtros
  if (/^(limpiar|restablecer|quitar filtro[s]?|mostrar todo[s]?|ver todo[s]?)$/i.test(text)) {
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

  // 2. Filtros por estado
  if (/(vencida[s]?|atrasada[s]?|retrasada[s]?)/i.test(text)) {
    return {
      transcript,
      po_number: null,
      action: 'filter',
      filter_type: 'overdue',
      filter_client: null,
      message: 'Filtrando órdenes vencidas.',
      user_intent_summary: 'Filtrando órdenes atrasadas/vencidas',
    };
  }

  if (/(entregada[s]?|completada[s]?|terminada[s]?)/i.test(text)) {
    return {
      transcript,
      po_number: null,
      action: 'filter',
      filter_type: 'delivered',
      filter_client: null,
      message: 'Filtrando órdenes entregadas.',
      user_intent_summary: 'Filtrando órdenes entregadas',
    };
  }

  if (/(pendiente[s]?|en proceso|activas)/i.test(text) && !/cliente|orden/i.test(text)) {
    return {
      transcript,
      po_number: null,
      action: 'filter',
      filter_type: 'pending',
      filter_client: null,
      message: 'Filtrando órdenes pendientes.',
      user_intent_summary: 'Filtrando órdenes pendientes',
    };
  }

  if (/(critica[s]?|urgente[s]?)/i.test(text)) {
    return {
      transcript,
      po_number: null,
      action: 'filter',
      filter_type: 'critical',
      filter_client: null,
      message: 'Filtrando órdenes críticas.',
      user_intent_summary: 'Filtrando órdenes críticas',
    };
  }

  // 3. Búsqueda directa por PO (dígitos como "546", "orden 546", "po 546", "2026/S00546", "s00546")
  const poMatch = text.match(/(?:orden|po|número|no\.?|s)?\s*([0-9]{3,6})/i) || text.match(/([0-9]{4}\/s[0-9]{5})/i);
  if (poMatch && poMatch[1]) {
    const rawNumber = poMatch[1].trim();
    // Buscar en el catálogo activo
    const matchedOrder = activeOrders.find(o => {
      const formatted = formatPONumber(o.name);
      return formatted.endsWith(rawNumber) || o.name.includes(rawNumber);
    });

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

  // 4. Filtro por Cliente (ej. "las de Nissan", "cliente Bosch", "filtra Tremec")
  const clientMatch = text.match(/(?:las de|del cliente|cliente|filtra[r]? por|de)\s+([a-záéíóúñ0-9\s]+)/i);
  if (clientMatch && clientMatch[1]) {
    const queryClient = clientMatch[1].trim();
    if (queryClient.length >= 3) {
      const uniqueClients = Array.from(new Set(activeOrders.map(o => o.partner_name)));
      const matchedClient = uniqueClients.find(c =>
        c.toLowerCase().includes(queryClient) || queryClient.includes(c.toLowerCase())
      );

      if (matchedClient) {
        return {
          transcript,
          po_number: null,
          action: 'filter',
          filter_client: matchedClient,
          message: `Filtrando órdenes del cliente ${matchedClient}.`,
          user_intent_summary: `Filtrando órdenes de cliente ${matchedClient}`,
        };
      }
    }
  }

  return null;
}

/**
 * Emite una respuesta de voz inmediata usando la síntesis nativa del navegador (Web Speech API)
 * sin latencia de red. Retorna true si tuvo éxito.
 */
export function speakFastLocal(text: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-MX';
    utterance.rate = 1.05;
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
  previousContext?: { transcript: string; message: string } | null
): Promise<VoiceCommandResponse> {
  const simplifiedOrders = activeOrders.map(o => ({
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
        { text: basePrompt + instructions }
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
  return executeVoiceCommand(
    `Eres el Asistente Operativo de la Planta. El operador dijo el siguiente comando por voz: "${transcript}". Analiza qué orden requiere, qué filtro o qué consulta realiza sobre las órdenes activas de producción.`,
    [],
    activeOrders,
    previousContext
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
  const spoken = text.trim();
  const prompt = [
    'Habla en español mexicano claro y natural, tono cálido y profesional,',
    'ritmo calmado y firme para un anuncio corto en piso de fábrica.',
    'No inventes texto ni leas estas instrucciones en voz alta.',
    '',
    'Texto a decir:',
    spoken,
  ].join('\n');

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
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};
