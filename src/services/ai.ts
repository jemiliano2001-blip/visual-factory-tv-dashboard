import { GoogleGenAI, Type, Modality } from '@google/genai';
import type { RiskPrediction } from '../components/admin/riskTypes';
import { formatPONumber } from '../utils/formatters';
import { OdooSaleOrder, getOrderPriority, isOrderOverdue, getDeliveryProgress, parseOdooDate } from './odoo';

export type { RiskPrediction };

// Use the platform-injected API key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

export const generateShiftSummary = async (orders: OdooSaleOrder[]) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: `You are a manufacturing plant manager. Analyze the following Odoo sale orders pending invoicing and provide a brief executive summary of the current state: highlight overdue orders, clients with the largest backlog, total pending amount, and overall delivery progress. Use markdown. RESPOND IN SPANISH.\n\nOrders: ${JSON.stringify(orders.map(simplifyOrder))}`,
  });
  return response.text;
};

export const generateClientReport = async (order: OdooSaleOrder) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: `Draft a professional, concise email in SPANISH to the client (${order.partner_name}) updating them on sale order ${order.name} for "${order.main_product}". Delivery progress is ${order.qty_delivered}/${order.qty_total} units${order.commitment_date ? `, committed delivery date is ${order.commitment_date}` : ''}. Total amount: ${order.amount_total} ${order.currency}.`,
  });
  return response.text;
};

export const analyzeOrderAnomalies = async (orders: OdooSaleOrder[]) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: `You are a manufacturing operations analyst. Analyze this set of Odoo sale orders pending invoicing and identify anomalies and red flags: overdue orders with 0% delivery, unusually large or stale orders, clients accumulating backlog, orders without commitment date. Be brief and actionable, use markdown bullet points. RESPOND IN SPANISH.\n\nOrders: ${JSON.stringify(orders.map(simplifyOrder))}`,
  });
  return response.text;
};

export const predictOrderRisk = async (order: OdooSaleOrder): Promise<RiskPrediction> => {
  const response = await ai.models.generateContent({
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

  let result: any = {};
  try {
    result = JSON.parse(response.text || '{}');
  } catch {
    throw new Error('La IA devolvió una respuesta no válida');
  }
  return {
    ...result,
    analyzedAt: new Date(result.analyzedAt || Date.now())
  };
};

export const filterOrdersByNaturalLanguage = async (query: string, orders: OdooSaleOrder[]): Promise<number[]> => {
  const response = await ai.models.generateContent({
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
    return [];
  }
};

export const processVoiceCommand = async (
  audioBase64: string,
  mimeType: string,
  activeOrders: OdooSaleOrder[],
  previousContext?: { transcript: string; message: string } | null,
) => {
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

  const contextBlock = previousContext
    ? `\n\nPREVIOUS TURN (for follow-up context): the operator said "${previousContext.transcript}" and you replied "${previousContext.message}". If the current command is a follow-up (e.g. "¿y las de Bosch?", "ahora las vencidas"), interpret it relative to this previous turn.`
    : '';

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: {
      parts: [
        { inlineData: { data: audioBase64, mimeType } },
        { text: `Listen to the audio command in SPANISH. The user is a factory operator talking to you, their AI assistant. They might ask to highlight/find a specific order, filter the view (by status, by client, or by priority), or ask a general question about the active orders. Active orders data: ${JSON.stringify(simplifiedOrders)}.${contextBlock} Return a JSON object with 'transcript' (the literal transcription in SPANISH of what the operator said), 'po_number' (the matched PO exactly as it appears, or null), 'action' ('highlight', 'filter', or 'answer'), 'filter_type' ('all', 'overdue', 'delivered', 'pending', 'critical', or null), 'filter_client' (a client name to filter by, or null), and 'message' (a natural, helpful, conversational response in SPANISH to speak back to the user).

IMPORTANT INSTRUCTIONS:
1. DELAY LOGIC: Use 'fecha_promesa' (commitment/delivery date) and 'vencida' to determine if an order is delayed/vencida. If the user asks for the oldest or most delayed order, find the one with the oldest 'fecha_promesa' or 'fecha_creacion' that is incomplete. Do NOT rely just on the PO number.
2. FILTER ACTION: If the user says "muéstrame las vencidas", "filtra las entregadas", "cuáles están pendientes", etc., return action="filter" and set 'filter_type' to 'overdue', 'delivered', or 'pending' accordingly. If they ask for "las críticas", "las urgentes" or high-priority orders, set 'filter_type' to 'critical'. If they say "limpia el filtro" or "muestra todas", set 'filter_type' to 'all'.
3. CLIENT FILTER: If the user asks to filter by a client/customer (e.g. "muéstrame las de Bosch", "filtra por cliente Nissan"), return action="filter" and set 'filter_client' to that client's name. You may combine 'filter_client' with a 'filter_type'.
4. PO FORMATTING NOTE: Some POs might look like "546" or "5460" (4 digits) but should be interpreted as part of the sequence. The standard format is "2026/S00546" (5 digits padded with zeros).
5. If you find a specific order, mention its PO number in the 'message'.
6. Keep the 'message' very short, direct, and concise to ensure fast processing.` }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ['action', 'message'],
        properties: {
          transcript: { type: Type.STRING, description: "Literal transcription in Spanish of what the operator said" },
          po_number: { type: Type.STRING, description: "The PO number to highlight, if applicable" },
          action: { type: Type.STRING, description: "The action: 'highlight', 'filter', or 'answer'" },
          filter_type: { type: Type.STRING, description: "If action is filter: 'all', 'overdue', 'delivered', 'pending', 'critical'" },
          filter_client: { type: Type.STRING, description: "If filtering by client/customer: the client name, otherwise null" },
          message: { type: Type.STRING, description: "Conversational response in Spanish to speak to the user" }
        }
      }
    }
  });
  try {
    return JSON.parse(response.text || '{"po_number":null,"action":"answer","message":"No pude entender el comando."}');
  } catch {
    return { po_number: null, action: 'answer', message: 'No pude entender el comando.' };
  }
};

export const generateSpeech = async (text: string) => {
  const response = await ai.models.generateContent({
    // TTS requiere un modelo dedicado de audio: un flash de texto (gemini-3.5-flash)
    // NO produce audio y deja la respuesta sin voz. No cambiar a un modelo de texto.
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};
