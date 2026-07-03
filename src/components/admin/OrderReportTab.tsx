import DOMPurify from 'dompurify';
import { format } from 'date-fns';
import { FileText, Printer } from 'lucide-react';
import { OdooSaleOrder, parseOdooDate } from '../../services/odoo';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface OrderReportTabProps {
  orders: OdooSaleOrder[];
}

function formatDate(value: string): string {
  const date = parseOdooDate(value);
  return date ? format(date, 'dd/MM/yyyy HH:mm') : 'Sin fecha';
}

export default function OrderReportTab({ orders }: OrderReportTabProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      <Card className="order-report-no-print">
        <CardHeader>
          <CardTitle>Reporte de órdenes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono-data text-3xl font-bold text-foreground">{orders.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Órdenes incluidas en el reporte — respeta los filtros activos en la pestaña Órdenes.
            </p>
          </div>
          <Button type="button" onClick={handlePrint} disabled={orders.length === 0}>
            <Printer /> Imprimir / PDF
          </Button>
        </CardContent>
      </Card>

      {orders.length === 0 ? (
        <Card className="order-report-no-print min-h-[360px]">
          <CardContent className="flex min-h-[360px] flex-col items-center justify-center text-center text-muted-foreground">
            <FileText className="mb-3 size-10 text-primary" />
            <p className="font-semibold text-foreground">No hay órdenes que coincidan con los filtros actuales.</p>
            <p className="mt-1 max-w-md text-sm">
              Ajusta los filtros en la pestaña Órdenes para incluir órdenes en este reporte.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="order-report-printable space-y-4">
          {orders.map(order => (
            <OrderReportCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderReportCard({ order }: { order: OdooSaleOrder }) {
  const sanitizedTerms = DOMPurify.sanitize(order.note || '<p>Sin términos registrados.</p>');

  return (
    <Card className="order-report-card">
      <CardHeader className="border-b border-border">
        <p className="font-mono-data text-xs uppercase tracking-wider text-muted-foreground">Reporte de orden</p>
        <CardTitle className="mt-1 font-mono-data text-2xl">{order.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReportField label="Referencia" value={order.name} mono />
          <ReportField label="Cliente / nombre" value={order.partner_name} />
          <ReportField label="Creado el" value={formatDate(order.date_order)} mono />
          <ReportField label="Cantidad" value={String(order.qty_total)} mono />
        </div>

        {order.customer_reference && (
          <ReportField label="Referencia del cliente" value={order.customer_reference} mono />
        )}

        <section>
          <h3 className="mb-2 font-mono-data text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Descripción
          </h3>
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{order.main_product}</p>
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-mono-data text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Líneas
          </h3>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 font-mono-data text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Descripción</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {order.lines.map((line, index) => (
                  <tr key={`${line.name}-${index}`}>
                    <td className="px-3 py-2 text-foreground/90">{line.name}</td>
                    <td className="px-3 py-2 text-right font-mono-data tabular-nums">{line.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-mono-data text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Términos y condiciones
          </h3>
          <div
            className="prose prose-invert max-w-none rounded-xl border border-border bg-background/50 p-4 text-sm leading-6 text-foreground/90"
            dangerouslySetInnerHTML={{ __html: sanitizedTerms }}
          />
        </section>
      </CardContent>
    </Card>
  );
}

function ReportField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold text-foreground ${mono ? 'font-mono-data tabular-nums' : ''}`}>
        {value}
      </p>
    </div>
  );
}
