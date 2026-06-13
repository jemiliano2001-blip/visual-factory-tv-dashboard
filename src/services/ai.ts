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
    model: 'gemini-2.0-flash',
    contents: `You are a manufacturing plant manager. Analyze the following Odoo sale orders pending invoicing and provide a brief executive summary of the current state: highlight overdue orders, clients with the largest backlog, total pending amount, and overall delivery progress. Use markdown. RESPOND IN SPANISH.\n\nOrders: ${JSON.stringify(orders.map(simplifyOrder))}`,
  });
  return response.text;
};

export const generateClientReport = async (order: OdooSaleOrder) => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `Draft a professional, concise email in SPANISH to the client (${order.partner_name}) updating them on sale order ${order.name} for "${order.main_product}". Delivery progress is ${order.qty_delivered}/${order.qty_total} units${order.commitment_date ? `, committed delivery date is ${order.commitment_date}` : ''}. Total amount: ${order.amount_total} ${order.currency}.`,
  });
  return response.text;
};

export const analyzeOrderAnomalies = async (orders: OdooSaleOrder[]) => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `You are a manufacturing operations analyst. Analyze this set of Odoo sale orders pending invoicing and identify anomalies and red flags: overdue orders with 0% delivery, unusually large or stale orders, clients accumulating backlog, orders without commitment date. Be brief and actionable, use markdown bullet points. RESPOND IN SPANISH.\n\nOrders: ${JSON.stringify(orders.map(simplifyOrder))}`,
  });
  return response.text;
};

export const predictOrderRisk = async (order: OdooSaleOrder): Promise<RiskPrediction> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
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
    /* malformed JSON — los campos de RiskPrediction quedarán undefined */
  }
  return {
    ...result,
    analyzedAt: new Date(result.analyzedAt || Date.now())
  };
};

export const filterOrdersByNaturalLanguage = async (query: string, orders: OdooSaleOrder[]): Promise<number[]> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
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
    model: 'gemini-2.0-flash',
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
        required: ['action', 'message'],
        properties: {
          po_number: { type: Type.STRING, description: "The PO number to highlight or complete, if applicable" },
          action: { type: Type.STRING, description: "The action: 'highlight', 'complete', 'filter', or 'answer'" },
          filter_type: { type: Type.STRING, description: "If action is filter: 'all', 'overdue', 'delivered', 'pending'" },
          message: { type: Type.STRING, description: "Conversational response in Spanish to speak to the user" }
        }
      }
    }
  });
  try {
    return JSON.parse(response.text || '{}');
  } catch {
    return { po_number: null, action: 'answer', message: 'No pude entender el comando.' };
  }
};

export const generateSpeech = async (text: string) => {
  const response = await ai.models.generateContent({
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
