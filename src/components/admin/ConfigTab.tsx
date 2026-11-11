/** Configuración del Admin: horarios de entrega y (para editores) quién tiene acceso. */
import type { OdooSaleOrder } from '../../services/odoo';
import { useCanEditSchedules } from '../../hooks/useCanEditSchedules';
import ScheduleList from './ScheduleList';
import TeamAccess from './TeamAccess';

export default function ConfigTab({ orders }: { orders: readonly OdooSaleOrder[] }) {
  const { loading, canEdit } = useCanEditSchedules();
  return (
    <div className="space-y-10">
      <ScheduleList orders={orders} canEdit={canEdit} permissionLoading={loading} />
      {canEdit && <TeamAccess />}
    </div>
  );
}
