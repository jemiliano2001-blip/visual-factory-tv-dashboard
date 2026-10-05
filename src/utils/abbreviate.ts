// ─── Diccionario de abreviaciones comunes en español (manufactura) ──────────
// Re-exporta la lógica pura compartida desde shared/smartText para reutilización
// entre el frontend (SmartText, reportes impresos) y el backend/Cloud Functions (notificaciones).
export {
  ABBREVIATIONS,
  FILLER_WORDS,
  generateTextLevels,
  abbreviate,
  generateOrderSmartSummary,
  extractAssignedEngineer,
  sanitizeOdooHtml,
  type OrderTextSource,
} from '../../shared/smartText';
