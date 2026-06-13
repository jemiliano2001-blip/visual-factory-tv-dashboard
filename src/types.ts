export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface CompanyConfig {
  id?: string;
  company_name: string;
  delivery_schedule: string; // e.g., "Lunes a Viernes: 08:00 - 17:00"
  updatedAt: Date;
}

// ─── Odoo ─────────────────────────────────────────────────────────────────────
// Re-exportado desde src/services/odoo.ts para uso global
export type { OdooSaleOrder, OdooOrderLine, OdooConnectionStatus, OdooOrdersResponse } from './services/odoo';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}
