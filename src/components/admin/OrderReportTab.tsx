import { format } from 'date-fns';
import { OdooSaleOrder, parseOdooDate } from '../../services/odoo';
import { abbreviate } from '../../utils/abbreviate';
import { extractOrderNoteMeta } from '../../services/orderNoteParser';
import { Card, CardContent } from '../ui/card';

interface OrderReportTabProps {
  orders: OdooSaleOrder[];
  getEngineerName: (order: OdooSaleOrder) => string | null;
}

function formatDate(value: string): string {
  const date = parseOdooDate(value);
  return date ? format(date, 'dd/MM/yyyy') : 'Sin fecha';
}

/** Corta a `max` caracteres con elipsis solo cuando realmente corta. */
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

/** Tabla formal para imprimir / PDF; AdminPanel la monta oculta en pantalla (`hidden print:block`). */
export default function OrderReportTab({ orders, getEngineerName }: OrderReportTabProps) {
  const groups = new Map<string, OdooSaleOrder[]>();
  for (const order of orders) {
    const list = groups.get(order.partner_name) ?? [];
    list.push(order);
    groups.set(order.partner_name, list);
  }

  if (orders.length === 0) return null;

  return (
    <Card className="order-report-printable">
      <CardContent className="pt-5">
        <div className="mb-4 border-b border-border pb-3 text-center">
          <h2 className="text-lg font-bold text-foreground">
            Reporte de órdenes al {format(new Date(), 'dd/MM/yyyy')}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {orders.length} órdenes · {groups.size} clientes
          </p>
        </div>
        <table className="order-report-table w-full text-sm">
          <thead>
            <tr className="border-b-2 border-border text-xs font-medium text-muted-foreground">
              <th className="px-2 py-1.5 text-left">Referencia</th>
              <th className="px-2 py-1.5 text-left">PO / Requisitor</th>
              <th className="px-2 py-1.5 text-left">Ingeniero SMV</th>
              <th className="px-2 py-1.5 text-left">Creado el</th>
              <th className="px-2 py-1.5 text-right">Cant.</th>
              <th className="px-2 py-1.5 text-left">Descripción</th>
              <th className="px-2 py-1.5 text-left">Términos y condiciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Array.from(groups.entries()).map(([client, clientOrders]) => (
              <ClientGroup key={client} client={client} orders={clientOrders} getEngineerName={getEngineerName} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ClientGroup({ client, orders, getEngineerName }: {
  client: string;
  orders: OdooSaleOrder[];
  getEngineerName: (order: OdooSaleOrder) => string | null;
}) {
  return (
    <>
      <tr className="order-report-group bg-muted/50">
        <td colSpan={7} className="px-2 py-1.5 font-bold text-foreground">
          {client} ({orders.length})
        </td>
      </tr>
      {orders.map(order => {
        const { poNumber, clientContact, cleanNote } = extractOrderNoteMeta(order);
        return (
        <tr key={order.id} className="align-top">
          <td className="whitespace-nowrap px-2 py-1.5 font-mono-data">{order.name}</td>
          <td className="px-2 py-1.5 font-mono-data">
            {poNumber ? `PO.${poNumber}` : 'Sin PO'}
            {clientContact && <div className="text-xs text-muted-foreground">Req: {clientContact}</div>}
          </td>
          <td className="px-2 py-1.5">{getEngineerName(order) ?? 'Sin asignar'}</td>
          <td className="whitespace-nowrap px-2 py-1.5 font-mono-data">{formatDate(order.date_order)}</td>
          <td className="px-2 py-1.5 text-right font-mono-data tabular-nums">{order.qty_total}</td>
          <td className="px-2 py-1.5 text-foreground/90">
            {abbreviate(order.main_product)}
            {order.lines_count > 1 && (
              <span className="text-muted-foreground"> (+{order.lines_count - 1} líneas más)</span>
            )}
          </td>
          <td className="px-2 py-1.5 text-xs text-muted-foreground">
            {truncate(abbreviate(cleanNote), 90)}
          </td>
        </tr>
        );
      })}
    </>
  );
}
