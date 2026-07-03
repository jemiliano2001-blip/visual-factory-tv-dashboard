export interface OdooClientConfig {
  url: string;
  db: string;
  username: string;
  password: string;
}

interface OdooSession {
  uid: number;
  sessionId: string;
}

class OdooSessionExpiredError extends Error {}

interface RawLine {
  id: number;
  name: string;
  display_type: string | false;
  product_uom_qty: number;
  qty_delivered: number;
}

interface RawOrder {
  id: number;
  name: string;
  client_order_ref?: string | false;
  partner_id: [number, string] | false;
  date_order: string;
  commitment_date: string | false;
  invoice_status: string;
  currency_id: [number, string] | false;
  order_line: number[];
  state: string;
  user_id: [number, string] | false;
  note: string | false;
}

interface RawPicking {
  name: string;
  origin: string | false;
  state: string;
  date_done: string | false;
}

interface RawMove {
  sale_line_id: [number, string] | false;
  quantity_done: number;
}

export interface NormalizedInvoiceableOrder {
  id: number;
  name: string;
  customer_reference: string | null;
  partner_name: string;
  main_product: string;
  date_order: string;
  commitment_date: string | null;
  invoice_status: string;
  currency: string;
  qty_total: number;
  qty_delivered: number;
  state: string;
  salesperson: string | null;
  note: string | null;
  lines_count: number;
  lines: Array<{ name: string; qty: number; delivered: number }>;
  deliveries: Array<{ name: string; state: string; date_done: string | null }>;
}

export interface NormalizedOrderReport {
  id: number;
  reference: string;
  customerReference: string | null;
  customerName: string;
  createdAt: string;
  quantity: number;
  description: string;
  terms: string | null;
  lines: Array<{ name: string; qty: number }>;
}

export class OdooClient {
  private readonly url: string;
  private readonly db: string;
  private readonly username: string;
  private readonly password: string;
  private sessionPromise: Promise<OdooSession> | null = null;
  private reauthing: Promise<OdooSession> | null = null;

  constructor(config: OdooClientConfig) {
    this.url = config.url.replace(/\/$/, '');
    this.db = config.db;
    this.username = config.username;
    this.password = config.password;
  }

  isConfigured(): boolean {
    return Boolean(this.url && this.db && this.username && this.password);
  }

  getConfiguredUrl(): string {
    return this.url;
  }

  async getSession(forceNew = false): Promise<OdooSession> {
    if (forceNew || !this.sessionPromise) {
      this.sessionPromise = this.authenticate().catch(err => {
        this.sessionPromise = null;
        throw err;
      });
    }
    return this.sessionPromise;
  }

