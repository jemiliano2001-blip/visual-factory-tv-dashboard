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

  useEffect(() => {
    const unsub = subscribeToCompanyConfigs(setConfigs);
    return () => unsub();
  }, []);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setFormData({});
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_name || !formData.delivery_schedule) return;
    try {
      const cleanData = {
        company_name: formData.company_name,
        delivery_schedule: formData.delivery_schedule,
      };
      if (editing?.id) {
        await updateCompanyConfig(editing.id, cleanData);
      } else {
        await createCompanyConfig(cleanData);
      }
      closeModal();
    } catch (error) {
      console.error('Error guardando configuración', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar este horario?')) return;
    try {
      await deleteCompanyConfig(id);
    } catch (error) {
      console.error('Error eliminando configuración', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-lg font-bold text-foreground">
            <Clock className="size-5 text-primary" /> Horarios de Entrega
          </h3>
          <p className="text-sm text-muted-foreground">Configuración por empresa — visible en la TV</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormData({}); setIsModalOpen(true); }}>
          <Plus /> Nuevo horario
        </Button>
      </div>

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
                    onClick={() => { setEditing(config); setFormData(config); setIsModalOpen(true); }}
                    aria-label="Editar horario"
                  >
                    <Edit2 />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(config.id!)}
                    aria-label="Eliminar horario"
                    className="hover:text-destructive"
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
            <DialogDescription>Se mostrará en las tarjetas de la TV para esta empresa.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select
                value={formData.company_name || undefined}
                onValueChange={v => setFormData({ ...formData, company_name: v })}
              >
                <SelectTrigger>
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
              <Label>Horario de entrega</Label>
              <Input
                placeholder="Lunes a Viernes: 08:00 - 17:00"
                value={formData.delivery_schedule || ''}
                onChange={e => setFormData({ ...formData, delivery_schedule: e.target.value })}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={closeModal}>Cancelar</Button>
              <Button type="submit">{editing ? 'Actualizar' : 'Crear'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
