/**
 * Validación tipada, inmutable y fail-fast de variables de entorno (Capa 1).
 * Compartida entre `server.ts` y `functions/src/index.ts` sin dependencias externas.
 */

export interface ServerEnvConfig {
  readonly ODOO_URL: string;
  readonly ODOO_DB: string;
  readonly ODOO_USERNAME: string;
  readonly ODOO_PASSWORD: string;
  readonly ODOO_PROXY_PORT: number;
  readonly APP_URL: string;
  readonly FIREBASE_API_KEY: string;
  readonly DEV_AUTH_BYPASS: boolean;
}

export interface FunctionsEnvConfig {
  readonly ODOO_URL: string;
  readonly ODOO_DB: string;
  readonly ODOO_USERNAME: string;
  readonly ODOO_PASSWORD: string;
  readonly GMAIL_USER: string;
  readonly GMAIL_APP_PASSWORD: string;
  readonly INVOICE_MAIL_TO: string;
  readonly INVOICE_MAIL_CC: string;
  readonly DISCORD_WEBHOOK_URL: string;
  readonly DISCORD_WEBHOOK_URL_CRITICOS: string;
  readonly DISCORD_WEBHOOK_URL_CRITICAS: string;
  readonly DISCORD_WEBHOOK_URL_REPORTES: string;
  readonly DISCORD_WEBHOOK_URL_FACTURACION: string;
  readonly DASHBOARD_URL: string;
  readonly STALL_THRESHOLD_DAYS: number;
  readonly DISCORD_LARGE_ORDER_LINES: number;
  readonly NOTIFICATIONS_ENABLED: boolean;
}

export interface ParsedEnvResult<T> {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly config: Readonly<T>;
}

const SECRET_KEYS = new Set([
  'ODOO_PASSWORD',
  'GMAIL_APP_PASSWORD',
  'FIREBASE_API_KEY',
  'DISCORD_WEBHOOK_URL',
  'DISCORD_WEBHOOK_URL_CRITICOS',
  'DISCORD_WEBHOOK_URL_CRITICAS',
  'DISCORD_WEBHOOK_URL_REPORTES',
  'DISCORD_WEBHOOK_URL_FACTURACION',
]);

const URL_KEYS = new Set([
  'ODOO_URL',
  'APP_URL',
  'DASHBOARD_URL',
]);

function readTrimmed(env: Record<string, string | undefined>, key: string): string {
  const raw = env[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

function parseOptionalHttpUrl(
  env: Record<string, string | undefined>,
  key: string,
  errors: string[],
  isSecret = false,
): string {
  const value = readTrimmed(env, key);
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      errors.push(`${key}: debe usar protocolo http:// o https://.`);
      return '';
    }
    return value;
  } catch {
    errors.push(isSecret ? `${key}: URL inválida (valor redactado).` : `${key}: URL inválida.`);
    return '';
  }
}

function parsePositiveInt(
  env: Record<string, string | undefined>,
  key: string,
  defaultValue: number,
  maxValue: number,
  errors: string[],
): number {
  const raw = readTrimmed(env, key);
  if (!raw) return defaultValue;
  if (!/^\d+$/.test(raw)) {
    errors.push(`${key}: debe ser un entero positivo.`);
    return defaultValue;
  }
  const num = Number(raw);
  if (!Number.isSafeInteger(num) || num < 1 || num > maxValue) {
    errors.push(`${key}: debe estar entre 1 y ${maxValue}.`);
    return defaultValue;
  }
  return num;
}

function parseStrictBoolean(
  env: Record<string, string | undefined>,
  key: string,
  defaultValue: boolean,
  errors: string[],
): boolean {
  const raw = readTrimmed(env, key);
  if (!raw) return defaultValue;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  errors.push(`${key}: solo admite 'true' o 'false'.`);
  return defaultValue;
}

