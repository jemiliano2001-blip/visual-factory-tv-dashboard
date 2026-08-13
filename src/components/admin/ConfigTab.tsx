/**
 * CRUD de horarios de entrega por cliente (colección company_configs).
 * La TV lee esta colección para mostrar "Horario: ..." en sus tarjetas.
 */
import React, { useEffect, useState } from 'react';
import { CompanyConfig } from '../../types';
import {
  subscribeToCompanyConfigs, createCompanyConfig,
  updateCompanyConfig, deleteCompanyConfig
} from '../../services/companyConfigs';
import { hasDuplicateCompanyConfig } from '../../services/companyConfigGuards';
import { Plus, Edit2, Trash2, Clock } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card } from '../ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../ui/select';

interface ConfigTabProps {
  /** Nombres de cliente únicos (de las órdenes Odoo) para el selector */
  companyNames: string[];
}

export default function ConfigTab({ companyNames }: ConfigTabProps) {
  const [configs, setConfigs] = useState<CompanyConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyConfig | null>(null);
  const [formData, setFormData] = useState<Partial<CompanyConfig>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<CompanyConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToCompanyConfigs(setConfigs, (snapshotError) => {
      setError(snapshotError.message || 'No se pudieron cargar los horarios.');
    });
    return () => unsub();
  }, []);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setFormData({});
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_name || !formData.delivery_schedule || isSaving) return;
    if (hasDuplicateCompanyConfig(configs, formData.company_name, editing?.id)) {
      setError('Ya existe un horario para esta empresa. Edita el existente en lugar de crear otro.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const cleanData = {
        company_name: formData.company_name.trim(),
        delivery_schedule: formData.delivery_schedule.trim(),
      };
      if (editing?.id) {
        await updateCompanyConfig(editing.id, cleanData);
      } else {
        await createCompanyConfig(cleanData);
      }
      closeModal();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo guardar el horario.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate?.id || deletingId) return;
    setError(null);
    setDeletingId(deleteCandidate.id);
    try {
      await deleteCompanyConfig(deleteCandidate.id);
      setDeleteCandidate(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo eliminar el horario.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
            <Clock className="size-5 text-primary" /> Horarios de Entrega
          </h3>
          <p className="text-sm text-muted-foreground">Configuración operativa por empresa.</p>
        </div>
        <Button onClick={() => { setError(null); setEditing(null); setFormData({}); setIsModalOpen(true); }}>
          <Plus /> Nuevo horario
        </Button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {configs.length === 0 ? (
          <p className="col-span-full py-8 text-center text-muted-foreground">No hay horarios configurados</p>
        ) : (
          configs.map(config => (
            <Card key={config.id} className="group p-4 transition-colors hover:border-primary/30">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-bold text-foreground">{config.company_name}</h4>
                <div className="flex gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => { setError(null); setEditing(config); setFormData(config); setIsModalOpen(true); }}
                    aria-label="Editar horario"
                  >
                    <Edit2 />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteCandidate(config)}
                    aria-label="Eliminar horario"
                    className="min-h-11 min-w-11 hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{config.delivery_schedule}</p>
            </Card>
          ))
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={open => (open ? setIsModalOpen(true) : closeModal())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar horario' : 'Nuevo horario'}</DialogTitle>
            <DialogDescription>Asigna el horario operativo a una empresa sin duplicar su configuración.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-2">
              <Label id="company-name-label">Empresa</Label>
              <Select
                value={formData.company_name || undefined}
                onValueChange={v => setFormData({ ...formData, company_name: v })}
              >
                <SelectTrigger aria-labelledby="company-name-label">
                  <SelectValue placeholder="Selecciona una empresa" />
                </SelectTrigger>
                <SelectContent>
                  {editing && !companyNames.includes(editing.company_name) && (
                    <SelectItem value={editing.company_name}>{editing.company_name}</SelectItem>
                  )}
                  {companyNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-schedule">Horario de entrega</Label>
              <Input
                id="delivery-schedule"
                placeholder="Lunes a Viernes: 08:00 - 17:00"
                value={formData.delivery_schedule || ''}
                onChange={e => setFormData({ ...formData, delivery_schedule: e.target.value })}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={closeModal} disabled={isSaving}>Cancelar</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Guardando…' : editing ? 'Actualizar' : 'Crear'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteCandidate)} onOpenChange={open => { if (!open && !deletingId) setDeleteCandidate(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar horario</DialogTitle>
            <DialogDescription>Se eliminará el horario de {deleteCandidate?.company_name}. Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDeleteCandidate(null)} disabled={Boolean(deletingId)}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={Boolean(deletingId)}>{deletingId ? 'Eliminando…' : 'Eliminar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
