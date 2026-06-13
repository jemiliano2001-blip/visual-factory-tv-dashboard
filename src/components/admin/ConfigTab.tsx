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
import { Plus, Edit2, Trash2, X, Clock } from 'lucide-react';

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
      setIsModalOpen(false);
      setEditing(null);
      setFormData({});
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" /> Horarios de Entrega
          </h3>
          <p className="text-zinc-500 text-sm">Configuración por empresa — visible en la TV</p>
        </div>
        <button
          onClick={() => { setEditing(null); setFormData({}); setIsModalOpen(true); }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-sm transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nuevo horario
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {configs.length === 0 ? (
          <p className="text-zinc-500 col-span-full text-center py-8">No hay horarios configurados</p>
        ) : (
          configs.map(config => (
            <div key={config.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 group hover:border-blue-500/30 transition-all">
              <div className="flex items-start justify-between">
                <h4 className="font-bold text-white">{config.company_name}</h4>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setEditing(config); setFormData(config); setIsModalOpen(true); }}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(config.id!)}
                    className="p-1.5 hover:bg-red-500/20 rounded-lg text-zinc-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-zinc-400 mt-2">{config.delivery_schedule}</p>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-zinc-900 border border-white/10 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">{editing ? 'Editar Horario' : 'Nuevo Horario'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-zinc-400 mb-2">Empresa</label>
                <select
                  value={formData.company_name || ''}
                  onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                  required
                >
                  <option value="" disabled>Selecciona una empresa</option>
                  {editing && !companyNames.includes(editing.company_name) && (
                    <option value={editing.company_name}>{editing.company_name}</option>
                  )}
                  {companyNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-400 mb-2">Horario de entrega</label>
                <input
                  type="text"
                  placeholder="Lunes a Viernes: 08:00 - 17:00"
                  value={formData.delivery_schedule || ''}
                  onChange={e => setFormData({ ...formData, delivery_schedule: e.target.value })}
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-sm transition-colors"
                >
                  {editing ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
