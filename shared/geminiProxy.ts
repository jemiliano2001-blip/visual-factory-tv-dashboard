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

class GeminiTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new GeminiTimeoutError(`Gemini no respondió en ${ms}ms`)), ms);
    promise
      .then(value => { clearTimeout(timer); resolve(value); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

/** Duck-types the SDK's ApiError shape without importing @google/genai — root and
 * functions/ pin different major versions of that package. */
function hasNumericStatus(err: unknown): err is { status: number } {
  return typeof err === 'object' && err !== null && typeof (err as { status?: unknown }).status === 'number';
}

export async function runGeminiGenerate(
  generate: GeminiGenerateFn,
  body: GeminiGenerateBody,
  timeoutMs = 30000,
): Promise<GeminiGenerateResult> {
  const validated = validateGeminiGenerateBody(body);
  if (validated.ok === false) {
    return { ok: false, status: validated.status, error: validated.error };
  }

  try {
    const response = await withTimeout(
      generate(validated.model, validated.contents, validated.config),
      timeoutMs,
    );
    return {
      ok: true,
      payload: {
        text: response.text,
        candidates: response.candidates,
      },
    };
  } catch (err) {
    if (err instanceof GeminiTimeoutError) {
      return { ok: false, status: 504, error: err.message };
    }
    const status = hasNumericStatus(err) ? err.status : 500;
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, status, error };
  }
}