  private async authenticate(): Promise<OdooSession> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${this.url}/web/session/authenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          id: 1,
          params: { db: this.db, login: this.username, password: this.password },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Error de autenticación HTTP: ${response.status}`);
      }
      const json = (await response.json()) as {
        result?: { uid: number | false };
        error?: { message: string };
      };
      if (json.error) {
        throw new Error(`Error de autenticación: ${json.error.message}`);
      }
      const uid = json.result?.uid;
      if (!uid) {
        throw new Error('Credenciales de Odoo incorrectas (uid es false)');
      }
      const sessionId = response.headers.get('set-cookie')?.match(/session_id=([^;]+)/)?.[1] ?? '';
      if (!sessionId) {
        console.warn('[Odoo] No se encontró session_id en la respuesta. Las llamadas RPC pueden fallar.');
      }
      return { uid, sessionId };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async odooRpc<T>(
    session: OdooSession,
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${this.url}/web/dataset/call_kw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session.sessionId ? { Cookie: `session_id=${session.sessionId}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          id: Math.floor(Math.random() * 100000),
          params: { model, method, args, kwargs },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Odoo HTTP error: ${response.status} ${response.statusText}`);
      }
      const json = (await response.json()) as {
        result?: T;
        error?: { code?: number; message: string; data?: { message?: string; name?: string } };
      };
      if (json.error) {
        const msg = json.error.data?.message || json.error.message || 'Error desconocido de Odoo';
        if (json.error.code === 100 || json.error.data?.name === 'odoo.http.SessionExpiredException') {
          throw new OdooSessionExpiredError(msg);
        }
        throw new Error(`Odoo RPC Error: ${msg}`);
      }
      return json.result as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async odooCall<T>(
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    try {
      return await this.odooRpc<T>(await this.getSession(), model, method, args, kwargs);
    } catch (err) {
      if (!(err instanceof OdooSessionExpiredError)) throw err;
      console.warn('[Odoo] Sesión expirada — reautenticando…');
      if (!this.reauthing) {
        this.reauthing = this.getSession(true).finally(() => { this.reauthing = null; });
      }
      return await this.odooRpc<T>(await this.reauthing, model, method, args, kwargs);
    }
  }

  async fetchInvoiceableOrders(): Promise<NormalizedInvoiceableOrder[]> {
    const ids = await this.odooCall<number[]>(
      'sale.order',
      'search',
      [[['invoice_status', '=', 'to invoice'], ['state', 'in', ['sale', 'done']]]],
      { limit: 500, order: 'commitment_date asc, date_order asc' },
    );
    if (!ids.length) return [];

    const orders = await this.odooCall<RawOrder[]>('sale.order', 'read', [ids], {
      fields: [
        'name', 'client_order_ref', 'partner_id', 'date_order', 'commitment_date',
        'invoice_status', 'currency_id', 'order_line', 'state', 'user_id', 'note',
      ],
    });

    const allLineIds = orders.flatMap(o => o.order_line);
    const linesMap = new Map<number, RawLine>();
    for (let i = 0; i < allLineIds.length; i += 500) {
      const batch = await this.odooCall<RawLine[]>('sale.order.line', 'read', [allLineIds.slice(i, i + 500)], {
        fields: ['name', 'display_type', 'product_uom_qty', 'qty_delivered'],
      });
      batch.forEach(line => linesMap.set(line.id, line));
    }

    const orderNameToId = new Map(orders.map(o => [o.name, o.id]));
    const pickingsByOrder = new Map<number, RawPicking[]>();
    try {
      const pickings = await this.odooCall<RawPicking[]>('stock.picking', 'search_read',
        [[['origin', 'in', orders.map(o => o.name)], ['picking_type_code', '=', 'outgoing']]],
        { fields: ['name', 'origin', 'state', 'date_done'], limit: 5000 },
      );
      for (const picking of pickings) {
        const saleId = typeof picking.origin === 'string' ? orderNameToId.get(picking.origin) : undefined;
        if (!saleId) continue;
        if (!pickingsByOrder.has(saleId)) pickingsByOrder.set(saleId, []);
        pickingsByOrder.get(saleId)!.push(picking);
      }
    } catch {
      /* remisiones opcionales */
    }

    const movesBySaleLine = new Map<number, number>();
    let fetchedMoves = false;
    try {
      const lineIds = Array.from(linesMap.keys());
      for (let i = 0; i < lineIds.length; i += 500) {
        const moves = await this.odooCall<RawMove[]>('stock.move', 'search_read',
          [[['sale_line_id', 'in', lineIds.slice(i, i + 500)], ['state', '=', 'done'], ['picking_code', '=', 'outgoing']]],
          { fields: ['sale_line_id', 'quantity_done'], limit: 10000 },
        );
        for (const move of moves) {
          const lineId = Array.isArray(move.sale_line_id) ? move.sale_line_id[0] : null;
          if (lineId) {
            movesBySaleLine.set(lineId, (movesBySaleLine.get(lineId) ?? 0) + move.quantity_done);
          }
        }
      }
      fetchedMoves = true;
    } catch {
      /* movimientos opcionales */
    }

    return orders.map(order => {
      const lines = order.order_line
        .map(id => linesMap.get(id))
        .filter((line): line is RawLine => !!line && !line.display_type);
      const totalQty = lines.reduce((sum, line) => sum + line.product_uom_qty, 0);
      const deliveredQty = lines.reduce((sum, line) =>
        sum + (fetchedMoves ? (movesBySaleLine.get(line.id) ?? 0) : line.qty_delivered), 0);

      return {
        id: order.id,
        name: order.name,
        customer_reference: typeof order.client_order_ref === 'string' ? order.client_order_ref : null,
        partner_name: order.partner_id ? order.partner_id[1] : 'Desconocido',
        main_product: lines[0]?.name ?? 'Sin descripción',
        date_order: order.date_order,
        commitment_date: order.commitment_date || null,
        invoice_status: order.invoice_status,
        currency: order.currency_id ? order.currency_id[1] : 'MXN',
        qty_total: totalQty,
        qty_delivered: deliveredQty,
        state: order.state,
        salesperson: order.user_id ? order.user_id[1] : null,
        note: typeof order.note === 'string' ? order.note : null,
        lines_count: lines.length,
        lines: lines.map(line => ({
          name: line.name,
          qty: line.product_uom_qty,
          delivered: fetchedMoves ? (movesBySaleLine.get(line.id) ?? 0) : line.qty_delivered,
        })),
        deliveries: (pickingsByOrder.get(order.id) ?? []).map(picking => ({
          name: picking.name,
          state: picking.state,
          date_done: typeof picking.date_done === 'string' ? picking.date_done : null,
        })),
      };
    });
  }

  async fetchOrderReportByReference(reference: string): Promise<NormalizedOrderReport | null> {
    const normalizedReference = reference.trim();
    if (!normalizedReference) return null;

    const exactDomain = [
      '|',
      ['name', '=', normalizedReference],
      ['client_order_ref', '=', normalizedReference],
    ];
    const fuzzyDomain = [
      '|',
      ['name', 'ilike', normalizedReference],
      ['client_order_ref', 'ilike', normalizedReference],
    ];

    let ids = await this.odooCall<number[]>(
      'sale.order',
      'search',
      [exactDomain],
      { limit: 1, order: 'date_order desc' },
    );
    if (!ids.length) {
      ids = await this.odooCall<number[]>(
        'sale.order',
        'search',
        [fuzzyDomain],
        { limit: 1, order: 'date_order desc' },
      );
    }
    if (!ids.length) return null;

    const orders = await this.odooCall<RawOrder[]>('sale.order', 'read', [ids], {
      fields: ['name', 'client_order_ref', 'partner_id', 'date_order', 'order_line', 'note'],
    });
    const order = orders[0];
    if (!order) return null;

    const lineIds = order.order_line;
    const lines = lineIds.length
      ? await this.odooCall<RawLine[]>('sale.order.line', 'read', [lineIds], {
          fields: ['name', 'display_type', 'product_uom_qty'],
        })
      : [];
    const productLines = lines.filter(line => !line.display_type);
    const quantity = productLines.reduce((sum, line) => sum + line.product_uom_qty, 0);

    return {
      id: order.id,
      reference: order.name,
      customerReference: typeof order.client_order_ref === 'string' ? order.client_order_ref : null,
      customerName: order.partner_id ? order.partner_id[1] : 'Desconocido',
      createdAt: order.date_order,
      quantity,
      description: productLines.map(line => line.name).join('\n') || 'Sin descripción',
      terms: typeof order.note === 'string' ? order.note : null,
      lines: productLines.map(line => ({ name: line.name, qty: line.product_uom_qty })),
    };
  }
}
