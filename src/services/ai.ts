import { GoogleGenAI, Type, Modality } from '@google/genai';
import { WorkOrder, WorkOrderHistory } from '../types';
import { formatPONumber } from '../utils/formatters';

// Use the platform-injected API key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const generateShiftSummary = async (orders: WorkOrder[]) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: `You are a manufacturing plant manager. Analyze the following work orders and provide a brief executive summary of the current shift. Highlight bottlenecks, critical orders, and overall progress. Use markdown. RESPOND IN SPANISH.\n\nOrders: ${JSON.stringify(orders)}`,
  });
  return response.text;
};

export const generateClientReport = async (order: WorkOrder) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: `Draft a professional, concise email in SPANISH to the client (${order.company_name}) updating them on PO ${order.po_number} for part ${order.part_name}. Current status is ${order.status}, progress is ${order.quantity_completed}/${order.quantity_total}.`,
  });
  return response.text;
};

export const analyzeOrderAnomalies = async (order: WorkOrder, history: WorkOrderHistory[]) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: `Analyze this history log for work order ${order.po_number} (${order.part_name}). Identify any anomalies, inefficiencies, or red flags (e.g., bouncing between quality and production, sitting on hold too long). Keep it brief and actionable. RESPOND IN SPANISH.\n\nHistory: ${JSON.stringify(history)}`,
  });
  return response.text;
};

export const predictOrderRisk = async (order: WorkOrder, history: WorkOrderHistory[]) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: `You are a manufacturing predictive maintenance AI. Analyze the current status, priority, and historical data for work order ${order.po_number} (${order.part_name}). Predict potential future issues or delays. 
    Current Status: ${order.status}
    Priority: ${order.priority}
    Progress: ${order.quantity_completed}/${order.quantity_total}
    Delivery Date: ${order.delivery_date ? order.delivery_date.toISOString() : 'Not set'}
    History: ${JSON.stringify(history)}
    
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

export const filterOrdersByNaturalLanguage = async (query: string, orders: WorkOrder[]) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: `Given the following JSON list of work orders and a user query in SPANISH, return a JSON array of the 'id's of the work orders that match the query. Query: "${query}". Orders: ${JSON.stringify(orders)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });
  return JSON.parse(response.text || '[]');
};

export const processVoiceCommand = async (audioBase64: string, mimeType: string, activeOrders: WorkOrder[]) => {
  const simplifiedOrders = activeOrders.map(o => {
    const isOverdue = o.delivery_date && new Date(o.delivery_date) < new Date();
    return {
      po: formatPONumber(o.po_number),
      client: o.company_name,
      part: o.part_name,
      status: o.status,
      priority: o.priority,
      progress: `${o.quantity_completed}/${o.quantity_total}`,
      fecha_creacion: o.createdAt instanceof Date ? o.createdAt.toISOString().split('T')[0] : o.createdAt,
      fecha_promesa: o.delivery_date instanceof Date ? o.delivery_date.toISOString().split('T')[0] : o.delivery_date,
      vencida: isOverdue ? 'SÍ' : 'NO'
    };
  });

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

export const analyzeImage = async (base64Image: string, mimeType: string, prompt: string) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType } },
        { text: `Analiza esta imagen desde la perspectiva de un supervisor de fábrica. El usuario pregunta: "${prompt}". Responde de forma técnica, profesional y concisa en ESPAÑOL.` }
      ]
    }
  });
  return response.text;
};

export const generateVisualAid = async (prompt: string, aspectRatio: string = "16:9") => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [
        { text: `Manufacturing safety poster or technical visualization: ${prompt}. High quality, industrial style, professional.` }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio as any,
        imageSize: "1K"
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
};

export const extractOrdersFromFile = async (fileContent: string) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `You are a data extraction assistant for a manufacturing plant. Extract a list of work orders from the following raw text/CSV data. 
    Return a JSON array of objects. Each object must have the following properties:
    - po_number (string)
    - company_name (string)
    - part_name (string)
    - quantity_total (number)
    - quantity_completed (number)
    - priority (string: 'low', 'normal', 'high', or 'critical')
    - status (string: 'scheduled', 'production', 'quality', or 'hold')
    - createdAt (string: ISO 8601 date format if possible, or original string)
    - delivery_date (string: ISO 8601 date format if possible, or original string)
    
    Mapping instructions:
    - "Referencia de la orden" -> po_number
    - "Cliente" -> company_name
    - "Descripción" -> part_name
    - "Cantidad" -> quantity_total
    - "Cantidad entregada" -> quantity_completed
    - "Creado el" -> createdAt
    - "Fecha de entrega" or "Promesa" -> delivery_date
    
    If priority is missing or unclear, default to 'normal'.
    If status is missing or unclear, default to 'scheduled'.
    If quantity_total is missing, default to 100.
    If quantity_completed is missing, default to 0.
    
    Raw Data:
    ${fileContent}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            po_number: { type: Type.STRING },
            company_name: { type: Type.STRING },
            part_name: { type: Type.STRING },
            quantity_total: { type: Type.NUMBER },
            quantity_completed: { type: Type.NUMBER },
            priority: { type: Type.STRING },
            status: { type: Type.STRING },
            createdAt: { type: Type.STRING }
          },
          required: ["po_number", "company_name", "part_name", "quantity_total", "quantity_completed", "priority", "status"]
        }
      }
    }
  });
  return JSON.parse(response.text || '[]');
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
