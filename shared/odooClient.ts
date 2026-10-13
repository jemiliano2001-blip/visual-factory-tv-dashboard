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
  product_uom: [number, string] | false;
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
  id: number;
  sale_line_id: [number, string] | false;
  quantity_done: number;
  product_uom: [number, string];
  origin_returned_move_id: [number, string] | false;
}

interface RawUom {
  id: number;
  factor: number;
  category_id: [number, string];
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
  lines: Array<{ name: string; qty: number; delivered: number; unit: string }>;
  deliveries: Array<{ name: string; state: string; date_done: string | null }>;
  delivery_times: string | null;
  show_in_dashboard: boolean;
}

/** Tope de órdenes por consulta; si Odoo tiene más, la respuesta lo avisa con `truncated`. */
const MAX_INVOICEABLE_ORDERS = 1000;

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

  private ordersCache: { at: number; promise: ReturnType<OdooClient['fetchInvoiceableOrders']> } | null = null;

  /**
   * Igual que fetchInvoiceableOrders, pero varias pantallas/pestañas dentro de la
   * ventana `ttlMs` comparten una sola consulta a Odoo (también las simultáneas).
   * Un fallo no se cachea.
   */
  fetchInvoiceableOrdersCached(ttlMs = 60_000): ReturnType<OdooClient['fetchInvoiceableOrders']> {
    const cached = this.ordersCache;
    if (cached && Date.now() - cached.at < ttlMs) return cached.promise;
    const promise = this.fetchInvoiceableOrders();
    this.ordersCache = { at: Date.now(), promise };
    promise.catch(() => {
      if (this.ordersCache?.promise === promise) this.ordersCache = null;
    });
    return promise;
  }

  async fetchInvoiceableOrders(): Promise<{ orders: NormalizedInvoiceableOrder[]; truncated: boolean }> {
    const found = await this.odooCall<number[]>(
      'sale.order',
      'search',
      [[['invoice_status', 'in', ['to invoice', 'partially_invoiced']], ['state', 'in', ['sale', 'done']]]],
      { limit: MAX_INVOICEABLE_ORDERS + 1, order: 'commitment_date asc, date_order asc' },
    );
    // Se pide una de más para detectar el recorte sin una llamada extra a Odoo.
    const truncated = found.length > MAX_INVOICEABLE_ORDERS;
    const ids = truncated ? found.slice(0, MAX_INVOICEABLE_ORDERS) : found;
    if (!ids.length) return { orders: [], truncated: false };

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
        fields: ['name', 'display_type', 'product_uom_qty', 'product_uom'],
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

    // Los traslados en Hecho son la fuente de entrega. Nunca sustituir un fallo
    // por qty_delivered de la venta: ese resumen puede discrepar de las remisiones.
    const lineIds = Array.from(linesMap.keys());
    const outgoingMoves: RawMove[] = [];
    for (let i = 0; i < lineIds.length; i += 500) {
      outgoingMoves.push(...await this.readDoneMoves([
        ['sale_line_id', 'in', lineIds.slice(i, i + 500)], ['picking_code', '=', 'outgoing'],
      ]));
    }
    const outgoingById = new Map(outgoingMoves.map(move => [move.id, move]));
    const returnMoves: RawMove[] = [];
    const outgoingIds = Array.from(outgoingById.keys());
    for (let i = 0; i < outgoingIds.length; i += 500) {
      returnMoves.push(...await this.readDoneMoves([
        ['origin_returned_move_id', 'in', outgoingIds.slice(i, i + 500)], ['picking_code', '=', 'incoming'],
      ]));
    }
    const uomIds = Array.from(new Set([
      ...Array.from(linesMap.values()).flatMap(line => line.product_uom ? [line.product_uom[0]] : []),
      ...outgoingMoves.map(move => move.product_uom[0]),
      ...returnMoves.map(move => move.product_uom[0]),
    ]));
    const uoms = new Map<number, RawUom>();
    for (let i = 0; i < uomIds.length; i += 500) {
      const batch = await this.odooCall<RawUom[]>('uom.uom', 'read', [uomIds.slice(i, i + 500)], {
        fields: ['factor', 'category_id'],
      });
      batch.forEach(unit => uoms.set(unit.id, unit));
    }
    const movesBySaleLine = new Map<number, number>();
    const addMove = (move: RawMove, sign: number, lineId: number | undefined) => {
      const line = lineId === undefined ? undefined : linesMap.get(lineId);
      if (!line || line.display_type) return;
      if (!line.product_uom) throw new Error('Falta la unidad de una partida de Odoo');
      let quantity = move.quantity_done;
      if (move.product_uom[0] !== line.product_uom[0]) {
        const from = uoms.get(move.product_uom[0]);
        const to = uoms.get(line.product_uom[0]);
        if (!from || !to || from.factor <= 0 || to.factor <= 0 || from.category_id[0] !== to.category_id[0]) {
          throw new Error('No se pueden convertir las unidades de un traslado de Odoo');
        }
        quantity = quantity / from.factor * to.factor;
      }
      movesBySaleLine.set(line.id, (movesBySaleLine.get(line.id) ?? 0) + sign * quantity);
    };
    for (const move of outgoingMoves) addMove(move, 1, move.sale_line_id ? move.sale_line_id[0] : undefined);
    for (const move of returnMoves) {
      const original = move.origin_returned_move_id ? outgoingById.get(move.origin_returned_move_id[0]) : undefined;
      addMove(move, -1, original?.sale_line_id ? original.sale_line_id[0] : undefined);
    }
    // Quitar solo el residuo de la aritmética binaria, sin redondear piezas reales.
    for (const [lineId, quantity] of movesBySaleLine) {
      movesBySaleLine.set(lineId, Number(Math.max(0, quantity).toPrecision(15)));
    }

    const partnerIds = Array.from(new Set(
      orders
        .map(o => (Array.isArray(o.partner_id) ? o.partner_id[0] : null))
        .filter((id): id is number => typeof id === 'number')
    ));

    interface RawPartner {
      id: number;
      name: string;
      delivery_times?: string | false;
      show_in_dashboard?: boolean;
    }

    const partnersMap = new Map<number, RawPartner>();
    if (partnerIds.length > 0) {
      try {
        for (let i = 0; i < partnerIds.length; i += 500) {
          const batch = await this.odooCall<RawPartner[]>('res.partner', 'read', [partnerIds.slice(i, i + 500)], {
            fields: ['id', 'name', 'delivery_times', 'show_in_dashboard'],
          });
          batch.forEach(p => partnersMap.set(p.id, p));
        }
      } catch (err) {
        console.warn('[Odoo] Error al obtener datos de partner (delivery_times / show_in_dashboard):', err);
      }
    }

    const normalized = orders.map(order => {
      const lines = order.order_line
        .map(id => linesMap.get(id))
        .filter((line): line is RawLine => !!line && !line.display_type);
      const totalQty = lines.reduce((sum, line) => sum + line.product_uom_qty, 0);
      const deliveredQty = lines.reduce((sum, line) =>
        sum + Math.max(0, movesBySaleLine.get(line.id) ?? 0), 0);

      const partnerId = Array.isArray(order.partner_id) ? order.partner_id[0] : null;
      const partnerInfo = partnerId ? partnersMap.get(partnerId) : undefined;
      const deliveryTimes = typeof partnerInfo?.delivery_times === 'string' && partnerInfo.delivery_times.trim()
        ? partnerInfo.delivery_times.trim()
        : null;
      const showInDashboard = Boolean(partnerInfo?.show_in_dashboard);

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
          delivered: Math.max(0, movesBySaleLine.get(line.id) ?? 0),
          unit: line.product_uom ? line.product_uom[1] : '',
        })),
        deliveries: (pickingsByOrder.get(order.id) ?? []).map(picking => ({
          name: picking.name,
          state: picking.state,
          date_done: typeof picking.date_done === 'string' ? picking.date_done : null,
        })),
        delivery_times: deliveryTimes,
        show_in_dashboard: showInDashboard,
      };
    });

    return { orders: normalized, truncated };
  }

  private async readDoneMoves(domain: unknown[]): Promise<RawMove[]> {
    const result: RawMove[] = [];
    const limit = 1000;
    for (let offset = 0; ; offset += limit) {
      const batch = await this.odooCall<RawMove[]>('stock.move', 'search_read',
        [[...domain, ['state', '=', 'done'], ['picking_id.state', '=', 'done']]],
        { fields: ['sale_line_id', 'quantity_done', 'product_uom', 'origin_returned_move_id'], limit, offset, order: 'id asc' },
      );
      result.push(...batch);
      if (batch.length < limit) return result;
    }
  }
}
