import React from 'react';
import { formatCustomerPo, getCustomerPo } from '../services/customerPo';

interface CustomerPoProps {
  /** `customer_reference` de Odoo (`client_order_ref`). Solo lectura. */
  reference: string | null | undefined;
  className?: string;
  /** Prefijo visible; por defecto «PO: ». */
  prefix?: string;
  as?: 'div' | 'p' | 'span';
}

/**
 * PO del cliente junto al SO. Siempre se pinta: si Odoo no trae PO muestra «—»
 * para que el hueco se vea. No es editable (fuente única: Odoo).
 */
export function CustomerPo({ reference, className, prefix = 'PO: ', as = 'div' }: CustomerPoProps) {
  const po = getCustomerPo(reference);
  const Tag = as;
  return (
    <Tag
      className={className}
      title={po ? `PO del cliente: ${po}` : 'Sin PO del cliente en Odoo'}
      data-customer-po={po ?? ''}
    >
      {prefix}{formatCustomerPo(reference)}
    </Tag>
  );
}

export default CustomerPo;
