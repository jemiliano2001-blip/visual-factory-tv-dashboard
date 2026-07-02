export const ALLOWED_AI_MODELS = new Set(['gemini-3.5-flash', 'gemini-2.5-flash-preview-tts']);

export interface GeminiGenerateBody {
  model?: string;
  contents?: unknown;
  config?: Record<string, unknown>;
}

export type GeminiGenerateValidation =
  | { ok: true; model: string; contents: unknown; config?: Record<string, unknown> }
  | { ok: false; status: number; error: string };

export type GeminiGenerateResult =
  | { ok: false; status: number; error: string }
  | { ok: true; payload: { text?: string; candidates?: unknown } };

type GeminiGenerateFn = (
  model: string,
  contents: unknown,
  config?: Record<string, unknown>,
) => Promise<{ text?: string; candidates?: unknown }>;

export function validateGeminiGenerateBody(body: GeminiGenerateBody): GeminiGenerateValidation {
  const { model, contents, config } = body;
  if (!model || contents === undefined || contents === null) {
    return { ok: false, status: 400, error: 'Faltan parámetros: model y contents son requeridos.' };
  }
  if (!ALLOWED_AI_MODELS.has(model)) {
    return { ok: false, status: 400, error: `Modelo no permitido: ${model}` };
  }
  return { ok: true, model, contents, config };
}

export async function runGeminiGenerate(
  generate: GeminiGenerateFn,
  body: GeminiGenerateBody,
): Promise<GeminiGenerateResult> {
  const validated = validateGeminiGenerateBody(body);
  if (validated.ok === false) {
    return { ok: false, status: validated.status, error: validated.error };
  }
  const response = await generate(validated.model, validated.contents, validated.config);
  return {
    ok: true,
    payload: {
      text: response.text,
      candidates: response.candidates,
    },
  };
}