export function parseServerEnv(
  env: Record<string, string | undefined>,
): ParsedEnvResult<ServerEnvConfig> {
  const errors: string[] = [];
  const config: ServerEnvConfig = Object.freeze({
    ODOO_URL: parseOptionalHttpUrl(env, 'ODOO_URL', errors),
    ODOO_DB: readTrimmed(env, 'ODOO_DB'),
    ODOO_USERNAME: readTrimmed(env, 'ODOO_USERNAME'),
    ODOO_PASSWORD: readTrimmed(env, 'ODOO_PASSWORD'),
    ODOO_PROXY_PORT: parsePositiveInt(env, 'ODOO_PROXY_PORT', 3001, 65535, errors),
    APP_URL: parseOptionalHttpUrl(env, 'APP_URL', errors),
    FIREBASE_API_KEY: readTrimmed(env, 'FIREBASE_API_KEY'),
    DEV_AUTH_BYPASS: parseStrictBoolean(env, 'DEV_AUTH_BYPASS', false, errors),
  });

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    config,
  });
}

export function parseFunctionsEnv(
  env: Record<string, string | undefined>,
): ParsedEnvResult<FunctionsEnvConfig> {
  const errors: string[] = [];
  const config: FunctionsEnvConfig = Object.freeze({
    ODOO_URL: parseOptionalHttpUrl(env, 'ODOO_URL', errors),
    ODOO_DB: readTrimmed(env, 'ODOO_DB'),
    ODOO_USERNAME: readTrimmed(env, 'ODOO_USERNAME'),
    ODOO_PASSWORD: readTrimmed(env, 'ODOO_PASSWORD'),
    GMAIL_USER: readTrimmed(env, 'GMAIL_USER'),
    GMAIL_APP_PASSWORD: readTrimmed(env, 'GMAIL_APP_PASSWORD'),
    INVOICE_MAIL_TO: readTrimmed(env, 'INVOICE_MAIL_TO'),
    INVOICE_MAIL_CC: readTrimmed(env, 'INVOICE_MAIL_CC'),
    DISCORD_WEBHOOK_URL: parseOptionalHttpUrl(env, 'DISCORD_WEBHOOK_URL', errors, true),
    DISCORD_WEBHOOK_URL_CRITICOS: parseOptionalHttpUrl(env, 'DISCORD_WEBHOOK_URL_CRITICOS', errors, true),
    DISCORD_WEBHOOK_URL_CRITICAS: parseOptionalHttpUrl(env, 'DISCORD_WEBHOOK_URL_CRITICAS', errors, true),
    DISCORD_WEBHOOK_URL_REPORTES: parseOptionalHttpUrl(env, 'DISCORD_WEBHOOK_URL_REPORTES', errors, true),
    DISCORD_WEBHOOK_URL_FACTURACION: parseOptionalHttpUrl(env, 'DISCORD_WEBHOOK_URL_FACTURACION', errors, true),
    DASHBOARD_URL: parseOptionalHttpUrl(env, 'DASHBOARD_URL', errors),
    STALL_THRESHOLD_DAYS: parsePositiveInt(env, 'STALL_THRESHOLD_DAYS', 3, 365, errors),
    DISCORD_LARGE_ORDER_LINES: parsePositiveInt(env, 'DISCORD_LARGE_ORDER_LINES', 5, 500, errors),
    NOTIFICATIONS_ENABLED: parseStrictBoolean(env, 'NOTIFICATIONS_ENABLED', true, errors),
  });

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    config,
  });
}

function safeOriginOnly(rawUrl: string): string {
  if (!rawUrl) return '(vacío)';
  try {
    const u = new URL(rawUrl);
    u.username = '';
    u.password = '';
    return u.toString();
  } catch {
    return '[URL_INVALIDA]';
  }
}

export function redactEnvSummary(
  config: ServerEnvConfig | FunctionsEnvConfig,
): Record<string, string | number | boolean> {
  const summary: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SECRET_KEYS.has(key)) {
      summary[key] = typeof value === 'string' && value.length > 0 ? '[REDACTED]' : '(vacío)';
    } else if (URL_KEYS.has(key) && typeof value === 'string') {
      summary[key] = safeOriginOnly(value);
    } else if (typeof value === 'string') {
      summary[key] = value || '(vacío)';
    } else {
      summary[key] = value;
    }
  }
  return summary;
}
