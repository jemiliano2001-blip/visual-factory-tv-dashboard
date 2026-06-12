export type Priority = 'low' | 'normal' | 'high' | 'critical';
export type Status = 'scheduled' | 'production' | 'quality' | 'hold';

export interface WorkOrder {
  id?: string;
  company_name: string;
  po_number: string;
  part_name: string;
  quantity_total: number;
  quantity_completed: number;
  priority: Priority;
  status: Status;
  createdAt: Date;
  updatedAt: Date;
  delivery_date?: Date;
  prediction?: {
    risk_level: 'low' | 'medium' | 'high';
    issue: string;
    suggestion: string;
    analyzedAt: Date;
  };
}

export type ActionType = 'created' | 'updated' | 'deleted';

export interface WorkOrderHistory {
  id?: string;
  work_order_id: string;
  action: ActionType;
  previous_state: Partial<WorkOrder> | null;
  new_state: Partial<WorkOrder> | null;
  changed_by: string;
  changed_at: Date;
}

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
