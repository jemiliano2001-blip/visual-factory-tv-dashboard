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

async function executeVoiceCommand(
  basePrompt: string,
  inputParts: GeminiContentPart[],
  activeOrders: OdooSaleOrder[],
  previousContext?: { transcript: string; message: string } | null
): Promise<VoiceCommandResponse> {
  const simplifiedOrders = activeOrders.map(o => ({
    po: formatPONumber(o.name),
    client: o.partner_name,
    part: o.main_product,
    priority: getOrderPriority(o),
    progress: `${o.qty_delivered}/${o.qty_total}`,
    porcentaje_entrega: `${getDeliveryProgress(o)}%`,
    fecha_creacion: parseOdooDate(o.date_order)?.toISOString().split('T')[0] ?? null,
    fecha_promesa: parseOdooDate(o.commitment_date)?.toISOString().split('T')[0] ?? null,
    vencida: isOrderOverdue(o) ? 'SÍ' : 'NO'
  }));

  const contextBlock = previousContext
    ? `\n\nTURNO ANTERIOR (contexto conversacional): el operador dijo "${previousContext.transcript}" y tú respondiste "${previousContext.message}". Si la instrucción actual es un seguimiento (ej. "¿y las de Bosch?", "ahora las vencidas"), interprétala en relación a este turno.`
    : '';

  const instructions = ` Catálogo de órdenes activas en piso: ${JSON.stringify(simplifiedOrders)}.${contextBlock} Devuelve un objeto JSON estructurado según la intención operativa del operador.

INSTRUCCIONES CLAVE DE NEGOCIO Y PRODUCCIÓN:
1. ORDEN ESPERADA / IDENTIFICADA ('expected_order'): Si el operador pregunta o hace referencia a una orden específica (por PO, cliente o estado de retraso), identifica exactamente cuál es la orden esperada. Incluye:
   - 'po_number': El número PO exacto (ej. "2026/S00546").
   - 'client': Nombre del cliente.
   - 'product': Nombre de la parte o producto principal.
   - 'status': Estado ('overdue', 'pending', 'delivered', 'critical').
   - 'delivery_progress': Avance de piezas (ej. "12/20 (60%)").
   - 'reason': Explicación ultra-corta en español de por qué esta es la orden esperada (ej. "Orden con mayor atraso respecto a fecha compromiso").
2. SÍNTESIS DE INTENCIÓN ('user_intent_summary'): Una frase muy corta en español que describa qué está pidiendo el operador (ej. "Buscando la orden con mayor retraso de cliente Bosch", "Filtrando órdenes vencidas").
3. ACCIONES DE FILTRADO ('action' = 'filter'):
   - Si el operador dice "muéstrame las vencidas", "cuáles están pendientes", etc., asigna action="filter" y 'filter_type' ('overdue', 'delivered', 'pending', 'critical', 'all').
   - Si especifica un cliente ("las de Nissan"), asigna 'filter_client'.
4. NÚMERO PO: Si menciona dígitos como "546", busca en el catálogo el PO correspondiente con formato estándar YYYY/SXXXXX.
5. MENSAJE HABLADO ('message'): Respuesta natural y concisa para voz (máximo 12 palabras). Ejemplo: "Orden 546 seleccionada, avance del 60%", "Filtrando 4 órdenes vencidas".`;

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
          transcript: { type: Type.STRING, description: "Transcripción literal en español de lo que dijo el operador" },
          po_number: { type: Type.STRING, description: "Número PO a resaltar si aplica" },
          action: { type: Type.STRING, description: "Acción: 'highlight', 'filter', o 'answer'" },
          filter_type: { type: Type.STRING, description: "Filtro: 'all', 'overdue', 'delivered', 'pending', 'critical'" },
          filter_client: { type: Type.STRING, description: "Nombre de cliente si se filtra por cliente" },
          message: { type: Type.STRING, description: "Respuesta corta hablada en español para el operador" },
          user_intent_summary: { type: Type.STRING, description: "Síntesis corta de lo que el operador está pidiendo" },
          expected_order: {
            type: Type.OBJECT,
            description: "Información detallada de la orden esperada/encontrada",
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
  }, 15000, 0);

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
