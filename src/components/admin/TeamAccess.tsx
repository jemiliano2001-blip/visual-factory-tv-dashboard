/** Quién tiene acceso al dashboard y quién puede editar horarios. Solo lectura: el acceso se administra en SMV Hub. */
import { ShieldCheck } from 'lucide-react';
import { useTeamAccess } from '../../hooks/useTeamAccess';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';

export default function TeamAccess() {
  const { data, isPending, error } = useTeamAccess();

  return (
    <section className="space-y-4" aria-labelledby="team-access-title">
      <div>
        <h3 id="team-access-title" className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <ShieldCheck className="size-5 text-primary" /> Acceso del equipo
        </h3>
        <p className="text-sm text-muted-foreground">
          El acceso se administra en SMV Hub. Aquí solo se consulta quién entra y quién puede editar horarios.
        </p>
      </div>

      {isPending ? (
        <p role="status" className="py-4 text-muted-foreground">Cargando equipo…</p>
      ) : error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : !data.available ? (
        <p className="py-4 text-muted-foreground">No disponible en el servidor local; la lista solo existe en producción.</p>
      ) : data.members.length === 0 ? (
        <p className="py-4 text-muted-foreground">No se encontró a nadie.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.members.map((m, i) => (
            <li key={`${m.name}-${i}`}>
              <Card className="space-y-2 p-4">
                <p className="break-words font-bold text-foreground">{m.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={m.active ? 'success' : 'muted'}>{m.active ? 'Acceso: sí' : 'Acceso: no'}</Badge>
                  <Badge variant={m.canEditSchedules ? 'info' : 'muted'}>
                    {m.canEditSchedules ? 'Edita horarios: sí' : 'Edita horarios: no'}
                  </Badge>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
